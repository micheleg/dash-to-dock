// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;

let dockManager;

function init() {
}

function enable() {
    dockManager = new Docking.DockManager();
}

function disable() {
    dockManager.destroy();

    dockManager=null;
}
