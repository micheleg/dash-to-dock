// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const FileManager1Iface = '<node><interface name="org.freedesktop.FileManager1">\
                               <property name="XUbuntuOpenLocationsXids" type="a{uas}" access="read"/>\
                           </interface></node>';

const FileManager1Proxy = Gio.DBusProxy.makeProxyWrapper(FileManager1Iface);

/**
 * This class implements a client for the org.freedesktop.FileManager1 dbus
 * interface, and specifically for the XUbuntuOpenLocationsXids property that
 * is not an official part of the interface. On Ubuntu, Nautilus has been
 * patched to offer this additional property, and it maps file locations to
 * Window XIDs, as the name suggests.
 *
 * When an unpatched Nautilus is running, we will never observe the property
 * to contain anything interesting, but there will not be any correctness
 * issues.
 */
var FileManager1Client = new Lang.Class({
    Name: 'DashToDock.FileManager1Client',

    _init: function() {
        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._locationMap = new Map();
        this._proxy = new FileManager1Proxy(Gio.DBus.session,
                                            "org.freedesktop.FileManager1",
                                            "/org/freedesktop/FileManager1",
                                            Lang.bind(this, function(initable, error) {
            // Use async construction to avoid blocking on errors.
            if (error) {
                global.log(error);
            } else {
                this._updateLocationMap();
            }
        }));

        this._signalsHandler.add([
            this._proxy,
            'g-properties-changed',
            Lang.bind(this, this._onPropertyChanged)
        ], [
            // We must additionally listen for Screen events to know when to
            // rebuild our location map when the set of available windows changes.
            global.screen,
            'workspace-switched',
            Lang.bind(this, this._updateLocationMap)
        ], [
            global.screen,
            'window-entered-monitor',
            Lang.bind(this, this._updateLocationMap)
        ], [
            global.screen,
            'window-left-monitor',
            Lang.bind(this, this._updateLocationMap)
        ]);
    },

    destroy: function() {
        this._signalsHandler.destroy();
    },

    /**
     * Return an array of windows that are showing a location or
     * sub-directories of that location.
     */
    getWindows: function(location) {
        let ret = [];
        for (let [k,v] of this._locationMap) {
            if (k.startsWith(location)) {
                Array.prototype.push.apply(ret, v);
            }
        }
        return ret;
    },

    _onPropertyChanged: function(proxy, changed, invalidated) {
        let property = changed.unpack();
        if (property && 'XUbuntuOpenLocationsXids' in property) {
            this._updateLocationMap();
        }
    },

    _updateLocationMap: function() {
        let xidToLocations = this._proxy.XUbuntuOpenLocationsXids;
        let xidToWindow = getXidToWindow();

        let locationToWindow = new Map();
        for (let xid in xidToLocations) {
            let locations = xidToLocations[xid];
            for (let i = 0; i < locations.length; i++) {
                let l = locations[i];
                if (!locationToWindow.has(l)) {
                    locationToWindow.set(l, []);
                }
                let window = xidToWindow.get(parseInt(xid));
                if (window != null) {
                    locationToWindow.get(l).push(window);
                }
            }
        }
        this._locationMap = locationToWindow;
        this.emit('windows-changed');
    }
});
Signals.addSignalMethods(FileManager1Client.prototype);

/**
 * Construct a map of XIDs to MetaWindows.
 *
 * This is somewhat annoying as you cannot lookup a window by
 * XID in any way, and must iterate through all of them looking
 * for a match.
 */
function getXidToWindow() {
    let xidToWindow = new Map();

    for (let i = 0; i < global.screen.n_workspaces; i++) {
        let ws = global.screen.get_workspace_by_index(i);
        ws.list_windows().map(function(w) {
            let xid = guessWindowXID(w);
	    if (xid != null) {
                xidToWindow.set(parseInt(xid), w);
            }
        });
    }
    return xidToWindow;
}

/**
 * Guesses the X ID of a window.
 *
 * This is the basic implementation that is sufficient for Nautilus
 * windows. The pixel-saver extension has a much more complex
 * implementation if we ever need it.
 */
function guessWindowXID(win) {
    try {
        return win.get_description().match(/0x[0-9a-f]+/)[0];
    } catch (err) {
        return null;
    }
}

var fm1Client = new FileManager1Client();
