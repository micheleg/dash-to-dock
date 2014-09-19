// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedDash = Me.imports.dockedDash;

const Main = imports.ui.main;

let settings;
let intellihide;
let dock;

let oldDash;

function init() {

}

function show(){

    dock.disableAutoHide();
}

function hide(){

    dock.enableAutoHide();
}

function enable() {

    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dock = new DockedDash.dockedDash(settings);
    intellihide = new Intellihide.intellihide(show, hide, dock, settings);

    /* Pretend I'm the dash: meant to make appgrd swarm animation come from the
     * right position of the appShowButton.
     */
    oldDash  = Main.overview._dash;
    Main.overview._dash = dock.dash;
}

function disable() {
    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();
    Main.overview._dash = oldDash;

    dock=null;
    intellihide=null;
    settings = null;
    oldDash=null;
}

