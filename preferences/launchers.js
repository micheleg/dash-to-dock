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
        

        // row.connect('notify::selected', widget => {
        //     this._settings.set_enum(schmeaOBKJ, widget.selected);
        // });

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

        // a new group
        const group = new Adw.PreferencesGroup({
            title: _('Dock launchers'),
            description: _('Configure the Launchers'),
        });
        this.add(group);
    
        // Create a new preferences row
        // const row = new Adw.SwitchRow({
        //     title: _('Show Indicatorrrrrrrrrrrr'),
        //     subtitle: _('Whether to show the panel indicator'),
        // });
        // group.add(row);

        group.add(this._toggleRow(
            _('show pined aplications'),'',
            'show-favorites'
        ));
        
        group.add(this._toggleRow(
            _('Show running aplications'),'',
            'show-running'
        ));

        group.add(this._toggleRow(
            _('Show urgent windows despite curren workspace'),'',
            'workspace-agnostic-urgent-windows'
        ));

        group.add(this._toggleRow(
            _('isolate workspaces'),'',
            'isolate-monitors'
        ));

        group.add(this._toggleRow(
            _('Show volumes and devices'),'',
            'show-mounts'
        ));

        group.add(this._toggleRow(
            _('Show Aplications icon'),'',
            'show-show-apps-button'
        ));

        group.add(this._toggleRow(
            _('Show Trash Icon'),
            _('Whether to show the Trash Icon'),
            'show-trash'
        ));


        // To show group
        const showGroup = new Adw.PreferencesGroup({
            title: _('Show on dock'),
            description: _('Configure the Launchers'),
        });
        this.add(showGroup);


        // show pined aplications

        // Show running aplications
        // show open window previews
        // isolate workspaces
        // Show urgent windows despite curren workspace
        // Isolate monitors

        // keep the focues application always visable in the dash

        // Show Aplications icon ????

        // move ad bigginin of the dock
        // Animate Show Aplications
        // Put show aplications tn the edge when useing pannelmode

        // show trash can
        
        // Show volumes and devices
        // only is mounted
        // include network volumes

        // isolate volumes, divices and track from windows file mananger

        // Wiggle urgent aplications

        // show icon emblems

        // show the numver of unread notifications

        // aplications-provided counters overide the notification counter



        // return self
        return this
    }
});
// export self to use in prefs.js
export { Launchers }