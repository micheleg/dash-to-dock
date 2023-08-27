import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { General } from './preferences/general.js';
import { Launchers } from './preferences/launchers.js';
import { Behavior } from './preferences/behavior.js';
import { Appearance } from './preferences/appearance.js';

export default class DockPreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);

        this.initTranslations('dashtodock');

        // // load the icon theme
        // let iconPath = imports.misc.extensionUtils.getCurrentExtension()
        //     .dir.get_child("icons").get_path();
        // let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        // iconTheme.add_search_path(iconPath);
    }

    fillPreferencesWindow(window) {
        window._settings = this.getSettings('org.gnome.shell.extensions.dash-to-dock');

        window.add(new General(window._settings));
        window.add(new Launchers(window._settings));
        window.add(new Behavior(window._settings));
        window.add(new Appearance(window._settings));
        
        window.search_enabled = true;
    }
};