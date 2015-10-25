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


const appsWindowView = new imports.lang.Class({
    Name: 'WindowCloneLayout',
    Extends: imports.ui.workspace.Workspace,

    _init: function(app){

        this._app = app;
        this.parent(null, 0);

    },

    _isMyWindow: function(w){
        global.log([w, imports.gi.Shell.WindowTracker.get_default().get_window_app(w.meta_window), this._app]);
        return  imports.gi.Shell.WindowTracker.get_default().get_window_app(w.meta_window) == this._app;
    }

});

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dock = new Docking.DockedDash(settings);

    // Pretend I'm the dash: meant to make appgrd swarm animation come from the
    // right position of the appShowButton.
    oldDash  = Main.overview._dash;
    Main.overview._dash = dock.dash;
    bindSettingsChanges();

    const St = imports.gi.St;

    let a = new St.Bin({x_align: St.Align.START,
                                y_align: St.Align.START,
                                x_fill: true,
                                y_fill: true });
    let wp;
    a.setApp = function(app) {

        wp = new appsWindowView(app);
        Main.overview.viewSelector._wp = wp;
        wp.setFullGeometry(Main.layoutManager.monitors[0])
        wp.setActualGeometry(Main.layoutManager.monitors[0])
        a.set_child(wp.actor);

    
    };


    //p = Main.overview.viewSelector._Page(p)
    let p = Main.overview.viewSelector._addPage(a, 'test')
    Main.overview.viewSelector._appWindowsPage = p;
    Main.overview.viewSelector._a = a;


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
