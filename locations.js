// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Signals = imports.signals;
const Shell = imports.gi.Shell;

// Use __ () and N__() for the extension gettext domain, and reuse
// the shell domain with the default _() and N_()
const Gettext = imports.gettext.domain('dashtodock');
const __ = Gettext.gettext;
const N__ = function(e) { return e };

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
