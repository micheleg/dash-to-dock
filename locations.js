// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
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

const TRASH_URI = 'trash://';
const UPDATE_TRASH_DELAY = 500;

// We can't inherit from Shell.App as it's a final type, so let's patch it
function makeLocationApp(params) {
    if (!params.location)
        throw new TypeError('Invalid location');

    location = params.location;
    delete params.location;

    const shellApp = new Shell.App(params);

    Object.defineProperties(shellApp, {
        location: { value: location },
        isTrash: { value: location.startsWith(TRASH_URI) },
        state: { get: () => shellApp.get_state() },
    });

    shellApp._windows = [];
    shellApp.get_state = () =>
        shellApp._windows.length ? Shell.AppState.RUNNING : Shell.AppState.STOPPED;
    shellApp.get_windows = () => shellApp._windows;
    shellApp.get_n_windows = () => shellApp.get_windows().length;
    shellApp.get_pids = () => shellApp.get_windows().reduce((pids, w) => {
        if (w.get_pid() > 0 && !pids.includes(w.get_pid()))
            pids.push(w.get_pid());
        return pids;
    }, []);
    shellApp.is_on_workspace = workspace => shellApp.get_windows().some(w =>
        w.get_workspace() === workspace);
    shellApp.request_quit = () => shellApp.get_windows().filter(w =>
        w.can_close()).forEach(w => w.delete(global.get_current_time()));

    // FIXME: We need to add a new API to Nautilus to open new windows
    shellApp.can_open_new_window = () => false;

    const defaultToString = shellApp.toString;
    shellApp.toString = () => '[LocationApp - %s]'.format(defaultToString.call(shellApp));

    const { fm1Client } = Docking.DockManager.getDefault();
    shellApp._updateWindows = function () {
        const oldState = this.state;
        const oldWindows = this._windows;
        this._windows = fm1Client.getWindows(this.location);

        if (this._windows.length !== oldWindows.length ||
            this._windows.some((win, index) => win !== oldWindows[index]))
            this.emit('windows-changed');

        if (oldState !== this.state)
            this.notify('state');
    };

    shellApp._updateWindows();
    const windowsChangedId = fm1Client.connect('windows-changed', () =>
        shellApp._updateWindows());

    shellApp.destroy = function () {
        this._windows = [];
        fm1Client.disconnect(windowsChangedId);
    }

    return shellApp;
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
                trashKeys.set_string('Desktop Action empty-trash', 'Exec',
                    'gdbus call --session --dest org.gnome.Nautilus \
                    --object-path /org/gnome/Nautilus/FileOperations2 \
                    --method org.gnome.Nautilus.FileOperations2.EmptyTrash true {}');
            }

            let trashAppInfo = Gio.DesktopAppInfo.new_from_keyfile(trashKeys);
            this._trashApp?.destroy();
            this._trashApp = makeLocationApp({
                location: TRASH_URI + '/',
                appInfo: trashAppInfo,
            });
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

        let escapedUri = mount.get_root().get_uri()
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

        let ret = [];
        for (let app of apps.values()) {
            ret.push(app);
        }
        return ret;
    }
}
Signals.addSignalMethods(Removables.prototype);
