/*-------------------- move clock -------------------*/
const mSessionMode = imports.ui.sessionMode;
const mMain = imports.ui.main;

function enable_clock_move() {
    let mode = mMain.sessionMode.currentMode;
    let center = mSessionMode._modes[mode].panel.center;

    // do nothing if the clock isn't centred in this mode
    if ( center.indexOf('dateMenu') == -1 ) {
        return;
    }

    let centerBox = mMain.panel._centerBox;
    let rightBox = mMain.panel._rightBox;
    let dateMenu = mMain.panel.statusArea['dateMenu'];
    let children = centerBox.get_children();

    // only move the clock if it's in the centre box
    if ( children.indexOf(dateMenu.container) != -1 ) {
        centerBox.remove_actor(dateMenu.container);

        children = rightBox.get_children();
        rightBox.insert_child_at_index(dateMenu.container, children.length-1);
   }
}

function disable_clock_move() {
    let mode = mMain.sessionMode.currentMode;
    let center = mSessionMode._modes[mode].panel.center;

    // do nothing if the clock isn't centred in this mode
    if ( center.indexOf('dateMenu') == -1 ) {
        return;
    }

    let centerBox = mMain.panel._centerBox;
    let rightBox = mMain.panel._rightBox;
    let dateMenu = mMain.panel.statusArea['dateMenu'];
    let children = rightBox.get_children();

    // only move the clock back if it's in the right box
    if ( children.indexOf(dateMenu.container) != -1 ) {
        rightBox.remove_actor(dateMenu.container);
        centerBox.add_actor(dateMenu.container);
    }
}
/*---------------------------------------*/
