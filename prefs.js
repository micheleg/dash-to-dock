'use strict';

const { Adw, Gdk, GLib, Gtk, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

// import pages
const { General } = Me.imports.preferences.general;
const { Launchers } = Me.imports.preferences.launchers;
const { Behavior } = Me.imports.preferences.behavior;
const { Appearance } = Me.imports.preferences.appearance;
const { About } = Me.imports.preferences.about;

function init() {
    ExtensionUtils.initTranslations('dashtodock');

    // load the icon theme
    let iconPath = Me.dir.get_child("icons").get_path();
    let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
    iconTheme.add_search_path(iconPath);
}

function fillPreferencesWindow(window) {
    // Use the same GSettings schema as in `extension.js`
    const settings = ExtensionUtils.getSettings(
        'org.gnome.shell.extensions.dash-to-dock');

    window.add(new General(settings));
    window.add(new Launchers(settings));
    window.add(new Behavior(settings));
    window.add(new Appearance(settings));
    window.add(new About(settings));

    window.search_enabled = true;
}
