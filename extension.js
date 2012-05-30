// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Config = imports.misc.config;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

/**
 * versionGreaterThanOrEqualTo:
 * @minVer: minimum version required
 *
 * 
 * Check if current version is greater than or equal to minVer.
 * @minVer must be in the format <major>.<minor>.<point>.<micro>
 * Only <major> and <minor> are considered and must be provided
 */
function versionGreaterThanOrEqualTo(minVer) {

    let current = Config.PACKAGE_VERSION;
    let currentArray = current.split('.');
    let minVerArray = minVer.split('.');

    let major = currentArray[0];
    let minor = currentArray[1];
    let point = currentArray[2];

    if ( major >= minVerArray[0] && minor >= minVerArray[1]) {
        return true;
    }
    // else
    return false
}

// Try to support both 3.2 and 3.4 versions

let Intellihide;
let DockedDash;
let settings = null;

if( versionGreaterThanOrEqualTo('3.4') ){
    let Extension = imports.misc.extensionUtils.getCurrentExtension();
    let Convenience = Extension.imports.convenience;
    Intellihide = Extension.imports.intellihide;
    DockedDash = Extension.imports.dockedDash;
    
    settings = Convenience.getSettings('org.gnome.shell.extensions.dashtodock');
} 
else if( versionGreaterThanOrEqualTo('3.2') ){
    /* This identifier string comes from your installation directory */
    let Extension = imports.ui.extensionSystem.extensions["dash-to-dock@micxgx.gmail.com"];
    Intellihide = Extension.intellihide;
    DockedDash = Extension.dockedDash;
}


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
    intellihide = new Intellihide.intellihide(show, hide, dock.dash.actor, settings);

}

function disable() {
    dock.destroy();
    intellihide.destroy();

    dock=null;
    intellihide=null;
}




