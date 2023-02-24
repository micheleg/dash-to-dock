// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/* exported init, enable, disable */

const { main: Main } = imports.ui;
const { extensionUtils: ExtensionUtils } = imports.misc;

const Me = ExtensionUtils.getCurrentExtension();
const { docking: Docking } = Me.imports;

// We declare this with var so it can be accessed by other extensions in
// GNOME Shell 3.26+ (mozjs52+).
var dockManager;

let _extensionlistenerId;

function init() {
    ExtensionUtils.initTranslations('dashtodock');
}

/**
 *
 */
function enable() {
    /*
     * Listen to enabled extension, if Dash to Dock is on the list or become active,
     * we disable this dock.
     */
    _extensionlistenerId = Main.extensionManager.connect('extension-state-changed',
        conditionallyEnableDock);
    conditionallyEnableDock();
}

/**
 *
 */
function disable() {
    try {
        dockManager?.destroy();
    } catch (e) {
        logError(e, 'Failed to destroy dockManager');
    } finally {
        if (_extensionlistenerId) {
            Main.extensionManager.disconnect(_extensionlistenerId);
            _extensionlistenerId = 0;
        }
    }
}

function conditionallyEnableDock() {
    const toEnable = Main.extensionManager._extensionOrder.every(e =>
        e !== 'dash-to-dock@micxgx.gmail.com');

    // enable or disable dock depending on dock status and toEnable state
    if (toEnable && !dockManager)
        dockManager = new Docking.DockManager();
    else if (!toEnable && dockManager)
        dockManager.destroy();
}
