// import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
// import GObject from 'gi://GObject';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { General } from './preferences/general.js';

export default class DockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {

        window.add(new General());

        const OtherPage = new Adw.PreferencesPage({
            title: _('Other Page'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(OtherPage);

    }
};