// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const DockedDash = Me.imports.dockedDash;
const St = imports.gi.St;
const SingleAppWindowsView = Me.imports.singleAppWindowsView;

const Main = imports.ui.main;

let settings;
let dock;

let oldDash;

function init() {

}

function enable() {

    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dock = new DockedDash.dockedDash(settings);

    /* Pretend I'm the dash: meant to make appgrd swarm animation come from the
     * right position of the appShowButton.
     */
    oldDash  = Main.overview._dash;
    Main.overview._dash = dock.dash;
    bindSettingsChanges();

    let sview = new SingleAppWindowsView.singleAppWindowsView();
    //let sview = new SingleAppWindowsView.singleAppWindowsWorkspace();
    Main.overview.viewSelector._sview = sview ;
    Main.overview.viewSelector._sviewPage = Main.overview.viewSelector._addPage(sview.actor, "test", 'emblem-documents-symbolic');


//    a = new St.Widget();
//    a.set_style("border:4px solid blue;");
//    Main.overview.viewSelector._sviewPage = Main.overview.viewSelector._addPage(a, "test", 'emblem-documents-symbolic');

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

    /* It's easier to just reload the extension when the dock position changes
     * rather than working out all changes to the differen containers.
     */
    settings.connect('changed::dock-position', function(){
        disable();
        enable();
    });
}
