// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
const Main = imports.ui.main;

/* exported init, enable, disable */

const { extensionUtils: ExtensionUtils } = imports.misc;

const Me = ExtensionUtils.getCurrentExtension();
const { extensionSystem: ExtensionSystem } = imports.ui;
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
                                                         conditionallyenabledock);
    conditionallyenabledock();
}

/**
 *
 */
function disable() {
    try {
        if (dockManager) {
            dockManager.destroy();
        }
    } catch(e) {
        log('Failed to destroy dockManager: %s'.format(e.message));
    } finally {
        if (_extensionlistenerId) {
            Main.extensionManager.disconnect(_extensionlistenerId);
            _extensionlistenerId = 0;
        }
    }
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
