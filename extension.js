// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const MessageTray = imports.ui.messageTray;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedDash = Me.imports.dockedDash;

let settings;
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

    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dock = new DockedDash.dockedDash(settings);
    intellihide = new Intellihide.intellihide(show, hide, dock, settings);

    dock.updateNotificationCount();
    setNotificationUpdateCount(Lang.bind(dock, DockedDash.dockedDash.prototype.updateNotificationCount));
}

function disable() {
    resetNotificationUpdateCount();

    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();

    dock=null;
    intellihide=null;
    settings = null;
}

// MessageTray.Source._updateCount function is called on each notification event.
// What we do is not safe if other extension replaces this function.
let originalNotificationUpdateCount = null;

function setNotificationUpdateCount(callback) {
    originalNotificationUpdateCount = MessageTray.Source.prototype._updateCount;
    MessageTray.Source.prototype._updateCount = function () {
        callback(this);
        originalNotificationUpdateCount.call(this);
    }
}

function resetNotificationUpdateCount() {
    MessageTray.Source.prototype._updateCount = originalNotificationUpdateCount;
    originalNotificationUpdateCount = null;
}
