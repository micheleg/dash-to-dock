'use strict';

const { Adw, Gdk, GLib, Gtk, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

// import pages
const { Behavior } = Me.imports.preferences.behavior;
const { General } = Me.imports.preferences.general;
const { Launchers } = Me.imports.preferences.launchers;
const { Apparence } = Me.imports.preferences.apparence;

function init() {
    ExtensionUtils.initTranslations('dashtodock');
}

function fillPreferencesWindow(window) {
    // Use the same GSettings schema as in `extension.js`
    const settings = ExtensionUtils.getSettings(
        'org.gnome.shell.extensions.dash-to-dock');

    window.add(new General(settings));
    window.add(new Launchers(settings));
    window.add(new Behavior(settings));
    window.add(new Apparence(settings));
    window.search_enabled = true;
}
