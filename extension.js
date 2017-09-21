// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const moveClock = Me.imports.moveClock;
const disableHotCorner = Me.imports.disableHotCorner;
const Convenience = Me.imports.convenience;

let dockManager;

function init() {
    Convenience.initTranslations('dashtodock');
}

function enable() {
    moveClock.enable_clock_move();
	disableHotCorner.enable();
    dockManager = new Docking.DockManager();
}

function disable() {
	disableHotCorner.disable();
    moveClock.disable_clock_move();
    dockManager.destroy();

    dockManager=null;
}
