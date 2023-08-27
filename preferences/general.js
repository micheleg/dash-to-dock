'use strict';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';


const General = GObject.registerClass({
    GTypeName: 'General'
},class General extends Adw.PreferencesPage{
    constructor(){
        super();
        
        // Set headerbar page info
        this.title = _('General')
        this.icon_name = 'dialog-information-symbolic'
        
        // create new preferences group
        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of the extension'),
        });
        this.add(group);
    
        // Create a new preferences row
        const row = new Adw.SwitchRow({
            title: _('Show Indicator'),
            subtitle: _('Whether to show the panel indicator'),
        });
        group.add(row);
        
        return this
    }
});

export { General }