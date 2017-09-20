// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Signals = imports.signals;

var LauncherEntryRemoteModel = new Lang.Class({
    Name: 'DashToDock.LauncherEntryRemoteModel',

    _init: function () {
        this._entriesByDBusName = {};

        this._launcher_entry_dbus_signal_id =
            Gio.DBus.session.signal_subscribe(null, // sender
                'com.canonical.Unity.LauncherEntry', // iface
                null, // member
                null, // path
                null, // arg0
                Gio.DBusSignalFlags.NONE,
                Lang.bind(this, this._onEntrySignalReceived));

        this._dbus_name_owner_changed_signal_id =
            Gio.DBus.session.signal_subscribe('org.freedesktop.DBus',  // sender
                'org.freedesktop.DBus',  // interface
                'NameOwnerChanged',      // member
                '/org/freedesktop/DBus', // path
                null,                    // arg0
                Gio.DBusSignalFlags.NONE,
                Lang.bind(this, this._onDBusNameOwnerChanged));

        this._acquireUnityDBus();
    },

    destroy: function () {
        if (this._launcher_entry_dbus_signal_id) {
            Gio.DBus.session.signal_unsubscribe(this._launcher_entry_dbus_signal_id);
        }

        if (this._dbus_name_owner_changed_signal_id) {
            Gio.DBus.session.signal_unsubscribe(this._dbus_name_owner_changed_signal_id);
        }

        this._releaseUnityDBus();
    },

    size: function () {
        return Object.keys(this._entriesByDBusName).length;
    },

    lookupByDBusName: function (dbusName) {
        return this._entriesByDBusName.hasOwnProperty(dbusName) ? this._entriesByDBusName[dbusName] : null;
    },

    lookupById: function (appId) {
        let ret = [];
        for (let dbusName in this._entriesByDBusName) {
            let entry = this._entriesByDBusName[dbusName];
            if (entry && entry.appId() == appId) {
                ret.push(entry);
            }
        }

        return ret;
    },

    addEntry: function (entry) {
        let existingEntry = this.lookupByDBusName(entry.dbusName());
        if (existingEntry) {
            existingEntry.update(entry);
        } else {
            this._entriesByDBusName[entry.dbusName()] = entry;
            this.emit('entry-added', entry);
        }
    },

    removeEntry: function (entry) {
        delete this._entriesByDBusName[entry.dbusName()]
        this.emit('entry-removed', entry);
    },

    _acquireUnityDBus: function () {
        if (!this._unity_bus_id) {
            Gio.DBus.session.own_name('com.canonical.Unity',
                Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT, null, null);
        }
    },

    _releaseUnityDBus: function () {
        if (this._unity_bus_id) {
            Gio.DBus.session.unown_name(this._unity_bus_id);
            this._unity_bus_id = 0;
        }
    },

    _onEntrySignalReceived: function (connection, sender_name, object_path,
        interface_name, signal_name, parameters, user_data) {
        if (!parameters || !signal_name)
            return;

        if (signal_name == 'Update') {
            if (!sender_name) {
                return;
            }

            this._handleUpdateRequest(sender_name, parameters);
        }
    },

    _onDBusNameOwnerChanged: function (connection, sender_name, object_path,
        interface_name, signal_name, parameters, user_data) {
        if (!parameters || !this.size())
            return;

        let [name, before, after] = parameters.deep_unpack();

        if (!after) {
            if (this._entriesByDBusName.hasOwnProperty(before)) {
                this.removeEntry(this._entriesByDBusName[before]);
            }
        }
    },

    _handleUpdateRequest: function (senderName, parameters) {
        if (!senderName || !parameters) {
            return;
        }

        let [appUri, properties] = parameters.deep_unpack();
        let appId = appUri.replace(/(^\w+:|^)\/\//, '');
        let entry = this.lookupByDBusName(senderName);

        if (entry) {
            entry.setDBusName(senderName);
            entry.update(properties);
        } else {
            let entry = new LauncherEntryRemote(senderName, appId, properties);
            this.addEntry(entry);
        }
    },
});

Signals.addSignalMethods(LauncherEntryRemoteModel.prototype);

var LauncherEntryRemote = new Lang.Class({
    Name: 'DashToDock.LauncherEntryRemote',

    _init: function (dbusName, appId, properties) {
        this._dbusName = dbusName;
        this._appId = appId;
        this._count = 0;
        this._countVisible = false;
        this._progress = 0.0;
        this._progressVisible = false;
        this.update(properties);
    },

    appId: function () {
        return this._appId;
    },

    dbusName: function () {
        return this._dbusName;
    },

    count: function () {
        return this._count;
    },

    setCount: function (count) {
        if (this._count != count) {
            this._count = count;
            this.emit('count-changed', this._count);
        }
    },

    countVisible: function () {
        return this._countVisible;
    },

    setCountVisible: function (countVisible) {
        if (this._countVisible != countVisible) {
            this._countVisible = countVisible;
            this.emit('count-visible-changed', this._countVisible);
        }
    },

    progress: function () {
        return this._progress;
    },

    setProgress: function (progress) {
        if (this._progress != progress) {
            this._progress = progress;
            this.emit('progress-changed', this._progress);
        }
    },

    progressVisible: function () {
        return this._progressVisible;
    },

    setProgressVisible: function (progressVisible) {
        if (this._progressVisible != progressVisible) {
            this._progressVisible = progressVisible;
            this.emit('progress-visible-changed', this._progressVisible);
        }
    },

    setDBusName: function (dbusName) {
        if (this._dbusName != dbusName) {
            let oldName = this._dbusName;
            this._dbusName = dbusName;
            this.emit('dbus-name-changed', oldName);
        }
    },

    update: function (other) {
        if (other instanceof LauncherEntryRemote) {
            this.setDBusName(other.dbusName())
            this.setCount(other.count());
            this.setCountVisible(other.countVisible());
            this.setProgress(other.progress());
            this.setProgressVisible(other.progressVisible())
        } else {
            for (let property in other) {
                if (other.hasOwnProperty(property)) {
                    if (property == 'count') {
                        this.setCount(other[property].get_int64());
                    } else if (property == 'count-visible') {
                        this.setCountVisible(other[property].get_boolean());
                    } if (property == 'progress') {
                        this.setProgress(other[property].get_double());
                    } else if (property == 'progress-visible') {
                        this.setProgressVisible(other[property].get_boolean());
                    } else {
                        // Not implemented yet
                    }
                }
            }
        }
    },
});

Signals.addSignalMethods(LauncherEntryRemote.prototype);
