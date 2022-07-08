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

const Labels = Object.freeze({
    LOCATION_WINDOWS: Symbol('location-windows'),
    WINDOWS_CHANGED: Symbol('windows-changed'),
});

if (imports.system.version >= 17101) {
    Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
}

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
            GObject.ParamFlags.READWRITE,
            Gio.File.$gtype),
        'name': GObject.ParamSpec.string(
            'name', 'name', 'name',
            GObject.ParamFlags.READWRITE,
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

        const handler = this._getHandlerApp();
        if (handler)
            return handler.launch_uris([this.location.get_uri()], context);

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
        return this._getHandlerApp()?.get_commandline() ??
            'gio open %s'.format(this.location?.get_uri());
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

    async _queryLocationIcons(params) {
        const icons = { standard: null, custom: null };
        if (!this.location)
            return icons;

        const cancellable = params.cancellable ?? this.cancellable;
        const iconsQuery = [];
        if (params?.standard)
            iconsQuery.push(Gio.FILE_ATTRIBUTE_STANDARD_ICON);

        if (params?.custom)
            iconsQuery.push(ATTRIBUTE_METADATA_CUSTOM_ICON);

        if (!iconsQuery.length)
            throw new Error('Invalid Query Location Icons parameters');

        let info;
        try {
            // This is should not be needed in newer Gjs (> GNOME 41)
            if (imports.system.version < 17101) {
                Gio._promisify(this.location.constructor.prototype, 'query_info_async',
                    'query_info_finish');
            }
            info = await this.location.query_info_async(
                iconsQuery.join(','),
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_LOW, cancellable);
            icons.standard = info.get_icon();
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) ||
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_MOUNTED))
                return icons;
            throw e;
        }

        const customIcon = info.get_attribute_string(ATTRIBUTE_METADATA_CUSTOM_ICON);
        if (customIcon) {
            const customIconFile = GLib.uri_parse_scheme(customIcon) ?
                Gio.File.new_for_uri(customIcon) : Gio.File.new_for_path(customIcon);
            const iconFileInfo = await customIconFile.query_info_async(
                Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_LOW, cancellable);

            if (iconFileInfo.get_file_type() === Gio.FileType.REGULAR)
                icons.custom = Gio.FileIcon.new(customIconFile);
        }

        return icons;
    }

    async _updateLocationIcon(params = { standard: true, custom: true }) {
        const cancellable = new Utils.CancellableChild(this.cancellable);

        try {
            this._updateIconCancellable?.cancel();
            this._updateIconCancellable = cancellable;

            const icons = await this._queryLocationIcons({ cancellable, ...params });
            const icon = icons.custom ?? icons.standard;

            if (icon && !icon.equal(this.icon))
                this.icon = icon;
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, 'Impossible to update icon for %s'.format(this.get_id()));
        } finally {
            cancellable.cancel();
            if (this._updateIconCancellable === cancellable)
                delete this._updateIconCancellable;
        }
    }

    _getHandlerApp() {
        if (!this.location)
            return null;

        try {
            return this.location.query_default_handler(this.cancellable);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_MOUNTED))
                return getFileManagerApp()?.appInfo;

            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                logError(e, 'Impossible to find an URI handler for %s'.format(
                    this.get_id()));
            }
            return null;
        }
    }

    destroy() {
        this.location = null;
        this.icon = null;
        this.name = null;
        this.cancellable?.cancel();
    }
});

const MountableVolumeAppInfo = GObject.registerClass({
    Implements: [Gio.AppInfo],
    Properties: {
        'volume': GObject.ParamSpec.object(
            'volume', 'volume', 'volume',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Volume.$gtype),
        'mount': GObject.ParamSpec.object(
            'mount', 'mount', 'mount',
            GObject.ParamFlags.READWRITE,
            Gio.Mount.$gtype),
        'busy': GObject.ParamSpec.boolean(
            'busy', 'busy', 'busy',
            GObject.ParamFlags.READWRITE,
            false),
    },
},
class MountableVolumeAppInfo extends LocationAppInfo {
    _init(volume, cancellable = null) {
        super._init({
            volume,
            cancellable,
        });

        this._signalsHandler = new Utils.GlobalSignalsHandler();

        const updateAndMonitor = () => {
            this._update();
            this._monitorChanges();
        };
        updateAndMonitor();
        this._mountChanged = this.connect('notify::mount', updateAndMonitor);

        if (!this.mount && this.volume.get_identifier('class') == 'network') {
            // For some devices the mount point isn't advertised promptly
            // even if it's already existing, and there's no signaling about
            this._lazyUpdater = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                this._update();
                delete this._lazyUpdater;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    get busy() {
        return !!this._currentAction;
    }

    get currentAction() {
        return this._currentAction;
    }

    destroy() {
        if (this._lazyUpdater) {
            GLib.source_remove(this._lazyUpdater);
            delete this._lazyUpdater;
        }
        this.disconnect(this._mountChanged);
        this.mount = null;
        this._signalsHandler.destroy();

        super.destroy();
    }

    vfunc_dup() {
        return new MountableVolumeAppInfo({
            volume: this.volume,
            cancellable: this.cancellable,
        });
    }

    vfunc_get_id() {
        const uuid = this.mount?.get_uuid() ?? this.volume.get_uuid();
        return uuid ? 'mountable-volume:%s'.format(uuid) : super.vfunc_get_id();
    }

    vfunc_equal(other) {
        if (this.volume === other?.volume && this.mount === other?.mount)
            return true;

        return this.get_id() === other?.get_id();
    }

    list_actions() {
        const actions = [];
        const { mount } = this;

        if (mount) {
            if (this.mount.can_unmount())
                actions.push('unmount');
            if (this.mount.can_eject())
                actions.push('eject');

            return actions;
        }

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
            case 'unmount':
                return __('Unmount');
            case 'eject':
                return __('Eject');
            default:
                return null;
        }
    }

    vfunc_launch(files, context) {
        if (this.mount || files?.length)
            return super.vfunc_launch(files, context);

        this.mountAndLaunch(files, context);
        return true;
    }

    _update() {
        this.mount = this.volume.get_mount();

        const removable = this.mount ?? this.volume;
        this.name = removable.get_name();
        this.icon = removable.get_icon();

        this.location = this.mount?.get_default_location() ??
            this.volume.get_activation_root();

        this._updateLocationIcon({ custom: true });
    }

    _monitorChanges() {
        this._signalsHandler.destroy();

        const removable = this.mount ?? this.volume;
        this._signalsHandler.add(removable, 'changed', () => this._update());

        if (this.mount) {
            this._signalsHandler.add(this.mount, 'pre-unmount', () => this._update());
            this._signalsHandler.add(this.mount, 'unmounted', () => this._update());
        }
    }

    async mountAndLaunch(files, context) {
        if (this.mount)
            return super.vfunc_launch(files, context);

        try {
            await this.launchAction('mount');
            if (!this.mount) {
                throw new Error('No mounted location to open for %s'.format(
                    this.get_id()));
            }

            return super.vfunc_launch(files, context);
        } catch (e) {
            logError(e, 'Mount and launch %s'.format(this.get_id()));
        }
    }

    _notifyActionError(action, message) {
        if (action === 'mount') {
            global.notify_error(__("Failed to mount “%s”".format(
                this.get_name())), message);
        } else if (action === 'unmount') {
            global.notify_error(__("Failed to umount “%s”".format(
                this.get_name())), message);
        } else if (action === 'eject') {
            global.notify_error(__("Failed to eject “%s”".format(
                this.get_name())), message);
        }
    }

    async launchAction(action) {
        if (!this.list_actions().includes(action))
            throw new Error('Action %s is not supported by %s', action, this);

        if (this._currentAction) {
            if (this._currentAction === 'mount') {
                this._notifyActionError(action,
                    __("Mount operation already in progress"));
            } else if (this._currentAction === 'unmount') {
                this._notifyActionError(action,
                    __("Umount operation already in progress"));
            } else if (this._currentAction === 'eject') {
                this._notifyActionError(action,
                    __("Eject operation already in progress"));
            }

            throw new Error('Another action %s is being performed in %s'.format(
                this._currentAction, this));
        }

        this._currentAction = action;
        this.notify('busy');
        const removable = this.mount ?? this.volume;
        const operation = new ShellMountOperation.ShellMountOperation(removable);
        try {
            if (action === 'mount') {
                await this.volume.mount(Gio.MountMountFlags.NONE, operation.mountOp,
                    this.cancellable);
            } else if (action === 'unmount') {
                await this.mount.unmount_with_operation(Gio.MountUnmountFlags.FORCE,
                    operation.mountOp, this.cancellable);
            } else if (action === 'eject') {
                await removable.eject_with_operation(Gio.MountUnmountFlags.FORCE,
                    operation.mountOp, this.cancellable);
            } else {
                logError(new Error(), 'No action %s on removable %s'.format(action,
                    removable.get_name()));
                return false;
            }

            return true;
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED))
                this._notifyActionError(action, e);

            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                logError(e, 'Impossible to %s removable %s'.format(action,
                    removable.get_name()));
            }

            return false;
        } finally {
            delete this._currentAction;
            this.notify('busy');
            this._update();
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
    static initPromises(file) {
        if (TrashAppInfo._promisified)
            return;

        const trashProto = file.constructor.prototype;
        Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');
        Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
        Gio._promisify(trashProto, 'enumerate_children_async', 'enumerate_children_finish');
        Gio._promisify(trashProto, 'query_info_async', 'query_info_finish');
        TrashAppInfo._promisified = true;
    }

    _init(cancellable = null) {
        super._init({
            location: Gio.file_new_for_uri(TRASH_URI),
            name: __('Trash'),
            icon: Gio.ThemedIcon.new(FALLBACK_TRASH_ICON),
            cancellable,
        });
        TrashAppInfo.initPromises(this.location);

        try {
            this._monitor = this.location.monitor_directory(0, this.cancellable);
            this._schedUpdateId = 0;
            this._monitorChangedId = this._monitor.connect('changed', () =>
                this._onTrashChange());
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            logError(e, 'Impossible to monitor trash');
        }
        this._updateTrash();

        this.connect('notify::empty', () => this._updateLocationIcon());
        this.notify('empty');
    }

    destroy() {
        if (this._schedUpdateId) {
            GLib.source_remove(this._schedUpdateId);
            this._schedUpdateId = 0;
        }
        this._updateTrashCancellable?.cancel();
        this._monitor?.disconnect(this._monitorChangedId);
        this._monitor = null;

        super.destroy();
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

    _onTrashChange() {
        if (this._schedUpdateId) {
            GLib.source_remove(this._schedUpdateId);
            this._schedUpdateId = 0;
        }

        if (this._monitor.is_cancelled())
            return;

        this._schedUpdateId = GLib.timeout_add(GLib.PRIORITY_LOW,
            UPDATE_TRASH_DELAY, () => {
            this._schedUpdateId = 0;
            this._updateTrash();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _updateTrash() {
        const priority = GLib.PRIORITY_LOW;
        this._updateTrashCancellable?.cancel();
        const cancellable = new Utils.CancellableChild(this.cancellable);
        this._updateTrashCancellable = cancellable;

        try {
            const trashInfo = await this.location.query_info_async(
                Gio.FILE_ATTRIBUTE_TRASH_ITEM_COUNT,
                Gio.FileQueryInfoFlags.NONE,
                priority, cancellable);
            this.empty = !trashInfo.get_attribute_uint32(
                Gio.FILE_ATTRIBUTE_TRASH_ITEM_COUNT);
            return;
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, 'Impossible to get trash children from infos');
        } finally {
            cancellable.cancel();
            if (this._updateIconCancellable === cancellable)
                delete this._updateTrashCancellable;
        }

        try {
            const childrenEnumerator = await this.location.enumerate_children_async(
                Gio.FILE_ATTRIBUTE_STANDARD_TYPE, Gio.FileQueryInfoFlags.NONE,
                priority, cancellable);
            const children = await childrenEnumerator.next_files_async(1,
                priority, cancellable);
            this.empty = !children.length;

            await childrenEnumerator.close_async(priority, null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, 'Impossible to enumerate trash children');
        } finally {
            cancellable.cancel();
            if (this._updateIconCancellable === cancellable)
                delete this._updateTrashCancellable;
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
        state: undefined,
        startingWorkspace: 0,
        isFocused: false,
        proxyProperties: [],
        sources: new Set(),
        signalConnections: new Utils.GlobalSignalsHandler(),
        methodInjections: new Utils.InjectionsHandler(),
        propertyInjections: new Utils.PropertyInjectionsHandler(),
        addProxyProperties: function (parent, proxyProperties) {
            Object.entries(proxyProperties).forEach(([p, o]) => {
                const publicProp = o.public ? p : '_' + p;
                const get = (o.getter && o.value instanceof Function) ?
                    () => this[p]() : () => this[p];
                Object.defineProperty(parent, publicProp, Object.assign({
                    get,
                    set: v => (this[p] = v),
                    configurable: true,
                    enumerable: !!o.enumerable,
                }, o.readOnly ? { set: undefined } : {}));
                o.value && (this[p] = o.value);
                this.proxyProperties.push(publicProp);
            });
        },
        destroy: function () {
            this.windows = [];
            this.proxyProperties = [];
            this.sources.forEach(s => GLib.source_remove(s));
            this.sources.clear();
            this.signalConnections.destroy();
            this.methodInjections.destroy();
            this.propertyInjections.destroy();
        }
    };

    shellApp._dtdData.addProxyProperties(shellApp, {
        windows: {},
        state: {},
        startingWorkspace: {},
        isFocused: { public: true },
        signalConnections: { readOnly: true },
        sources: { readOnly: true },
        checkFocused: {},
        setDtdData: {},
    });

    shellApp._setDtdData = function (data, params = {}) {
        for (const [name, value] of Object.entries(data)) {
            if (params.readOnly && name in this._dtdData)
                throw new Error('Property %s is already defined'.format(name));
            const defaultParams = { public: true, readOnly: true };
            this._dtdData.addProxyProperties(this, {
                [name]: { ...defaultParams, ...params, value }
            });
        }
    };

    const m = (...args) => shellApp._dtdData.methodInjections.add(shellApp, ...args);
    const p = (...args) => shellApp._dtdData.propertyInjections.add(shellApp, ...args);

    // mi is Method injector, pi is Property injector
    shellApp._setDtdData({ mi: m, pi: p }, { public: false });

    m('get_state', () => shellApp._state ?? shellApp._getStateByWindows());
    p('state', { get: () => shellApp.get_state() });

    m('get_windows', () => shellApp._windows);
    m('get_n_windows', () => shellApp._windows.length);
    m('get_pids', () => shellApp._windows.reduce((pids, w) => {
        if (w.get_pid() > 0 && !pids.includes(w.get_pid()))
            pids.push(w.get_pid());
        return pids;
    }, []));
    m('is_on_workspace', (_om, workspace) => shellApp._windows.some(w =>
        w.get_workspace() === workspace) ||
        (shellApp.state === Shell.AppState.STARTING &&
         [-1, workspace.index()].includes(shellApp._startingWorkspace)));
    m('request_quit', () => shellApp._windows.filter(w =>
        w.can_close()).forEach(w => w.delete(global.get_current_time())));

    shellApp._setDtdData({
        _getStateByWindows: function() {
            return this.get_n_windows() ? Shell.AppState.RUNNING : Shell.AppState.STOPPED;
        },

        _updateWindows: function () {
            throw new GObject.NotImplementedError(`_updateWindows in ${this.constructor.name}`);
        },

        _notifyStateChanged() {
            Shell.AppSystem.get_default().emit('app-state-changed', this);
            this.notify('state');
        },

        _setState: function (state) {
            const oldState = this.state;
            this._state = state;

            if (this.state !== oldState)
                this._notifyStateChanged();
        },

        _setWindows: function (windows) {
            const oldState = this.state;
            const oldWindows = this.get_windows().slice();
            const result = { windowsChanged: false, stateChanged: false };
            this._state = undefined;

            if (windows.length !== oldWindows.length ||
                windows.some((win, index) => win !== oldWindows[index])) {
                this._windows = windows.filter(w => !w.is_override_redirect());
                this.emit('windows-changed');
                result.windowsChanged = true;
            }

            if (this.state !== oldState) {
                this._notifyStateChanged();
                this._checkFocused();
                result.stateChanged = true;
            }

            return result;
        },
    }, { readOnly: false });

    shellApp._sources.add(GLib.idle_add(GLib.DEFAULT_PRIORITY, () => {
        shellApp._updateWindows();
        shellApp._sources.delete(GLib.main_current_source().source_id);
        return GLib.SOURCE_REMOVE;
    }));

    const windowTracker = Shell.WindowTracker.get_default();
    shellApp._checkFocused = function () {
        if (this._windows.some(w => w.has_focus())) {
            this.isFocused = true;
            windowTracker.notify('focus-app');
        } else if (this.isFocused) {
            this.isFocused = false;
            windowTracker.notify('focus-app');
        }
    }

    shellApp._checkFocused();
    shellApp._signalConnections.add(global.display, 'notify::focus-window', () =>
        shellApp._checkFocused());

    // Re-implements shell_app_activate_window for generic activation and alt-tab support
    m('activate_window', function (_om, window, timestamp) {
        if (!window)
            [window] = this.get_windows();
        else if (!this._windows.includes(window))
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
                    this._startingWorkspace = workspace;
                    this._setState(Shell.AppState.STARTING);
                    this.launch(timestamp, workspace, Shell.AppLaunchGpu.APP_PREF);
                } catch (e) {
                    logError(e);
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

    m('compare', (_om, other) => Utils.shellAppCompare(shellApp, other));

    const { destroy: defaultDestroy } = shellApp;
    shellApp.destroy = function() {
        this._dtdData.proxyProperties.forEach(p => (delete this[p]));
        this._dtdData.destroy();
        this._dtdData = undefined;
        this.appInfo.destroy && this.appInfo.destroy();
        this.destroy = defaultDestroy;
        defaultDestroy && defaultDestroy.call(this);
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

    shellApp._setDtdData({
        location: () => shellApp.appInfo.location,
        isTrash: shellApp.appInfo instanceof TrashAppInfo,
    }, { getter: true, enumerable: true });

    shellApp._mi('toString', defaultToString =>
        '[LocationApp "%s" - %s]'.format(shellApp.get_id(),
            defaultToString.call(shellApp)));

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
    shellApp._mi('can_open_new_window', () =>
        shellApp.appInfo.get_commandline()?.split(' ').includes('--new-window'));

    shellApp._mi('open_new_window', function (_om, workspace) {
        const context = global.create_app_launch_context(0, workspace);
        const [ret] = GLib.spawn_async(null,
            [...this.appInfo.get_commandline().split(' ').filter(
                t => !t.startsWith('%')), this.appInfo.location.get_uri() ],
            context.get_environment(), GLib.SpawnFlags.SEARCH_PATH, null);
        return ret;
    });

    if (shellApp.appInfo instanceof MountableVolumeAppInfo) {
        shellApp._mi('get_busy', function (parentGetBusy) {
            if (this.appInfo.busy)
                return true;
            return parentGetBusy.call(this);
        });
        shellApp._pi('busy', { get: () => shellApp.get_busy() });
        shellApp._signalConnections.add(shellApp.appInfo, 'notify::busy', _ =>
            shellApp.notify('busy'));
    }

    shellApp._mi('get_windows', function () {
        if (this._needsResort)
            this._sortWindows();
        return this._windows;
    });

    const { fm1Client } = Docking.DockManager.getDefault();
    shellApp._setDtdData({
        _needsResort: true,

        _windowsOrderChanged: function() {
            this._needsResort = true;
            this.emit('windows-changed');
        },

        _sortWindows: function () {
            this._windows.sort(Utils.shellWindowsCompare);
            this._needsResort = false;
        },

        _updateWindows: function () {
            const windows = fm1Client.getWindows(this.location?.get_uri()).sort(
                Utils.shellWindowsCompare);
            const { windowsChanged } = this._setWindows(windows);

            if (!windowsChanged)
                return;

            this._signalConnections.removeWithLabel(Labels.LOCATION_WINDOWS);
            windows.forEach(w =>
                this._signalConnections.addWithLabel(Labels.LOCATION_WINDOWS, w,
                    'notify::user-time', () => {
                        if (w != this._windows[0])
                            this._windowsOrderChanged();
                    }));
        },
    }, { readOnly: false });

    shellApp._signalConnections.add(fm1Client, 'windows-changed', () =>
        shellApp._updateWindows());
    shellApp._signalConnections.add(shellApp.appInfo, 'notify::icon', () =>
        shellApp.notify('icon'));
    shellApp._signalConnections.add(global.workspaceManager,
        'workspace-switched', () => shellApp._windowsOrderChanged());

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

    const { removables, trash } = Docking.DockManager.getDefault();
    fileManagerApp._signalConnections.addWithLabel(Labels.WINDOWS_CHANGED,
        fileManagerApp, 'windows-changed', () => {
            fileManagerApp.stop_emission_by_name('windows-changed');
            // Let's wait for the location app to take control before of us
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                fileManagerApp._sources.delete(id);
                fileManagerApp._updateWindows();
                return GLib.SOURCE_REMOVE;
            });
            fileManagerApp._sources.add(id);
        });

    if (removables) {
        fileManagerApp._signalConnections.add(removables, 'changed', () =>
            fileManagerApp._updateWindows());
        fileManagerApp._signalConnections.add(removables, 'windows-changed', () =>
            fileManagerApp._updateWindows());
    }

    if (trash?.getApp()) {
        fileManagerApp._signalConnections.add(trash.getApp(), 'windows-changed', () =>
            fileManagerApp._updateWindows());
    }

    fileManagerApp._updateWindows = function () {
        const locationWindows = [];
        getRunningApps().forEach(a => locationWindows.push(...a.get_windows()));
        const windows = originalGetWindows.call(this).filter(w =>
            !locationWindows.includes(w));

        this._signalConnections.blockWithLabel(Labels.WINDOWS_CHANGED);
        this._setWindows(windows);
        this._signalConnections.unblockWithLabel(Labels.WINDOWS_CHANGED);
    };

    fileManagerApp._mi('toString', defaultToString =>
        '[FileManagerApp - %s]'.format(defaultToString.call(fileManagerApp)));

    return fileManagerApp;
}

function unWrapFileManagerApp() {
    const fileManagerApp = getFileManagerApp();
    if (!fileManagerApp || !fileManagerApp._dtdData)
        return;

    fileManagerApp.destroy();
}

/**
 * This class maintains a Shell.App representing the Trash and keeps it
 * up-to-date as the trash fills and is emptied over time.
 */
var Trash = class DashToDock_Trash {
    destroy() {
        this._trashApp?.destroy();
    }

    _ensureApp() {
        if (this._trashApp)
            return;

        this._trashApp = makeLocationApp({
            appInfo: new TrashAppInfo(new Gio.Cancellable()),
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

        this._monitor.get_mounts().forEach(m => Removables.initMountPromises(m));
        this._updateVolumes();

        this._signalsHandler.add([
            this._monitor,
            'volume-added',
            (_, volume) => this._onVolumeAdded(volume),
        ], [
            this._monitor,
            'volume-removed',
            (_, volume) => this._onVolumeRemoved(volume),
        ], [
            this._monitor,
            'mount-added',
            (_, mount) => this._onMountAdded(mount),
        ], [
            Docking.DockManager.settings,
            'changed::show-mounts-only-mounted',
            () => this._updateVolumes(),
        ], [
            Docking.DockManager.settings,
            'changed::show-mounts-network',
            () => this._updateVolumes(),
        ]);
    }

    destroy() {
        this._volumeApps.forEach(a => a.destroy());
        this._volumeApps = [];
        this._cancellable.cancel();
        this._cancellable = null;
        this._signalsHandler.destroy();
        this._monitor = null;
    }

    _updateVolumes() {
        this._volumeApps?.forEach(a => a.destroy());
        this._volumeApps = [];
        this.emit('changed');

        this._monitor.get_volumes().forEach(v => this._onVolumeAdded(v));
    }

    _onVolumeAdded(volume) {
        Removables.initVolumePromises(volume);

        if (!Docking.DockManager.settings.showMountsNetwork &&
            volume.get_identifier('class') == 'network') {
            return;
        }

        const mount = volume.get_mount();
        if (mount) {
            if (mount.is_shadowed())
                return;
            if (!mount.can_eject() && !mount.can_unmount())
                return;
        } else {
            if (Docking.DockManager.settings.showMountsOnlyMounted)
                return;
            if (!volume.can_mount() && !volume.can_eject())
                return;
        }

        const appInfo = new MountableVolumeAppInfo(volume,
            new Utils.CancellableChild(this._cancellable));
        const volumeApp = makeLocationApp({
            appInfo,
            fallbackIconName: FALLBACK_REMOVABLE_MEDIA_ICON,
        });

        volumeApp._signalConnections.add(volumeApp, 'windows-changed',
            () => this.emit('windows-changed', volumeApp));

        if (Docking.DockManager.settings.showMountsOnlyMounted) {
            volumeApp._signalConnections.add(appInfo, 'notify::mount',
                () => (!appInfo.mount && this._onVolumeRemoved(appInfo.volume)));
        }

        this._volumeApps.push(volumeApp);
        this.emit('changed');
    }

    _onVolumeRemoved(volume) {
        const volumeIndex = this._volumeApps.findIndex(({ appInfo }) =>
            appInfo.volume === volume);
        if (volumeIndex !== -1) {
            const [volumeApp] = this._volumeApps.splice(volumeIndex, 1);
            volumeApp.destroy();
            this.emit('changed');
        }
    }

    _onMountAdded(mount) {
        Removables.initMountPromises(mount);

        if (!Docking.DockManager.settings.showMountsOnlyMounted)
            return;

        if (!this._volumeApps.find(({ appInfo }) => appInfo.mount === mount)) {
            // In some Gio.Mount implementations the volume may be set after
            // mount is emitted, so we could just ignore it as we'll get it
            // later via volume-added
            const volume = mount.get_volume();
            if (volume)
                this._onVolumeAdded(volume);
        }
    }

    getApps() {
        return this._volumeApps;
    }
}
Signals.addSignalMethods(Removables.prototype);

function getApps() {
    const dockManager = Docking.DockManager.getDefault();
    const locationApps = [];

    if (dockManager.removables)
        locationApps.push(...dockManager.removables.getApps());

    if (dockManager.trash)
        locationApps.push(dockManager.trash.getApp());

    return locationApps;
}

function getRunningApps() {
    return getApps().filter(a => a.state === Shell.AppState.RUNNING);
}

function getStartingApps() {
    return getApps().filter(a => a.state === Shell.AppState.STARTING);
}
