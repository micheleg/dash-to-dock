// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Shell = imports.gi.Shell;
const ShellMountOperation = imports.ui.shellMountOperation;
const Signals = imports.signals;
const St = imports.gi.St;

// Use __ () and N__() for the extension gettext domain, and reuse
// the shell domain with the default _() and N_()
const Gettext = imports.gettext.domain('dashtodock');
const __ = Gettext.gettext;
const N__ = function(e) { return e };

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const Utils = Me.imports.utils;

const FALLBACK_REMOVABLE_MEDIA_ICON = 'drive-removable-media';
const FALLBACK_TRASH_ICON = 'user-trash';
const FILE_MANAGER_DESKTOP_APP_ID = 'org.gnome.Nautilus.desktop';
const ATTRIBUTE_METADATA_CUSTOM_ICON = 'metadata::custom-icon';
const TRASH_URI = 'trash://';
const UPDATE_TRASH_DELAY = 1000;

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

var LocationAppInfo = GObject.registerClass({
    Implements: [Gio.AppInfo],
    Properties: {
        'location': GObject.ParamSpec.object(
            'location', 'location', 'location',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.File.$gtype),
        'name': GObject.ParamSpec.string(
            'name', 'name', 'name',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null),
        'icon': GObject.ParamSpec.object(
            'icon', 'icon', 'icon',
            GObject.ParamFlags.READWRITE,
            Gio.Icon.$gtype),
        'cancellable': GObject.ParamSpec.object(
            'cancellable', 'cancellable', 'cancellable',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Cancellable.$gtype),
    },
}, class LocationAppInfo extends Gio.DesktopAppInfo {
    list_actions() {
        return [];
    }

    get_action_name() {
        return null
    }

    get_boolean() {
        return false;
    }

    vfunc_dup() {
        return new LocationAppInfo({
            location: this.location,
            name: this.name,
            icon: this.icon,
            cancellable: this.cancellable,
        });
    }

    vfunc_equal(other) {
        if (this.location)
            return this.location.equal(other?.location);

        return this.name === other.name &&
            (this.icon ? this.icon.equal(other?.icon) : !other?.icon);
    }

    vfunc_get_id() {
        return 'location:%s'.format(this.location?.get_uri());
    }

    vfunc_get_name() {
        return this.name;
    }

    vfunc_get_description() {
        return null;
    }

    vfunc_get_executable() {
        return null;
    }

    vfunc_get_icon() {
        return this.icon;
    }

    vfunc_launch(files, context) {
        if (files?.length) {
            throw new GLib.Error(Gio.IOErrorEnum,
                Gio.IOErrorEnum.NOT_SUPPORTED, 'Launching with files not supported');
        }

        const [ret] = GLib.spawn_async(null, this.get_commandline().split(' '),
            context?.get_environment() || null, GLib.SpawnFlags.SEARCH_PATH, null);
        return ret;
    }

    vfunc_supports_uris() {
        return false;
    }

    vfunc_supports_files() {
        return false;
    }

    vfunc_launch_uris(uris, context) {
        return this.launch(uris, context);
    }

    vfunc_should_show() {
        return true;
    }

    vfunc_set_as_default_for_type() {
        throw new GLib.Error(Gio.IOErrorEnum,
            Gio.IOErrorEnum.NOT_SUPPORTED, 'Not supported');
    }

    vfunc_set_as_default_for_extension() {
        throw new GLib.Error(Gio.IOErrorEnum,
            Gio.IOErrorEnum.NOT_SUPPORTED, 'Not supported');
    }

    vfunc_add_supports_type() {
        throw new GLib.Error(Gio.IOErrorEnum,
            Gio.IOErrorEnum.NOT_SUPPORTED, 'Not supported');
    }

    vfunc_can_remove_supports_type() {
        return false;
    }

    vfunc_remove_supports_type() {
        return false;
    }

    vfunc_can_delete() {
        return false;
    }

    vfunc_do_delete() {
        return false;
    }

    vfunc_get_commandline() {
        return 'gio open %s'.format(this.location?.get_uri());
    }

    vfunc_get_display_name() {
        return this.name;
    }

    vfunc_set_as_last_used_for_type() {
        throw new GLib.Error(Gio.IOErrorEnum,
            Gio.IOErrorEnum.NOT_SUPPORTED, 'Not supported');
    }

    vfunc_get_supported_types() {
        return [];
    }
});

const VolumeAppInfo = GObject.registerClass({
    Implements: [Gio.AppInfo],
    Properties: {
        'volume': GObject.ParamSpec.object(
            'volume', 'volume', 'volume',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Volume.$gtype),
    },
},
class VolumeAppInfo extends LocationAppInfo {
    _init(volume, cancellable = null) {
        super._init({
            volume,
            location: volume.get_activation_root(),
            name: volume.get_name(),
            icon: volume.get_icon(),
            cancellable,
        });
    }

    vfunc_dup() {
        return new VolumeAppInfo({
            volume: this.volume,
            cancellable: this.cancellable,
        });
    }

    vfunc_get_id() {
        const uuid = this.volume.get_uuid();
        return uuid ? 'volume:%s'.format(uuid) : super.vfunc_get_id();
    }

    vfunc_equal(other) {
        if (this.volume === other?.volume)
            return true;

        return this.get_id() === other?.get_id();
    }

    list_actions() {
        const actions = [];

        if (this.volume.can_mount())
            actions.push('mount');
        if (this.volume.can_eject())
            actions.push('eject');

        return actions;
    }

    get_action_name(action) {
        switch (action) {
            case 'mount':
                return __('Mount');
            case 'eject':
                return __('Eject');
            default:
                return null;
        }
    }

    async launchAction(action) {
        if (!this.list_actions().includes(action))
            throw new Error('Action %s is not supported by %s', action, this);

        const operation = new ShellMountOperation.ShellMountOperation(this.volume);
        try {
            if (action === 'mount') {
                await this.volume.mount(Gio.MountMountFlags.NONE, operation.mountOp,
                    this.cancellable);
            } else if (action === 'eject') {
                await this.volume.eject_with_operation(Gio.MountUnmountFlags.FORCE,
                    operation.mountOp, this.cancellable);
            }
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED)) {
                if (action === 'mount') {
                    global.notify_error(__("Failed to mount “%s”".format(
                        this.get_name())), e.message);
                } else if (action === 'eject') {
                    global.notify_error(__("Failed to eject “%s”".format(
                        this.get_name())), e.message);
                }
            }

            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                logError(e, 'Impossible to %s volume %s'.format(action,
                    this.volume.get_name()));
            }
        } finally {
            operation.close();
        }
    }
});

const MountAppInfo = GObject.registerClass({
    Implements: [Gio.AppInfo],
    Properties: {
        'mount': GObject.ParamSpec.object(
            'mount', 'mount', 'mount',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Mount.$gtype),
    },
},
class MountAppInfo extends LocationAppInfo {
    _init(mount, cancellable = null) {
        super._init({
            mount,
            location: mount.get_default_location(),
            name: mount.get_name(),
            icon: mount.get_icon(),
            cancellable,
        });
    }

    vfunc_dup() {
        return new MountAppInfo({
            mount: this.mount,
            cancellable: this.cancellable,
        });
    }

    vfunc_get_id() {
        const uuid = this.mount.get_uuid() ?? this.mount.get_volume()?.get_uuid();
        return uuid ? 'mount:%s'.format(uuid) : super.vfunc_get_id();
    }

    vfunc_equal(other) {
        if (this.mount === other?.mount)
            return true;

        return this.get_id() === other?.get_id();
    }

    list_actions() {
        const actions = [];

        if (this.mount.can_unmount())
            actions.push('unmount');
        if (this.mount.can_eject())
            actions.push('eject');

        return actions;
    }

    get_action_name(action) {
        switch (action) {
            case 'unmount':
                return __('Unmount');
            case 'eject':
                return __('Eject');
            default:
                return null;
        }
    }

    async launchAction(action) {
        if (!this.list_actions().includes(action))
            throw new Error('Action %s is not supported by %s', action, this);

        const operation = new ShellMountOperation.ShellMountOperation(this.mount);
        try {
            if (action === 'unmount') {
                await this.mount.unmount_with_operation(Gio.MountUnmountFlags.FORCE,
                    operation.mountOp, this.cancellable);
            } else if (action === 'eject') {
                await this.mount.eject_with_operation(Gio.MountUnmountFlags.FORCE,
                    operation.mountOp, this.cancellable);
            }
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED)) {
                if (action === 'unmount') {
                    global.notify_error(__("Failed to umount “%s”".format(
                        this.get_name())), e.message);
                } else if (action === 'eject') {
                    global.notify_error(__("Failed to eject “%s”".format(
                        this.get_name())), e.message);
                }
            }
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                logError(e, 'Impossible to %s mount %s'.format(action,
                    this.mount.get_name()));
            }
        } finally {
            operation.close();
        }
    }
});

const TrashAppInfo = GObject.registerClass({
    Implements: [Gio.AppInfo],
    Properties: {
        'empty': GObject.ParamSpec.boolean(
            'empty', 'empty', 'empty',
            GObject.ParamFlags.READWRITE,
            true),
    },
},
class TrashAppInfo extends LocationAppInfo {
    _init(cancellable = null) {
        super._init({
            location: Gio.file_new_for_uri(TRASH_URI),
            name: __('Trash'),
            cancellable,
        });
        this.connect('notify::empty', () =>
            (this.icon = Gio.ThemedIcon.new(this.empty ? 'user-trash' : 'user-trash-full')));
        this.notify('empty');
    }

    list_actions() {
        return this.empty ? [] : ['empty-trash'];
    }

    get_action_name(action) {
        switch (action) {
            case 'empty-trash':
                return __('Empty Trash');
            default:
                return null;
        }
    }

    launchAction(action, timestamp) {
        if (!this.list_actions().includes(action))
            throw new Error('Action %s is not supported by %s', action, this);

        const nautilus = makeNautilusFileOperationsProxy();
        const askConfirmation = true;
        nautilus.EmptyTrashRemote(askConfirmation,
            nautilus.platformData({ timestamp }), (_p, error) => {
                if (error)
                    logError(error, 'Empty trash failed');
        }, this.cancellable);
    }
});

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
                    global.notify_error(_("Failed to launch “%s”".format(
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
    if (!(params?.appInfo instanceof LocationAppInfo))
        throw new TypeError('Invalid location');

    const { fallbackIconName } = params;
    delete params.fallbackIconName;

    const shellApp = new Shell.App(params);
    wrapWindowsBackedApp(shellApp);

    Object.defineProperties(shellApp, {
        location: { get: () => shellApp.appInfo.location },
        isTrash: { get: () => shellApp.appInfo instanceof TrashAppInfo },
    });

    shellApp._mi('toString', defaultToString =>
        '[LocationApp - %s]'.format(defaultToString.call(shellApp)));

    shellApp._mi('launch', (_om, timestamp, workspace, _gpuPref) =>
        shellApp.appInfo.launch([],
            global.create_app_launch_context(timestamp, workspace)));

    shellApp._mi('launch_action', (_om, actionName, ...args) =>
        shellApp.appInfo.launchAction(actionName, ...args));

    shellApp._mi('create_icon_texture', (_om, iconSize) => new St.Icon({
        iconSize,
        gicon: shellApp.icon,
        fallbackIconName,
    }));

    // FIXME: We need to add a new API to Nautilus to open new windows
    shellApp._mi('can_open_new_window', () => false);

    const { fm1Client } = Docking.DockManager.getDefault();
    shellApp._updateWindows = function () {
        const oldState = this.state;
        const oldWindows = this.get_windows();
        this._dtdData.windows = fm1Client.getWindows(this.location?.get_uri());

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
    const workspaceChangedId = global.workspaceManager.connect('workspace-switched',
        () => shellApp.emit('windows-changed'));
    const iconChangedId = shellApp.appInfo.connect('notify::icon', () =>
        shellApp.notify('icon'));

    const parentDestroy = shellApp.destroy;
    shellApp.destroy = function () {
        fm1Client.disconnect(windowsChangedId);
        global.workspaceManager.disconnect(workspaceChangedId);
        shellApp.appInfo.disconnect(iconChangedId);
        parentDestroy.call(this);
    }

    return shellApp;
}

function getFileManagerApp() {
    return Shell.AppSystem.get_default().lookup_app(FILE_MANAGER_DESKTOP_APP_ID);
}

function wrapFileManagerApp() {
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

function unWrapFileManagerApp() {
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
            this._monitor.set_rate_limit(UPDATE_TRASH_DELAY);
            this._signalId = this._monitor.connect('changed', () => this._onTrashChange());
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            logError(e, 'Impossible to monitor trash');
        }
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
        if (this._schedUpdateId)
            return;

        if (this._monitor.is_cancelled())
            return;

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
            this._updateApp(!children.length);

            await childrenEnumerator.close_async(priority, null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, 'Impossible to enumerate trash children');
        }
    }

    _updateApp(isEmpty) {
        if (!this._trashApp)
            return

        this._trashApp.appInfo.empty = isEmpty;
    }

    _ensureApp() {
        if (this._trashApp)
            return;

        this._trashApp = makeLocationApp({
            appInfo: new TrashAppInfo(this._cancellable),
            fallbackIconName: FALLBACK_TRASH_ICON,
        });
    }

    getApp() {
        this._ensureApp();
        return this._trashApp;
    }
}

/**
 * This class maintains Shell.App representations for removable devices
 * plugged into the system, and keeps the list of Apps up-to-date as
 * devices come and go and are mounted and unmounted.
 */
var Removables = class DashToDock_Removables {

    _promisified = false;

    static initVolumePromises(object) {
        // TODO: This can be simplified using actual interface type when we
        // can depend on gjs 1.72
        if (!(object instanceof Gio.Volume) || object.constructor.prototype._d2dPromisified)
            return;

        Gio._promisify(object.constructor.prototype, 'mount', 'mount_finish');
        Gio._promisify(object.constructor.prototype, 'eject_with_operation',
            'eject_with_operation_finish');
        object.constructor.prototype._d2dPromisified = true;
    }

    static initMountPromises(object) {
        // TODO: This can be simplified using actual interface type when we
        // can depend on gjs 1.72
        if (!(object instanceof Gio.Mount) || object.constructor.prototype._d2dPromisified)
            return;

        Gio._promisify(object.constructor.prototype, 'eject_with_operation',
            'eject_with_operation_finish');
        Gio._promisify(object.constructor.prototype, 'unmount_with_operation',
            'unmount_with_operation_finish');
        object.constructor.prototype._d2dPromisified = true;
    }

    constructor() {
        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._monitor = Gio.VolumeMonitor.get();
        this._cancellable = new Gio.Cancellable();
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
        [...this._volumeApps, ...this._mountApps].forEach(a => a.destroy());
        this._volumeApps = [];
        this._mountApps = [];
        this._cancellable.cancel();
        this._cancellable = null;
        this._signalsHandler.destroy();
        this._monitor = null;
    }

    _onVolumeAdded(monitor, volume) {
        Removables.initVolumePromises(volume);

        if (volume.get_mount())
            return;

        if (!volume.can_mount() && !volume.can_eject()) {
            return;
        }

        if (volume.get_identifier('class') == 'network') {
            return;
        }

        if (!volume.get_activation_root()) {
            // Can't offer to mount a device if we don't know
            // where to mount it.
            // These devices are usually ejectable so you
            // don't normally unmount them anyway.
            return;
        }

        const appInfo = new VolumeAppInfo(volume, this._cancellable);
        const volumeApp = makeLocationApp({
            appInfo,
            fallbackIconName: FALLBACK_REMOVABLE_MEDIA_ICON,
        });
        this._volumeApps.push(volumeApp);
        this.emit('changed');
    }

    _onVolumeRemoved(monitor, volume) {
        const volumeIndex = this._volumeApps.findIndex(({ appInfo }) =>
            appInfo.volume === volume);
        if (volumeIndex !== -1) {
            const [volumeApp] = this._volumeApps.splice(volumeIndex, 1);
            volumeApp.destroy();
            this.emit('changed');
        }
    }

    _onMountAdded(monitor, mount) {
        Removables.initMountPromises(mount);

        // Filter out uninteresting mounts
        if (!mount.can_eject() && !mount.can_unmount())
            return;
        if (mount.is_shadowed())
            return;

        let volume = mount.get_volume();
        if (!volume || volume.get_identifier('class') == 'network') {
            return;
        }

        const appInfo = new MountAppInfo(mount, this._cancellable);
        const mountApp = makeLocationApp({
            appInfo,
            fallbackIconName: FALLBACK_REMOVABLE_MEDIA_ICON,
        });
        this._mountApps.push(mountApp);
        this.emit('changed');
    }

    _onMountRemoved(monitor, mount) {
        const mountIndex = this._mountApps.findIndex(({ appInfo }) =>
            appInfo.mount === mount);
        if (mountIndex !== -1) {
            const [mountApp] = this._mountApps.splice(mountIndex, 1);
            mountApp.destroy();
            this.emit('changed');
        }
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
