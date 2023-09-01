// behavior.js
'use strict';
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

// register Behavior Page
const Behavior = GObject.registerClass({
    GTypeName: 'Behavior'
},class Behavior extends Adw.PreferencesPage{
    constructor(settings){
        super();

        this._settings = settings;
        // Set page Title and icon
        this.title = _('Behavior')
        // this.icon_name = 'utilities-terminal-symbolic'
        this.icon_name = 'general-symbolic'
        
        // ## keyboardGroup
        const keyboardGroup = new Adw.PreferencesGroup({
            title: _('Keyboard shortcuts')
        });
        this.add(keyboardGroup);

        // ## mouseGroup
        const mouseGroup = new Adw.PreferencesGroup({
            title: _('Mouse Actions')
        });
        this.add(mouseGroup);
        // click action
        // Shift+click action
        // Middle-click action
        // Shift+Middle-click action

        // scroll action
        const scrolWheelActions = new Gtk.StringList()
        scrolWheelActions.append(_('Do noting'));
        scrolWheelActions.append(_('Cycle trough windows'));
        scrolWheelActions.append(_('Switch workspace'));
        const scrolWheel = new Adw.ComboRow({
            title: _('Scroll action'),
            model: scrolWheelActions,
            selected: this._settings.get_enum('scroll-action')
        });
        scrolWheel.connect('notify::selected', widget => {
            this._settings.set_enum('scroll-action', widget.selected);
        });
        mouseGroup.add(scrolWheel);  

        return this
    }
});

export { Behavior }