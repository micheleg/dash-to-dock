// appearance.js
'use strict';
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

// register Appearance Page
const Appearance = GObject.registerClass({
    GTypeName: 'Appearance'
},class Appearance extends Adw.PreferencesPage{

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
        this.title = _('Appearance')
        this.icon_name = 'applications-graphics-symbolic'

        // a new group 
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

        // Disable overvie toggle
        // settings.bind(
        //     'disable-overview-on-startup', this._disableOverviewOnStartup, 'active',
        //     Gio.SettingsBindFlags.DEFAULT
        // );

        // ## Options Group
        const optionsGroup = new Adw.PreferencesGroup({
            title: _('Options')
        });
        this.add(optionsGroup);
        // schrink the dach
        optionsGroup.add(this._toggleRow(
            _('schrink the dach'),
            _('Save space by redusic padding and border radius'),
            'custom-theme-shrink'
        ));
        // Show overview on startup
        optionsGroup.add(this._toggleRow(
            _('Show overview on startup'),'',
            'disable-overview-on-startup'
        ));
        // Use buildin theme
        optionsGroup.add(this._toggleRow(
            _('Use buildin theme'),
            _('Disable to customize to dock even more!'),
            'apply-custom-theme'
        ));

        // ## Theme group
        const themeGroup = new Adw.PreferencesGroup({
            title: _('Theme')
        });
        this.add(themeGroup);
        // customize windws counter indicators
        const RIStyleList = new Gtk.StringList()
        RIStyleList.append(_('DEFAULT'));
        RIStyleList.append(_('DOTS'));
        RIStyleList.append(_('SQUARES'));
        RIStyleList.append(_('DASHES'));
        RIStyleList.append(_('SEGMENTED'));
        RIStyleList.append(_('SOLID'));
        RIStyleList.append(_('CILIORA'));
        RIStyleList.append(_('METRO'));


        const RunningIndicatorStyle = new Adw.ComboRow({
            title: _('Customize windws counter indicators'),
            model: RIStyleList,
            selected: this._settings.get_enum('running-indicator-style')
        });
        themeGroup.add(RunningIndicatorStyle);
        RunningIndicatorStyle.connect('notify::selected', widget => {
            this._settings.set_enum('running-indicator-style', widget.selected);
        });        
        // Customize dach color
        // Customize opacity
        // opacity


        

        


        
        return this
    }
});

export { Appearance }