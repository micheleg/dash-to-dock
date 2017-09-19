// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const Convenience = Me.imports.convenience;

const Gio = imports.gi.Gio;

let dockManager;

let _enabledextensionsettings;
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
    _enabledextensionsettings = new Gio.Settings({ schema_id: 'org.gnome.shell' });
    _extensionlistenerId = _enabledextensionsettings.connect(
        'changed::enabled-extensions',
        conditionallyenabledock);
    conditionallyenabledock();
}

function disable() {
    dockManager.destroy();

    dockManager=null;

    if (_extensionlistenerId) {
        _enabledextensionsettings.disconnect(_extensionlistenerId);
        _extensionlistenerId = 0;
    }
}

function conditionallyenabledock() {
    let to_enable = true;
    let extensions = _enabledextensionsettings.get_strv('enabled-extensions');
    for (let i = 0; i < extensions.length; i++) {
        if (extensions[i] === "dash-to-dock@micxgx.gmail.com") {
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