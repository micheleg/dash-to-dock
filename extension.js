// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const Convenience = Me.imports.convenience;
const ExtensionSystem = imports.ui.extensionSystem;

// We declare this with var so it can be accessed by other extensions in
// GNOME Shell 3.26+ (mozjs52+).
var dockManager;


let _extensionlistenerId;

function init() {
    Convenience.initTranslations('dashtodock');
}

function enable() {
    /*
     * Listen to enabled extension, if Dash to Dock is on the list or become active,
     * we disable this dock.
     */
    dockManager=null; // even if declared, we need to initialize it to not trigger a referenceError.
    _extensionlistenerId = ExtensionSystem.connect('extension-state-changed',
                                                   conditionallyenabledock);
    conditionallyenabledock();
}

function disable() {
    dockManager.destroy();

    dockManager=null;

    if (_extensionlistenerId) {
        ExtensionSystem.disconnect(_extensionlistenerId);
        _extensionlistenerId = 0;
    }
}

function conditionallyenabledock() {
    let to_enable = true;
    runningExtensions = ExtensionSystem.extensionOrder;
    for (let i = 0; i < runningExtensions.length; i++) {
        if (runningExtensions[i] === "dash-to-dock@micxgx.gmail.com") {
            to_enable = false;
        }
    }

    // enable or disable dock depending on dock status and to_enable state
    if (to_enable && !dockManager) {
        dockManager = new Docking.DockManager();
    } else if (!to_enable && dockManager) {
        dockManager.destroy();
        dockManager = null;
    }
}
