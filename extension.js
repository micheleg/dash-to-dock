// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Docking = Me.imports.docking;

const Main = imports.ui.main;

let settings;
let dock;
let oldDash;

function init() {
}

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dock = new Docking.DockedDash(settings);

    // Pretend I'm the dash: meant to make appgrd swarm animation come from the
    // right position of the appShowButton.
    oldDash  = Main.overview._dash;
    Main.overview._dash = dock.dash;
    bindSettingsChanges();
}

function disable() {
    dock.destroy();
    settings.run_dispose();
    Main.overview._dash = oldDash;

    dock=null;
    settings = null;
    oldDash=null;
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
