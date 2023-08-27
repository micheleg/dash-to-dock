'use strict';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';


const Launchers = GObject.registerClass({
    GTypeName: 'Launchers'
},class Launchers extends Adw.PreferencesPage{
    constructor(){
        super();

        this.title = _('Launchers')
        this.icon_name = 'utilities-terminal-symbolic'

        const group = new Adw.PreferencesGroup({
            title: _('Dock launchers'),
            description: _('Configure the Launchers'),
        });
        this.add(group);
    
        // Create a new preferences row
        const row = new Adw.SwitchRow({
            title: _('Show Indicatorrrrrrrrrrrr'),
            subtitle: _('Whether to show the panel indicator'),
        });
        group.add(row);
        
        return this
    }
});

export { Launchers }