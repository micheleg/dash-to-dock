// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Shell = imports.gi.Shell;
const Signals = imports.signals;

// Use __ () and N__() for the extension gettext domain, and reuse
// the shell domain with the default _() and N_()
const Gettext = imports.gettext.domain('dashtodock');
const __ = Gettext.gettext;
const N__ = function(e) { return e };

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const Utils = Me.imports.utils;

const FILE_MANAGER_DESKTOP_APP_ID = 'org.gnome.Nautilus.desktop';
const TRASH_URI = 'trash://';
const UPDATE_TRASH_DELAY = 500;

const NautilusFileOperations2Interface = '<node>\
    <interface name="org.gnome.Nautilus.FileOperations2">\
        <method name="EmptyTrash">\
            <arg type="b" name="ask_confirmation" direction="in"/>\
            <arg type="a{sv}" name="platform_data" direction="in"/>\
        </method>\
    </interface>\
</node>';

const NautilusFileOperations2ProxyInterface = Gio.DBusProxy.makeProxyWrapper(NautilusFileOperations2Interface);

function makeNautilusFileOperationsProxy() {
    const proxy = new NautilusFileOperations2ProxyInterface(
        Gio.DBus.session,
        'org.gnome.Nautilus',
        '/org/gnome/Nautilus/FileOperations2', (_p, error) => {
            if (error)
                logError(error, 'Error connecting to Nautilus');
        }
    );

    proxy.platformData = params => {
        const defaultParams = {
            parentHandle: '',
            timestamp: global.get_current_time(),
            windowPosition: 'center',
        };
        const { parentHandle, timestamp, windowPosition } = {
            ...defaultParams,
            ...params,
        };

        return {
            'parent-handle': new GLib.Variant('s', parentHandle),
            'timestamp': new GLib.Variant('u', timestamp),
            'window-position': new GLib.Variant('s', windowPosition),
        };
    };

    return proxy;
}

function wrapWindowsBackedApp(shellApp) {
    if (shellApp._dtdData)
        throw new Error('%s has been already wrapped'.format(shellApp));

    shellApp._dtdData = {
        windows: [],
        methodInjections: new Utils.InjectionsHandler(),
        propertyInjections: new Utils.PropertyInjectionsHandler(),
        destroy: function () {
            this.windows = [];
            this.methodInjections.destroy();
            this.propertyInjections.destroy();
        }
    };

    const m = (...args) => shellApp._dtdData.methodInjections.add(shellApp, ...args);
    const p = (...args) => shellApp._dtdData.propertyInjections.add(shellApp, ...args);
    shellApp._mi = m;
    shellApp._pi = p;

    m('get_state', () =>
        shellApp.get_windows().length ? Shell.AppState.RUNNING : Shell.AppState.STOPPED);
    p('state', { get: () => shellApp.get_state() });

    m('get_windows', () => shellApp._dtdData.windows);
    m('get_n_windows', () => shellApp.get_windows().length);
    m('get_pids', () => shellApp.get_windows().reduce((pids, w) => {
        if (w.get_pid() > 0 && !pids.includes(w.get_pid()))
            pids.push(w.get_pid());
        return pids;
    }, []));
    m('is_on_workspace', (_om, workspace) => shellApp.get_windows().some(w =>
        w.get_workspace() === workspace));
    m('request_quit', () => shellApp.get_windows().filter(w =>
        w.can_close()).forEach(w => w.delete(global.get_current_time())));

    shellApp._updateWindows = function () {
        throw new GObject.NotImplementedError(`_updateWindows in ${this.constructor.name}`);
    };

    let updateWindowsIdle = GLib.idle_add(GLib.DEFAULT_PRIORITY, () => {
        shellApp._updateWindows();
        updateWindowsIdle = undefined;
        return GLib.SOURCE_REMOVE;
    });

    const windowTracker = Shell.WindowTracker.get_default();
    shellApp._checkFocused = function () {
        if (this.get_windows().some(w => w.has_focus())) {
            this.isFocused = true;
            windowTracker.notify('focus-app');
        } else if (this.isFocused) {
            this.isFocused = false;
            windowTracker.notify('focus-app');
        }
    }

    shellApp._checkFocused();
    const focusWindowNotifyId = global.display.connect('notify::focus-window', () =>
        shellApp._checkFocused());

    // Re-implements shell_app_activate_window for generic activation and alt-tab support
    m('activate_window', function (_om, window, timestamp) {
        if (!window)
            [window] = this.get_windows();
        else if (!this.get_windows().includes(window))
            return;

        const currentWorkspace = global.workspace_manager.get_active_workspace();
        const workspace = window.get_workspace();
        const sameWorkspaceWindows = this.get_windows().filter(w =>
            w.get_workspace() === workspace);
        sameWorkspaceWindows.forEach(w => w.raise());

        if (workspace !== currentWorkspace)
            workspace.activate_with_focus(window, timestamp);
        else
            window.activate(timestamp);
    });

    // Re-implements shell_app_activate_full for generic activation and dash support
    m('activate_full', function (_om, workspace, timestamp) {
        if (!timestamp)
            timestamp = global.get_current_time();

        switch (this.state) {
            case Shell.AppState.STOPPED:
                try {
                    this.launch(timestamp, workspace, Shell.AppLaunchGpu.APP_PREF);
                } catch (e) {
                    global.notify_error(__("Failed to launch “%s”".format(
                        this.get_name())), e.message);
                }
                break;
            case Shell.AppState.RUNNING:
                this.activate_window(null, timestamp);
                break;
        }
    });

    m('activate', () => shellApp.activate_full(-1, 0));

    m('compare', (_om, other) => shellAppCompare(shellApp, other));

    shellApp.destroy = function() {
        global.display.disconnect(focusWindowNotifyId);
        updateWindowsIdle && GLib.source_remove(updateWindowsIdle);
        this._dtdData.destroy();
        this._dtdData = undefined;
        this.destroy = undefined;
    }

    return shellApp;
}

// We can't inherit from Shell.App as it's a final type, so let's patch it
function makeLocationApp(params) {
    if (!params.location)
        throw new TypeError('Invalid location');

    location = params.location;
    delete params.location;

    const shellApp = new Shell.App(params);
    wrapWindowsBackedApp(shellApp);
    shellApp.appInfo.customId = 'location:%s'.format(location);

    Object.defineProperties(shellApp, {
        location: { value: location },
        isTrash: { value: location.startsWith(TRASH_URI) },
    });

    shellApp._mi('toString', defaultToString =>
        '[LocationApp - %s]'.format(defaultToString.call(shellApp)));

    // FIXME: We need to add a new API to Nautilus to open new windows
    shellApp._mi('can_open_new_window', () => false);

    const { fm1Client } = Docking.DockManager.getDefault();
    shellApp._updateWindows = function () {
        const oldState = this.state;
        const oldWindows = this.get_windows();
        this._dtdData.windows = fm1Client.getWindows(this.location);

        if (this.get_windows().length !== oldWindows.length ||
            this.get_windows().some((win, index) => win !== oldWindows[index]))
            this.emit('windows-changed');

        if (oldState !== this.state) {
            Shell.AppSystem.get_default().emit('app-state-changed', this);
            this.notify('state');
            this._checkFocused();
        }
    };

    const windowsChangedId = fm1Client.connect('windows-changed', () =>
        shellApp._updateWindows());

    const parentDestroy = shellApp.destroy;
    shellApp.destroy = function () {
        fm1Client.disconnect(windowsChangedId);
        parentDestroy.call(this);
    }

    return shellApp;
}

function getFileManagerApp() {
    return Shell.AppSystem.get_default().lookup_app(FILE_MANAGER_DESKTOP_APP_ID);
}

function wrapWindowsManagerApp() {
    const fileManagerApp = getFileManagerApp();
    if (!fileManagerApp)
        return null;

    if (fileManagerApp._dtdData)
        return fileManagerApp;

    const originalGetWindows = fileManagerApp.get_windows;
    wrapWindowsBackedApp(fileManagerApp);

    const { fm1Client } = Docking.DockManager.getDefault();
    const windowsChangedId = fileManagerApp.connect('windows-changed', () =>
        fileManagerApp._updateWindows());
    const fm1WindowsChangedId = fm1Client.connect('windows-changed', () =>
        fileManagerApp._updateWindows());

    fileManagerApp._updateWindows = function () {
        const oldState = this.state;
        const oldWindows = this.get_windows();
        const locationWindows = [];
        getRunningApps().forEach(a => locationWindows.push(...a.get_windows()));
        this._dtdData.windows = originalGetWindows.call(this).filter(w =>
            !locationWindows.includes(w));

        if (this.get_windows().length !== oldWindows.length ||
            this.get_windows().some((win, index) => win !== oldWindows[index])) {
            this.block_signal_handler(windowsChangedId);
            this.emit('windows-changed');
            this.unblock_signal_handler(windowsChangedId);
        }

        if (oldState !== this.state) {
            Shell.AppSystem.get_default().emit('app-state-changed', this);
            this.notify('state');
            this._checkFocused();
        }
    };

    fileManagerApp._mi('toString', defaultToString =>
        '[FileManagerApp - %s]'.format(defaultToString.call(fileManagerApp)));

    const parentDestroy = fileManagerApp.destroy;
    fileManagerApp.destroy = function () {
        fileManagerApp.disconnect(windowsChangedId);
        fm1Client.disconnect(fm1WindowsChangedId);
        parentDestroy.call(this);
    }

    return fileManagerApp;
}

function unWrapWindowsManagerApp() {
    const fileManagerApp = getFileManagerApp();
    if (!fileManagerApp || !fileManagerApp._dtdData)
        return;

    fileManagerApp.destroy();
}

// Re-implements shell_app_compare so that can be used to resort running apps
function shellAppCompare(app, other) {
    if (app.state !== other.state) {
        if (app.state === Shell.AppState.RUNNING)
            return -1;
        return 1;
    }

    const windows = app.get_windows();
    const otherWindows = other.get_windows();

    const isMinimized = windows => !windows.some(w => w.showing_on_its_workspace());
    const otherMinimized = isMinimized(otherWindows);
    if (isMinimized(windows) != otherMinimized) {
        if (otherMinimized)
            return -1;
        return 1;
    }

    if (app.state === Shell.AppState.RUNNING) {
        if (windows.length && !otherWindows.length)
            return -1;
        else if (!windows.length && otherWindows.length)
            return 1;

        const lastUserTime = windows =>
            Math.max(...windows.map(w => w.get_user_time()));
        return lastUserTime(otherWindows) - lastUserTime(windows);
    }

    return 0;
}

/**
 * This class maintains a Shell.App representing the Trash and keeps it
 * up-to-date as the trash fills and is emptied over time.
 */
var Trash = class DashToDock_Trash {
    _promisified = false;

    static initPromises() {
        if (Trash._promisified)
            return;

        Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');
        Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
        Gio._promisify(Gio.file_new_for_uri(TRASH_URI).constructor.prototype,
            'enumerate_children_async', 'enumerate_children_finish');
        Trash._promisified = true;
    }

    constructor() {
        Trash.initPromises();
        this._cancellable = new Gio.Cancellable();
        this._file = Gio.file_new_for_uri(TRASH_URI);
        try {
            this._monitor = this._file.monitor_directory(0, this._cancellable);
            this._signalId = this._monitor.connect(
                'changed',
                this._onTrashChange.bind(this)
            );
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            logError(e, 'Impossible to monitor trash');
        }
        this._empty = true;
        this._schedUpdateId = 0;
        this._updateTrash();
    }

    destroy() {
        this._cancellable.cancel();
        this._cancellable = null;
        this._monitor?.disconnect(this._signalId);
        this._monitor = null;
        this._file = null;
        this._trashApp?.destroy();
    }

    _onTrashChange() {
        if (this._schedUpdateId) {
            GLib.source_remove(this._schedUpdateId);
        }
        this._schedUpdateId = GLib.timeout_add(
            GLib.PRIORITY_LOW, UPDATE_TRASH_DELAY, () => {
            this._schedUpdateId = 0;
            this._updateTrash();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _updateTrash() {
        try {
            const priority = GLib.PRIORITY_LOW;
            const cancellable = this._cancellable;
            const childrenEnumerator = await this._file.enumerate_children_async(
                Gio.FILE_ATTRIBUTE_STANDARD_TYPE, Gio.FileQueryInfoFlags.NONE,
                priority, cancellable);
            const children = await childrenEnumerator.next_files_async(1,
                priority, cancellable);
            this._empty = !children.length;
            this._ensureApp();

            await childrenEnumerator.close_async(priority, null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, 'Impossible to enumerate trash children');
        }
    }

    _ensureApp() {
        if (this._trashApp == null ||
            this._lastEmpty !== this._empty) {
            let trashKeys = new GLib.KeyFile();
            trashKeys.set_string('Desktop Entry', 'Name', __('Trash'));
            trashKeys.set_string('Desktop Entry', 'Icon',
                                 this._empty ? 'user-trash' : 'user-trash-full');
            trashKeys.set_string('Desktop Entry', 'Type', 'Application');
            trashKeys.set_string('Desktop Entry', 'Exec', 'gio open %s'.format(TRASH_URI));
            trashKeys.set_string('Desktop Entry', 'StartupNotify', 'false');
            if (!this._empty) {
                trashKeys.set_string('Desktop Entry', 'Actions', 'empty-trash;');
                trashKeys.set_string('Desktop Action empty-trash', 'Name', __('Empty Trash'));
                trashKeys.set_string('Desktop Action empty-trash', 'Exec', 'true');
            }

            let trashAppInfo = Gio.DesktopAppInfo.new_from_keyfile(trashKeys);
            this._trashApp?.destroy();
            this._trashApp = makeLocationApp({
                location: TRASH_URI + '/',
                appInfo: trashAppInfo,
            });

            if (!this._empty) {
                this._trashApp._mi('launch_action',
                    (launchAction, actionName, timestamp, ...args) => {
                        if (actionName === 'empty-trash') {
                            const nautilus = makeNautilusFileOperationsProxy();
                            const askConfirmation = true;
                            nautilus.EmptyTrashRemote(askConfirmation,
                                nautilus.platformData({ timestamp }), (_p, error) => {
                                    if (error)
                                        logError(error, 'Empty trash failed');
                                });
                            return;
                        }

                        return launchAction.call(this, actionName, timestamp, ...args);
                });
            }
            this._lastEmpty = this._empty;

            this.emit('changed');
        }
    }

    getApp() {
        this._ensureApp();
        return this._trashApp;
    }
}
Signals.addSignalMethods(Trash.prototype);

/**
 * This class maintains Shell.App representations for removable devices
 * plugged into the system, and keeps the list of Apps up-to-date as
 * devices come and go and are mounted and unmounted.
 */
var Removables = class DashToDock_Removables {

    constructor() {
        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._monitor = Gio.VolumeMonitor.get();
        this._volumeApps = []
        this._mountApps = []

        this._monitor.get_volumes().forEach(
            (volume) => {
                this._onVolumeAdded(this._monitor, volume);
            }
        );

        this._monitor.get_mounts().forEach(
            (mount) => {
                this._onMountAdded(this._monitor, mount);
            }
        );

        this._signalsHandler.add([
            this._monitor,
            'mount-added',
            this._onMountAdded.bind(this)
        ], [
            this._monitor,
            'mount-removed',
            this._onMountRemoved.bind(this)
        ], [
            this._monitor,
            'volume-added',
            this._onVolumeAdded.bind(this)
        ], [
            this._monitor,
            'volume-removed',
            this._onVolumeRemoved.bind(this)
        ]);
    }

    destroy() {
        this._signalsHandler.destroy();
        this._monitor.run_dispose();
    }

    _getWorkingIconName(icon) {
        if (icon instanceof Gio.EmblemedIcon) {
            icon = icon.get_icon();
        }
        if (icon instanceof Gio.ThemedIcon) {
            const { iconTheme } = Docking.DockManager.getDefault();
            let names = icon.get_names();
            for (let i = 0; i < names.length; i++) {
                let iconName = names[i];
                if (iconTheme.has_icon(iconName)) {
                    return iconName;
                }
            }
            return '';
        } else {
            return icon.to_string();
        }
    }

    _onVolumeAdded(monitor, volume) {
        if (!volume.can_mount()) {
            return;
        }

        if (volume.get_identifier('class') == 'network') {
            return;
        }

        let activationRoot = volume.get_activation_root();
        if (!activationRoot) {
            // Can't offer to mount a device if we don't know
            // where to mount it.
            // These devices are usually ejectable so you
            // don't normally unmount them anyway.
            return;
        }

        let escapedUri = activationRoot.get_uri()
        let uri = GLib.uri_unescape_string(escapedUri, null);

        let volumeKeys = new GLib.KeyFile();
        volumeKeys.set_string('Desktop Entry', 'Name', volume.get_name());
        volumeKeys.set_string('Desktop Entry', 'Icon', this._getWorkingIconName(volume.get_icon()));
        volumeKeys.set_string('Desktop Entry', 'Type', 'Application');
        volumeKeys.set_string('Desktop Entry', 'Exec', 'gio open "' + uri + '"');
        volumeKeys.set_string('Desktop Entry', 'StartupNotify', 'false');
        volumeKeys.set_string('Desktop Entry', 'Actions', 'mount;');
        volumeKeys.set_string('Desktop Action mount', 'Name', __('Mount'));
        volumeKeys.set_string('Desktop Action mount', 'Exec', 'gio mount "' + uri + '"');
        let volumeAppInfo = Gio.DesktopAppInfo.new_from_keyfile(volumeKeys);
        const volumeApp = makeLocationApp({
            location: escapedUri,
            appInfo: volumeAppInfo,
        });
        this._volumeApps.push(volumeApp);
        this.emit('changed');
    }

    _onVolumeRemoved(monitor, volume) {
        for (let i = 0; i < this._volumeApps.length; i++) {
            let app = this._volumeApps[i];
            if (app.get_name() == volume.get_name()) {
                const [volumeApp] = this._volumeApps.splice(i, 1);
                volumeApp.destroy();
            }
        }
        this.emit('changed');
    }

    _onMountAdded(monitor, mount) {
        // Filter out uninteresting mounts
        if (!mount.can_eject() && !mount.can_unmount())
            return;
        if (mount.is_shadowed())
            return;

        let volume = mount.get_volume();
        if (!volume || volume.get_identifier('class') == 'network') {
            return;
        }

        const escapedUri = mount.get_default_location().get_uri()
        let uri = GLib.uri_unescape_string(escapedUri, null);

        let mountKeys = new GLib.KeyFile();
        mountKeys.set_string('Desktop Entry', 'Name', mount.get_name());
        mountKeys.set_string('Desktop Entry', 'Icon',
                             this._getWorkingIconName(volume.get_icon()));
        mountKeys.set_string('Desktop Entry', 'Type', 'Application');
        mountKeys.set_string('Desktop Entry', 'Exec', 'gio open "' + uri + '"');
        mountKeys.set_string('Desktop Entry', 'StartupNotify', 'false');
        mountKeys.set_string('Desktop Entry', 'Actions', 'unmount;');
        if (mount.can_eject()) {
            mountKeys.set_string('Desktop Action unmount', 'Name', __('Eject'));
            mountKeys.set_string('Desktop Action unmount', 'Exec',
                                 'gio mount -e "' + uri + '"');
        } else {
            mountKeys.set_string('Desktop Entry', 'Actions', 'unmount;');
            mountKeys.set_string('Desktop Action unmount', 'Name', __('Unmount'));
            mountKeys.set_string('Desktop Action unmount', 'Exec',
                                 'gio mount -u "' + uri + '"');
        }
        let mountAppInfo = Gio.DesktopAppInfo.new_from_keyfile(mountKeys);
        const mountApp = makeLocationApp({
            appInfo: mountAppInfo,
            location: escapedUri,
        });
        this._mountApps.push(mountApp);
        this.emit('changed');
    }

    _onMountRemoved(monitor, mount) {
        for (let i = 0; i < this._mountApps.length; i++) {
            let app = this._mountApps[i];
            if (app.get_name() == mount.get_name()) {
                const [mountApp] = this._mountApps.splice(i, 1);
                mountApp.destroy();
            }
        }
        this.emit('changed');
    }

    getApps() {
        // When we have both a volume app and a mount app, we prefer
        // the mount app.
        let apps = new Map();
        this._volumeApps.map(function(app) {
           apps.set(app.get_name(), app);
        });
        this._mountApps.map(function(app) {
           apps.set(app.get_name(), app);
        });

        return [...apps.values()];
    }
}
Signals.addSignalMethods(Removables.prototype);

function getRunningApps() {
    const dockManager = Docking.DockManager.getDefault();
    const locationApps = [];

    if (dockManager.removables)
        locationApps.push(...dockManager.removables.getApps());

    if (dockManager.trash)
        locationApps.push(dockManager.trash.getApp());

    return locationApps.filter(a => a.state === Shell.AppState.RUNNING);
}
