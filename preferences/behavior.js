'use strict';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';


const Behavior = GObject.registerClass({
    GTypeName: 'Behavior'
},class Behavior extends Adw.PreferencesPage{
    constructor(){
        super();

        this.title = _('Behavior')
        this.icon_name = 'utilities-terminal-symbolic'

        const group = new Adw.PreferencesGroup({
            title: _('Behavior'),
            description: _('Configure the Behavior of the extension'),
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

export { Behavior }