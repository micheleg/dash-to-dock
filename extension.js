// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const Locations = Me.imports.locations;
const ExtensionSystem = imports.ui.extensionSystem;

// We declare this with var so it can be accessed by other extensions in
// GNOME Shell 3.26+ (mozjs52+).
var dockManager;


let _extensionlistenerId;

function init() {
    ExtensionUtils.initTranslations('dashtodockpop');
}

function enable() {
    /*
     * Listen to enabled extension, if Dash to Dock is on the list or become active,
     * we disable this dock.
     */
    _extensionlistenerId = Main.extensionManager.connect('extension-state-changed',
                                                         conditionallyenabledock);
    conditionallyenabledock();
}

function disable() {

        if (dockManager != null) {

            if (dockManager._optionalScrollCycleWindowsDeadTimeId){
                GLib.Source.remove(dockManager._optionalScrollCycleWindowsDeadTimeId);
                dockManager._optionalScrollCycleWindowsDeadTimeId = null;
            }

            if (dockManager._dockDwellTimeoutId){
                GLib.Source.remove(dockManager._dockDwellTimeoutId);
                dockManager._dockDwellTimeoutId = null;
            }

            if (dockManager.recentlyClickedAppLoopId){
                GLib.Source.remove(dockManager.recentlyClickedAppLoopId);
                this.recentlyClickedAppLoopId = null;
            }

            if (dockManager._ensureActorVisibilityTimeoutId){
                GLib.Source.remove(dockManager._ensureActorVisibilityTimeoutId);
                dockManager._ensureActorVisibilityTimeoutId = null;
            }
            if(dockManager._numberOverlayTimeoutId){
                GLib.Source.remove(dockManager._numberOverlayTimeoutId);
                dockManager._numberOverlayTimeoutId = null;
            }
            if (dockManager._triggerTimeoutId){
                GLib.Source.remove(dockManager._triggerTimeoutId);
                dockManager._triggerTimeoutId = null;
            }

            if (dockManager.locationId){
                GLib.Source.remove(dockManager.locationId)
                dockManager.locationId = null;
            }

            dockManager.destroy();

            if (_extensionlistenerId) {
                Main.extensionManager.disconnect(_extensionlistenerId);
                _extensionlistenerId = null;
            }

        }

        dockManager = null;

}

function conditionallyenabledock() {
    let to_enable = Main.extensionManager._extensionOrder.every((e) => {
        return e != 'dash-to-dock@micxgx.gmail.com';
    });

    // enable or disable dock depending on dock status and to_enable state
    if (to_enable && !dockManager) {
        dockManager = new Docking.DockManager();
    } else if (!to_enable && dockManager) {
        dockManager.destroy();
    }
}
