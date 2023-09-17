// launchers.js
'use strict'
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import Gio from 'gi://Gio'
import Adw from 'gi://Adw'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'

import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'

// register Launchers Page
const autoHidePageClass = GObject.registerClass({
    GTypeName: 'autoHidePage'
},class autoHidePageClass extends d2dprefsspage{
    constructor(settings){
        super(settings)
        this._settings = settings

        // Set page Title
        this.title = _('Auto Hide')     

        // ## Auto Hide Group
        const AutoHideGroup = new Adw.PreferencesGroup({
            title: _('Auto Hide'),
            description: _('Show the dock by mouse hover on the screen edge.')
        })
        const AutoHideGroupSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER
        })
        this._settings.bind(
            'intellihide', AutoHideGroupSwitch, 'active',
            Gio.SettingsBindFlags.DEFAULT
        )
        AutoHideGroup.set_header_suffix(AutoHideGroupSwitch)

        this.add(AutoHideGroup)
        // Full screen mode
        AutoHideGroup.add(this._toggleRow(
            'autohide-in-fullscreen',
            _('Enable in fullscreen mode.')            
        ))
        // Push to show
        AutoHideGroup.add(this._toggleRow(
            'require-pressure-to-show',
            _('Require pressure to show the dock "Push to show"'),
            _('Enable or disable requiring pressure to show the dock')
        ))
        // Show dock on urgent
        AutoHideGroup.add(this._toggleRow(
            'show-dock-urgent-notify',
            _('Show dock for urgent notifications.'),
            _('Show dock when urgent notifications are received.')            
        ))

        // ## Dodge Windows Group
        const DodgeWindowsGroup = new Adw.PreferencesGroup({
            title: _('Dodge Windows'),
            description: _('Show the dock when its not obstructing applications windows.')
        })
        const DodgeWindowsGroupSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER
        })
        this._settings.bind(
            'intellihide', DodgeWindowsGroupSwitch, 'active',
            Gio.SettingsBindFlags.DEFAULT
        )
        DodgeWindowsGroup.set_header_suffix(DodgeWindowsGroupSwitch)

        this.add(DodgeWindowsGroup)

        DodgeWindowsGroup.add(this._listRow(
            'intellihide-mode',
            [
                _('All Windows'),
                _('Only focesed aplications windows'),
                _('Only maximized windows'),
                _('Always on top')
            ],
            _('Mode'),
            _('Define which windows are considered for intellihide.')
        ))

        // ## Timeouts and Thresholds Group
        const TimeoutsThresholdsGroup = new Adw.PreferencesGroup({
            title: _('Dodge Windows'),
            description: _('Show the dock when its not obstructing applications windows.')
        })
        this.add(TimeoutsThresholdsGroup)
        // Animation duration (s)
        TimeoutsThresholdsGroup.add(this._spinBTNRow(
            'animation-time',
            3,
            new Gtk.Adjustment({
                lower: 0,
                upper: 1.000,
                step_increment: 0.050,
                page_increment: 1,
                page_size: 0
            }),
            _('Animation duration (s)')
        ))
        // Hide Timout (s)
        TimeoutsThresholdsGroup.add(this._spinBTNRow(
            'hide-delay',
            3,
            new Gtk.Adjustment({
                lower: 0.000,
                upper: 1.000,
                step_increment: 0.050,
                page_increment: 1,
                page_size: 0
            }),
            _('Hide Timout (s)')
        ))
        // Show Timeout (s)
        TimeoutsThresholdsGroup.add(this._spinBTNRow(
            'show-delay',
            3,
            new Gtk.Adjustment({
                lower: 0,
                upper: 1.000,
                step_increment: 0.050,
                page_increment: 1,
                page_size: 3
            }),
            _('Show Timeout (s)')
        ))
        // Presure Threshold (s)
        TimeoutsThresholdsGroup.add(this._spinBTNRow(
            'pressure-threshold',
            0,
            new Gtk.Adjustment({
                lower: 0,
                upper: 1000,
                step_increment: 50,
                page_increment: 1,
                page_size: 0
            }),
            _('Pressure threshold (s)'),
            _('Sets how much pressure is needed to show the dash.')
        ))

        // return self
        return this
    }
})
// export self to use in prefs.js
export { autoHidePageClass }