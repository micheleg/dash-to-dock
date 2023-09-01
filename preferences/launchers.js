// launchers.js
'use strict';
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

// register Launchers Page
const Launchers = GObject.registerClass({
    GTypeName: 'Launchers'
},class Launchers extends Adw.PreferencesPage{

    _toggleRow(title,subtitle,schmeaOBKJ){
        let row;
        if(subtitle == ''){
            row = new Adw.SwitchRow({
                title: title
            });
        }else{
            row = new Adw.SwitchRow({
                title: title,
                subtitle: subtitle,
            });
        }
        
        this._settings.bind(
            schmeaOBKJ, row, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        return row;
    }

    constructor(settings){
        super();

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
            _('show pined aplications'),'',
            'show-favorites'
        ));
        // Show running applications
        appLaunchersGroup.add(this._toggleRow(
            _('Show running aplications'),'',
            'show-running'
        ));
        

        // Show volumes and devices
        appLaunchersGroup.add(this._toggleRow(
            _('Show volumes and devices'),'',
            'show-mounts'
        ));        
        // only is mounted
        // include network volumes


        // Show Aplications icon
        appLaunchersGroup.add(this._toggleRow(
            _('Show Aplications icon'),'',
            'show-show-apps-button'
        ));
        // show trash can
        appLaunchersGroup.add(this._toggleRow(
            _('Show Trash Icon'),
            _('Whether to show the Trash Icon'),
            'show-trash'
        ));
        // show icon emblems
        appLaunchersGroup.add(this._toggleRow(
            _('Show emblens on aplications'),'',
            'show-icons-emblems'
        ));




        
        // ## Launchers Priorities
        const launchersPrioritiesGroup = new Adw.PreferencesGroup({
            title: _('launchers Priorities'),
            // description: _('Prioritie launcher behavior'),
        });
        this.add(launchersPrioritiesGroup);
        // Show urgent windows despite curren workspace
        launchersPrioritiesGroup.add(this._toggleRow(
            _('Show urgent windows despite curren workspace'),'',
            'workspace-agnostic-urgent-windows'
        ));
        // isolate workspaces
        launchersPrioritiesGroup.add(this._toggleRow(
            _('isolate workspaces'),'',
            'isolate-workspaces'
        ));
        // Isolate monitors
        launchersPrioritiesGroup.add(this._toggleRow(
            _('isolate Monitors'),'',
            'isolate-monitors'
        ));
        // Wiggle urgent aplications
        launchersPrioritiesGroup.add(this._toggleRow(
            _('Wiggle Urgent Aplications'),'',
            'dance-urgent-applications'
        ));
        // keep the focues application always visable in the dash
        launchersPrioritiesGroup.add(this._toggleRow(
            _('Keep focused aplications always visable'),'',
            'scroll-to-focused-application'
        ));

        // ## Additional launcher preferences
        const launchersPreferencesGroup = new Adw.PreferencesGroup({
            title: _('Additional launcher preferences'),
            // description: _('Prioritie launcher behavior'),
        });
        // show open window previews
        launchersPreferencesGroup.add(this._toggleRow(
            _('show open window previews'),'',
            'show-windows-preview'
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