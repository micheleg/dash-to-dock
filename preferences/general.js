// general.js
'use strict';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import Gio from 'gi://Gio'
import Adw from 'gi://Adw'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'

import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'
import { MonitorsConfig } from '../conveniences/monitorsconfig.js'
import { autoHidePageClass } from './_autohide.js'

const General = GObject.registerClass({
    GTypeName: 'General'
},
class General extends d2dprefsspage{
    constructor(settings,extPrefs){
        super(settings)
        this._settings = settings
        this._monitorsConfig = new MonitorsConfig()

        // Set headerbar page info
        this.title = _('General')
        this.icon_name = 'dash-symbolic'
        
        // ## Position preferences group
        const PosGroup = new Adw.PreferencesGroup({
            title: _('Position'),
            description: _('General position of the dock'),
        })
        this.add(PosGroup)
    
        // Dock Monitor Position
        const monitorSelector = new Adw.ActionRow({
            title: _('Show the dock on')
        })
        PosGroup.add(monitorSelector)

        this.monitorSelectorList = new Gtk.ComboBoxText({
            valign: Gtk.Align.CENTER
        })
        this.monitorSelectorList.selected = this._settings.get_enum('dock-position')

        monitorSelector.add_suffix(this.monitorSelectorList)

        this._monitorsConfig.connect('updated',
            () => this._updateMonitorsSettings())
        this._settings.connect('changed::preferred-monitor',
            () => this._updateMonitorsSettings());
        this._settings.connect('changed::preferred-monitor-by-connector',
            () => this._updateMonitorsSettings());


        // Multi monitor toggle
        PosGroup.add(this._toggleRow(
            'multi-monitor',
            _('Show on all monitors')
        ));

        // Dock Screen Position
        PosGroup.add(this._listRow(
            'dock-position',
            [
                _('Top'),
                _('Right'),
                _('Bottom'),
                _('Left')
            ],
            _('Position on screen')
        ))

        // ## auto hide preferences group
        const AHGroup = new Adw.PreferencesGroup({
            title: _('Auto hide')
        })
        const AHGroupSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER
        })
        this._settings.bind(
            'autohide', AHGroupSwitch, 'active',
            Gio.SettingsBindFlags.DEFAULT
        )
        AHGroup.set_header_suffix(AHGroupSwitch)
        this.add(AHGroup)
    
        // Inteligent autohide
        const autoHideRow = new Adw.ActionRow({
            title: _('Inteligent autohide'),
            subtitle: _('Hide the dock when it obstrucs a windows of the current appliation.'),
            activatable: true
        })
        AHGroup.add(autoHideRow)

        autoHideRow.connect('activated', () => {
            this._autoHidePopup = new Adw.PreferencesWindow({
                title: _('Intelligent autohide customization'),
                transient_for: this.get_root(),
                defaultWidth: 480, //380
                defaultHeight: 550 //460
            })

            this._autoHidePopup.set_search_enabled(false)
            this._autoHidePopup.add(new autoHidePageClass(settings))
            this._autoHidePopup.present()
        })

        const goNextImage = new Gtk.Image({
            gicon: Gio.icon_new_for_string('go-next-symbolic'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        })
        autoHideRow.add_suffix(goNextImage)

        // ## Dock scale and size group
        const sizeGroup = new Adw.PreferencesGroup({
            title: _('Dock scale and size')
        })
        this.add(sizeGroup)


        // dock size limit
        sizeGroup.add(this._scaleRow(
            'height-fraction',
            {
                draw_value: false,
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 1,
                    page_increment: 0
                })
            },
            _('dock size limit'),
            _('Dock max height/width (fraction of available space)')
        ))
        // Panel mode: extent to the screen edge
        const pannelMode = this._expandRow(
            'extend-height',
            _('Panel mode'),
            _('Extent dock to the screen edge')
        )
        // Put show Aplications in a doc edge when using pannel mode
        pannelMode.add_row(this._toggleRow(
            'show-apps-always-in-the-edge',
            _('Move edge of the dock'),
            _('Show application button on the edge when using centered panel mode')
        ))
        pannelMode.add_row(this._toggleRow(
            'show-apps-at-top',
            _('Move at biginning of the dock'),
            _('Show application button on the other side of the dock')
        ))
        // Place icons tot the center
        pannelMode.add_row(this._toggleRow(
            'always-center-icons',
            _('Place icons tot the center')
        ))
        sizeGroup.add(pannelMode)
        // icon side limt
        sizeGroup.add(this._scaleRow(
            'dash-max-icon-size',
            {
                round_digits: false,
                digits: 0,
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 128,
                    step_increment: 1,
                    page_increment: 0
                })
            },
            _('Icon size limit')
        ))
        // fix icon size: scroll to reveal other icons
        sizeGroup.add(this._toggleRow(
            'icon-size-fixed',
            _('fix icon size'),
            _('scroll to reveal other icons')
        ))
        // preview scale
        sizeGroup.add(this._scaleRow(
            'preview-size-scale',
            {
                draw_value: false,
                digits: 2,
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 1,
                    step_increment: 0.1,
                    page_increment: 0
                })
            },
            _('preview scale'),
            _('Set the allowed maximum dash preview size scale. Allowed range: 0,00..1,00.')
        ))
       
        return this
    }

    _updateMonitorsSettings() {
        // Monitor options
        const preferredMonitor = this._settings.get_int('preferred-monitor');
        const preferredMonitorByConnector = this._settings.get_string('preferred-monitor-by-connector');
        // const dockMonitorCombo = this._builder.get_object('dock_monitor_combo');
        const dockMonitorCombo = this.monitorSelectorList

        this._monitors = [];
        dockMonitorCombo.remove_all();
        let primaryIndex = -1;

        // Add connected monitors
        for (const monitor of this._monitorsConfig.monitors) {
            if (!monitor.active && monitor.index !== preferredMonitor)
                continue;

            if (monitor.isPrimary) {
                dockMonitorCombo.append_text(
                    /* Translators: This will be followed by Display Name - Connector. */
                    `${_('Primary monitor: ') + monitor.displayName} - ${
                        monitor.connector}`);
                primaryIndex = this._monitors.length;
            } else {
                dockMonitorCombo.append_text(
                    /* Translators: Followed by monitor index, Display Name - Connector. */
                    `${_('Secondary monitor ') + (monitor.index + 1)} - ${
                        monitor.displayName} - ${monitor.connector}`);
            }

            this._monitors.push(monitor);

            if (monitor.index === preferredMonitor ||
                (preferredMonitor === -2 && preferredMonitorByConnector === monitor.connector))
                dockMonitorCombo.set_active(this._monitors.length - 1);
        }

        if (dockMonitorCombo.get_active() < 0 && primaryIndex >= 0)
            dockMonitorCombo.set_active(primaryIndex);
    }
})

export { General }