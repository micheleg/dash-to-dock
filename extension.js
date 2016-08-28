// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Docking = Me.imports.docking;

let settings;
let dockManager;

function init() {
}

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dockManager = new Docking.DockManager(settings);

    bindSettingsChanges();
}

function disable() {
    dockManager.destroy();
    settings.run_dispose();

    dockManager=null;
    settings = null;
}


function bindSettingsChanges() {
    // This settings change require a full reload.

    // It's easier to just reload the extension when the dock position changes
    // rather than working out all changes to the differen containers.
    settings.connect('changed::dock-position', function() {
        disable();
        enable();
    });
}
