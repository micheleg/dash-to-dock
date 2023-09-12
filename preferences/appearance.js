// appearance.js
'use strict';
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'
import Adw from 'gi://Adw'
import Gtk from 'gi://Gtk'
import GObject from 'gi://GObject'
import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'

// register Appearance Page
const Appearance = GObject.registerClass({
    GTypeName: 'Appearance'
},class Appearance extends d2dprefsspage{

    constructor(settings){
        super(settings);

        this._settings = settings;
        // Set page Title and icon
        this.title = _('Appearance')
        this.icon_name = 'applications-graphics-symbolic'

        // ## Appearance Options Group
        const optionsGroup = new Adw.PreferencesGroup({
            title: _(' Appearance Options'),
            description: _('Configure the appearance of the extension')
        })
        this.add(optionsGroup);
        // schrink the dach
        optionsGroup.add(this._toggleRow(
            'custom-theme-shrink',
            _('schrink the dach'),
            _('Save space by redusic padding and border radius')
        ))
        // Show overview on startup
        optionsGroup.add(this._toggleInvRow(
            'disable-overview-on-startup',
            _('Show overview on startup')
        ))
        // Use buildin theme
        optionsGroup.add(this._toggleRow(
            'apply-custom-theme',
            _('Use buildin theme'),
            _('Disable to customize to dock even more!')
        ))

        // ## Theme group
        const themeGroup = new Adw.PreferencesGroup({
            title: _('Theme')
        })
        this.add(themeGroup)
        // customize windws counter indicators
        themeGroup.add(this._listRow(
            'running-indicator-style',
            [
                _('DEFAULT'),
                _('DOTS'),
                _('SQUARES'),
                _('DASHES'),
                _('SEGMENTED'),
                _('SOLID'),
                _('CILIORA'),
                _('METRO')
            ],
            _('Customize windws counter indicators')
        ))
        // Customize dach color
        const BGExpander = this._expandRow(
            'custom-background-color',
            _('Customize the dach color'),
            _('Turn on to change the background color of the dock')
        )
        BGExpander.add_row(this._colorRow(
            'background-color',
            _('Background Color')
        ))
        themeGroup.add(BGExpander)
        // Enable customize opacity
        themeGroup.add(this._listRow(
            'transparency-mode',
            [
                _('DEFAULT'),
                _('FIXED'),
                _('DYNAMIC')
            ],
            _('Customize opacity mode')
        ))
         // Customize background opacity : background-opacity
        themeGroup.add(this._scaleRow(
            'background-opacity',
            _('Background Opacity')
        ))

        return this
    }
})

export { Appearance }