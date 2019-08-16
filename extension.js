// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const ExtensionSystem = imports.ui.extensionSystem;

// We declare this with var so it can be accessed by other extensions in
// GNOME Shell 3.26+ (mozjs52+).
var dockManager;


let _extensionlistenerId;

function init() {
    ExtensionUtils.initTranslations('dashtodock');
}

function enable() {
    /*
     * Listen to enabled extension, if Dash to Dock is on the list or become active,
     * we disable this dock.
     */
    _extensionlistenerId = ExtensionSystem.connect('extension-state-changed',
                                                   conditionallyenabledock);
    conditionallyenabledock();
}

function disable() {
    try {
        if (dockManager != null) {
            dockManager.destroy();
        }
    } catch(e) {
        log('Failed to destroy dockManager: %s'.format(e.message));
    } finally {
        if (_extensionlistenerId) {
            ExtensionSystem.disconnect(_extensionlistenerId);
            _extensionlistenerId = 0;
        }
    }
}

function conditionallyenabledock() {
    let to_enable = ExtensionSystem.extensionOrder.every((e) => {
        return e != 'dash-to-dock@micxgx.gmail.com';
    });

    // enable or disable dock depending on dock status and to_enable state
    if (to_enable && !dockManager) {
        dockManager = new Docking.DockManager();
    } else if (!to_enable && dockManager) {
        dockManager.destroy();
    }
}
