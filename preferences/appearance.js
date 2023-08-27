'use strict';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';


const Appearance = GObject.registerClass({
    GTypeName: 'Appearance'
},class Appearance extends Adw.PreferencesPage{
    constructor(){
        super();

        this.title = _('Appearance')
        this.icon_name = 'dialog-information-symbolic'

        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of the extension'),
        });
        this.add(group);
    
        // Create a new preferences row
        // const row = new Adw.SwitchRow({
        //     title: _('Show Indicator'),
        //     subtitle: _('Whether to show the panel indicator'),
        // });
        // group.add(row);
        
        return this
    }
});

export { Appearance }