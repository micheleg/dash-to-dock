// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedDash = Me.imports.dockedDash;

const settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');

let intellihide;
let dock;

function init() {

}

function show(){

    dock.disableAutoHide();
}

function hide(){

    dock.enableAutoHide();
}

function enable() {

    dock = new DockedDash.dockedDash(settings);
    intellihide = new Intellihide.intellihide(show, hide, dock, settings);

}

function disable() {
    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();

    dock=null;
    intellihide=null;
    settings = null;
}

