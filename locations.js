// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Signals = imports.signals;
const Shell = imports.gi.Shell;

// Use __ () and N__() for the extension gettext domain, and reuse
// the shell domain with the default _() and N_()
const Gettext = imports.gettext.domain('dashtodock');
const __ = Gettext.gettext;
const N__ = function(e) { return e };

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

/**
 * This class maintains a Shell.App representing the Trash and keeps it
 * up-to-date as the trash fills and is emptied over time.
 */
var Trash = new Lang.Class({
    Name: 'DashToDock.Trash',

    _init: function() {
        this._file = Gio.file_new_for_uri('trash://');
        this._monitor = this._file.monitor_directory(0, null);
        this._lastEmpty = null;
        this._empty = null;
        this._signalId =
            this._monitor.connect('changed',
                                  Lang.bind(this, this._onTrashChange));
        this._onTrashChange();
    },

    destroy: function() {
        this._monitor.disconnect(this._signalId);
    },

    _onTrashChange: function() {
        let children = this._file.enumerate_children('*', 0, null);
        let count  = 0;
        while (children.next_file(null) != null) {
            count++;
        }
        children.close(null);
        this._empty = count == 0;
        if (this._lastEmpty != this._empty) {
            this._makeApp();
            this.emit('changed');
        }
    },

    _makeApp: function() {
        if (this._trashApp == null ||
            this._lastEmpty != this._empty) {
            let trashKeys = new GLib.KeyFile();
            trashKeys.set_string('Desktop Entry', 'Name', __('Trash'));
            trashKeys.set_string('Desktop Entry', 'Icon',
                                 this._empty ? 'user-trash' : 'user-trash-full');
            trashKeys.set_string('Desktop Entry', 'Type', 'Application');
            trashKeys.set_string('Desktop Entry', 'Exec', 'gio open trash:///');
            trashKeys.set_string('Desktop Entry', 'StartupNotify', 'true');
            trashKeys.set_string('Desktop Entry', 'XdtdUri', 'trash:///');
            if (!this._empty) {
                trashKeys.set_string('Desktop Entry', 'Actions', 'empty-trash;');
                trashKeys.set_string('Desktop Action empty-trash', 'Name', __('Empty Trash'));
                trashKeys.set_string('Desktop Action empty-trash', 'Exec',
                                     'dbus-send --print-reply --dest=org.gnome.Nautilus /org/gnome/Nautilus org.gnome.Nautilus.FileOperations.EmptyTrash');
            }

            let trashAppInfo = Gio.DesktopAppInfo.new_from_keyfile(trashKeys);
            this._trashApp = new Shell.App({appInfo: trashAppInfo});
            this._lastEmpty = this._empty;
        }
    },

    getApp: function() {
        return this._trashApp;
    }
});
Signals.addSignalMethods(Trash.prototype);

/**
 * This class maintains Shell.App representations for removable devices
 * plugged into the system, and keeps the list of Apps up-to-date as
 * devices come and go and are mounted and unmounted.
 */
var Removables = new Lang.Class({
    Name: "DashToDock.Removables",

    _init: function() {
        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._monitor = Gio.VolumeMonitor.get();
        this._volumeApps = []
        this._mountApps = []

        this._monitor.get_volumes().forEach(Lang.bind(this, function(volume) {
            this._onVolumeAdded(this._monitor, volume);
        }));

        this._monitor.get_mounts().forEach(Lang.bind(this, function(mount) {
            this._onMountAdded(this._monitor, mount);
        }));

        this._signalsHandler.add([
            this._monitor,
            'mount-added',
            Lang.bind(this, this._onMountAdded)
        ], [
            this._monitor,
            'mount-removed',
            Lang.bind(this, this._onMountRemoved)
        ], [
            this._monitor,
            'volume-added',
            Lang.bind(this, this._onVolumeAdded)
        ], [
            this._monitor,
            'volume-removed',
            Lang.bind(this, this._onVolumeRemoved)
        ]);
    },

    destroy: function() {
        this._signalsHandler.destroy();
    },

    _getWorkingIconName: function(icon) {
        if (icon instanceof Gio.ThemedIcon) {
            let iconTheme = Gtk.IconTheme.get_default();
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
    },

    _onVolumeAdded: function(monitor, volume) {
        if (!volume.can_mount()) {
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
        let uri = GLib.uri_unescape_string(activationRoot.get_uri(), null);

        let volumeKeys = new GLib.KeyFile();
        volumeKeys.set_string('Desktop Entry', 'Name', volume.get_name());
        volumeKeys.set_string('Desktop Entry', 'Icon', this._getWorkingIconName(volume.get_icon()));
        volumeKeys.set_string('Desktop Entry', 'Type', 'Application');
        volumeKeys.set_string('Desktop Entry', 'Exec', 'nautilus ' + uri);
        volumeKeys.set_string('Desktop Entry', 'StartupNotify', 'true');
        volumeKeys.set_string('Desktop Entry', 'Actions', 'mount;');
        volumeKeys.set_string('Desktop Action mount', 'Name', __('Mount'));
        volumeKeys.set_string('Desktop Action mount', 'Exec', 'gio mount ' + uri);
        let volumeAppInfo = Gio.DesktopAppInfo.new_from_keyfile(volumeKeys);
        let volumeApp = new Shell.App({appInfo: volumeAppInfo});
        this._volumeApps.push(volumeApp);
        this.emit('changed');
    },

    _onVolumeRemoved: function(monitor, volume) {
        for (let i = 0; i < this._volumeApps.length; i++) {
            let app = this._volumeApps[i];
            if (app.get_name() == volume.get_name()) {
                this._volumeApps.splice(i, 1);
            }
        }
        this.emit('changed');
    },

    _onMountAdded: function(monitor, mount) {
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
        mountKeys.set_string('Desktop Entry', 'Exec', 'gio open ' + uri);
        mountKeys.set_string('Desktop Entry', 'StartupNotify', 'true');
        mountKeys.set_string('Desktop Entry', 'XdtdUri', escapedUri);
        mountKeys.set_string('Desktop Entry', 'Actions', 'unmount;');
        if (mount.can_eject()) {
            mountKeys.set_string('Desktop Action unmount', 'Name', __('Eject'));
            mountKeys.set_string('Desktop Action unmount', 'Exec',
                                 'gio mount -e ' + uri);
        } else {
            mountKeys.set_string('Desktop Entry', 'Actions', 'unmount;');
            mountKeys.set_string('Desktop Action unmount', 'Name', __('Unmount'));
            mountKeys.set_string('Desktop Action unmount', 'Exec',
                                 'gio mount -u ' + uri);
        }
        let mountAppInfo = Gio.DesktopAppInfo.new_from_keyfile(mountKeys);
        let mountApp = new Shell.App({appInfo: mountAppInfo});
        this._mountApps.push(mountApp);
        this.emit('changed');
    },

    _onMountRemoved: function(monitor, mount) {
        for (let i = 0; i < this._mountApps.length; i++) {
            let app = this._mountApps[i];
            if (app.get_name() == mount.get_name()) {
                this._mountApps.splice(i, 1);
            }
        }
        this.emit('changed');
    },

    getApps: function() {
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
});
Signals.addSignalMethods(Removables.prototype);
