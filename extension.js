// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Main = imports.ui.main;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;

const Me = imports.ui.extensionSystem.extensions["dash-to-dock@micxgx.gmail.com"];
const Intellihide = Me.intellihide;
const DockedDash = Me.dockedDash;


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

    dock = new DockedDash.dockedDash();
    intellihide = new Intellihide.intellihide(show, hide, dock);

}

function disable() {
    intellihide.destroy();
    dock.destroy();

    dock=null;
    intellihide=null;
}

