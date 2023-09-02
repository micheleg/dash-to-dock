// launchers.js
'use strict';
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'

// register Launchers Page
const Launchers = GObject.registerClass({
    GTypeName: 'Launchers'
},class Launchers extends d2dprefsspage{
    constructor(settings){
        super(settings);

        this._settings = settings;
        // Set page Title and icon
        this.title = _('Launchers')
        this.icon_name = 'utilities-terminal-symbolic'

        // ## App Launchers
        const appLaunchersGroup = new Adw.PreferencesGroup({
            title: _('App launchers'),
            description: _('Visable app types'),
        });
        this.add(appLaunchersGroup);
        // show pined aplications
        appLaunchersGroup.add(this._toggleRow(
            'show-favorites',
            _('show pined aplications')            
        ));
        // Show running applications
        appLaunchersGroup.add(this._toggleRow(
            'show-running',
            _('Show running aplications')
        ));
        

        // Show volumes and devices
        appLaunchersGroup.add(this._toggleRow(
            'show-mounts',
            _('Show volumes and devices')
        ));        
        // only is mounted
        // include network volumes


        // Show Aplications icon
        appLaunchersGroup.add(this._toggleRow(
            'show-show-apps-button',
            _('Show Aplications icon')
        ));
        // show trash can
        appLaunchersGroup.add(this._toggleRow(
            'show-trash',
            _('Show Trash Icon'),
            _('Whether to show the Trash Icon')
        ));
        // show icon emblems
        appLaunchersGroup.add(this._toggleRow(
            'show-icons-emblems',
            _('Show emblens on aplications')
        ));

       
        // ## Launchers Priorities
        const launchersPrioritiesGroup = new Adw.PreferencesGroup({
            title: _('launchers Priorities'),
            // description: _('Prioritie launcher behavior'),
        });
        this.add(launchersPrioritiesGroup);

        // Show urgent windows despite curren workspace
        launchersPrioritiesGroup.add(this._toggleRow(
            'workspace-agnostic-urgent-windows',
            _('Show urgent windows despite curren workspace')
        ));
        // isolate workspaces
        launchersPrioritiesGroup.add(this._toggleRow(
            'isolate-workspaces',
            _('isolate workspaces')
        ));
        // Isolate monitors
        launchersPrioritiesGroup.add(this._toggleRow(
            'isolate-monitors',
            _('isolate Monitors')
        ));
        // Wiggle urgent aplications
        launchersPrioritiesGroup.add(this._toggleRow(
            'dance-urgent-applications',
            _('Wiggle Urgent Aplications')
        ));
        // keep the focues application always visable in the dash
        launchersPrioritiesGroup.add(this._toggleRow(
            'scroll-to-focused-application',
            _('Keep focused aplications always visable')
        ));

        // ## Additional launcher preferences
        const launchersPreferencesGroup = new Adw.PreferencesGroup({
            title: _('Additional launcher preferences'),
            // description: _('Prioritie launcher behavior'),
        });
        // show open window previews
        launchersPreferencesGroup.add(this._toggleRow(
            'show-windows-preview',
            _('show open window previews')
        ));

        

        // move ad bigginin of the dock
        // Animate Show Aplications
        // Put show aplications tn the edge when useing pannelmode

        // isolate volumes, divices and track from windows file mananger

        // show the numver of unread notifications

        // aplications-provided counters overide the notification counter



        // return self
        return this
    }
});
// export self to use in prefs.js
export { Launchers }