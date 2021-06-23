// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gio = imports.gi.Gio;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const FileManager1Iface = '<node><interface name="org.freedesktop.FileManager1">\
                               <property name="OpenWindowsWithLocations" type="a{sas}" access="read"/>\
                           </interface></node>';

const FileManager1Proxy = Gio.DBusProxy.makeProxyWrapper(FileManager1Iface);

/**
 * This class implements a client for the org.freedesktop.FileManager1 dbus
 * interface, and specifically for the OpenWindowsWithLocations property
 * which is published by Nautilus, but is not an official part of the interface.
 *
 * The property is a map from window identifiers to a list of locations open in
 * the window.
 */
var FileManager1Client = class DashToDock_FileManager1Client {

    constructor() {
        this._signalsHandler = new Utils.GlobalSignalsHandler();
        this._cancellable = new Gio.Cancellable();

        this._locationMap = new Map();
        this._proxy = new FileManager1Proxy(Gio.DBus.session,
                                            "org.freedesktop.FileManager1",
                                            "/org/freedesktop/FileManager1",
                                            (initable, error) => {
            // Use async construction to avoid blocking on errors.
            if (error) {
                if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    global.log(error);
            } else {
                this._updateLocationMap();
            }
        }, this._cancellable);

        this._signalsHandler.add([
            this._proxy,
            'g-properties-changed',
            this._onPropertyChanged.bind(this)
        ], [
            // We must additionally listen for Screen events to know when to
            // rebuild our location map when the set of available windows changes.
            global.workspace_manager,
            'workspace-switched',
            this._updateLocationMap.bind(this)
        ], [
            global.display,
            'window-entered-monitor',
            this._updateLocationMap.bind(this)
        ], [
            global.display,
            'window-left-monitor',
            this._updateLocationMap.bind(this)
        ]);
    }

    destroy() {
        this._cancellable.cancel();
        this._signalsHandler.destroy();
        this._proxy.run_dispose();
    }

    /**
     * Return an array of windows that are showing a location or
     * sub-directories of that location.
     */
    getWindows(location) {
        let ret = new Set();
    	let locationEsc = location;
	    
    	if (!location.endsWith('/')) { 
		locationEsc += '/'; 
	}
	    
        for (let [k,v] of this._locationMap) {
            if ((k + '/').startsWith(locationEsc)) {
                for (let l of v) {
                    ret.add(l);
                }
            }
        }
        return Array.from(ret);
    }

    _onPropertyChanged(proxy, changed, invalidated) {
        let property = changed.unpack();
        if (property &&
            ('OpenWindowsWithLocations' in property)) {
            this._updateLocationMap();
        }
    }

    _updateLocationMap() {
        let properties = this._proxy.get_cached_property_names();
        if (properties == null) {
            // Nothing to check yet.
            return;
        }

        if (properties.includes('OpenWindowsWithLocations')) {
            this._updateFromPaths();
        }
    }

    _updateFromPaths() {
        let pathToLocations = this._proxy.OpenWindowsWithLocations;
        let pathToWindow = getPathToWindow();

        let locationToWindow = new Map();
        for (let path in pathToLocations) {
            let locations = pathToLocations[path];
            for (let i = 0; i < locations.length; i++) {
                let l = locations[i];
                // Use a set to deduplicate when a window has a
                // location open in multiple tabs.
                if (!locationToWindow.has(l)) {
                    locationToWindow.set(l, new Set());
                }
                let window = pathToWindow.get(path);
                if (window != null) {
                    locationToWindow.get(l).add(window);
                }
            }
        }
        this._locationMap = locationToWindow;
        this.emit('windows-changed');
    }
}
Signals.addSignalMethods(FileManager1Client.prototype);

/**
 * Construct a map of gtk application window object paths to MetaWindows.
 */
function getPathToWindow() {
    let pathToWindow = new Map();

    for (let i = 0; i < global.workspace_manager.n_workspaces; i++) {
        let ws = global.workspace_manager.get_workspace_by_index(i);
        ws.list_windows().map(function(w) {
            let path = w.get_gtk_window_object_path();
	    if (path != null) {
                pathToWindow.set(path, w);
            }
        });
    }
    return pathToWindow;
}
