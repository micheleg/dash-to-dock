'use strict';

const { Adw, Gdk, GLib, Gtk, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

// import pages
const { Behavior } = Me.imports.preferences.behavior;
const { posAndSize } = Me.imports.preferences.posandsize;
const { Launchers } = Me.imports.preferences.launchers;
const { Apparence } = Me.imports.preferences.apparence;

function init() {
    ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    window.add(new posAndSize());
    window.add(new Launchers());
    window.add(new Behavior());
    window.add(new Apparence());
    window.search_enabled = true;
}
