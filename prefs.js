// prefs.js
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

// Import pages
import { General } from './preferences/general.js';
import { Launchers } from './preferences/launchers.js';
import { Behavior } from './preferences/behavior.js';
import { Appearance } from './preferences/appearance.js';

// Generate window
export default class DockPreferences extends ExtensionPreferences {
    constructor(metadata) {
        // init whit metadata
        super(metadata);
        // init tramslations
        this.initTranslations('dashtodock');
    }

    fillPreferencesWindow(window) {
        // Helpers
        const settings = this.getSettings('org.gnome.shell.extensions.dash-to-dock');
        const iconPath = `${this.path}/icons`;

        // Add new icons
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        if (!iconTheme.get_search_path().includes(iconPath))
            iconTheme.add_search_path(iconPath);

        // Add pref pages
        window.add(new General(settings));
        window.add(new Launchers(settings));
        window.add(new Behavior(settings));
        window.add(new Appearance(settings));
        
        // window.search_enabled = true;
        window.set_search_enabled(true);
    }
};