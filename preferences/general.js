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

    _monitorsConfig = new MonitorsConfig()

    _updateMonitorsSettings() {
        // Monitor options
        const preferredMonitor = this._settings.get_int('preferred-monitor')
        const preferredMonitorByConnector = this._settings.get_string('preferred-monitor-by-connector')
        const dockMonitorCombo = this._builder.get_object('dock_monitor_combo')

        this._monitors = []
        dockMonitorCombo.remove_all()
        let primaryIndex = -1

        // Add connected monitors
        for (const monitor of this._monitorsConfig.monitors) {
            if (!monitor.active && monitor.index !== preferredMonitor)
                continue;

            if (monitor.isPrimary) {
                dockMonitorCombo.append_text(
                    /* Translators: This will be followed by Display Name - Connector. */
                    `${__('Primary monitor: ') + monitor.displayName} - ${
                        monitor.connector}`)
                primaryIndex = this._monitors.length
            } else {
                dockMonitorCombo.append_text(
                    /* Translators: Followed by monitor index, Display Name - Connector. */
                    `${__('Secondary monitor ') + (monitor.index + 1)} - ${
                        monitor.displayName} - ${monitor.connector}`)
            }

            this._monitors.push(monitor)

            if (monitor.index === preferredMonitor ||
                (preferredMonitor === -2 && preferredMonitorByConnector === monitor.connector))
                dockMonitorCombo.set_active(this._monitors.length - 1)
        }

        if (dockMonitorCombo.get_active() < 0 && primaryIndex >= 0)
            dockMonitorCombo.set_active(primaryIndex)
    }

    constructor(settings,extPrefs){
        super(settings)

        this._settings = settings

        // Set headerbar page info
        this.title = _('General')
        this.icon_name = 'dash-symbolic'
        

        
        // ## Position preferences group
        const PosGroup = new Adw.PreferencesGroup({
            title: _('Position'),
            description: _('General position of the dock'),
        });
        this.add(PosGroup)
    

        // Dock Monitor Position
        const monitorSelector = new Adw.ActionRow({
            title: _('Show the dock on')
        });
        PosGroup.add(monitorSelector)

        // const monitorSelectorBox = new Gtk.ComboBoxText();
        // monitorSelectorBox.valign = 'center';
        // monitorSelector.append(monitorSelectorBox);

        // monitorSelectorBox.selected = this._settings.get_enum('dock-position');

        this._monitorsConfig.connect('updated',
            () => this._updateMonitorsSettings())
        // this._settings.connect('changed::preferred-monitor',
        //     () => this._updateMonitorsSettings());
        // this._settings.connect('changed::preferred-monitor-by-connector',
        //     () => this._updateMonitorsSettings());


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
        this.add(AHGroup)
    

        // Inteligent autohide


        // const row = new Adw.SwitchRow({
        //     title: _('Inteligent autohide'),
        //     subtitle: _('Hide the dock when it obstrucs a windows of the current appliation.'),
        // });
        // AHGroup.add(row);


        const autoHideRow = new Adw.ActionRow({
            title: _('Inteligent autohide'),
            subtitle: _('Hide the dock when it obstrucs a windows of the current appliation.'),
        })
        AHGroup.add(autoHideRow)

        const goNextImage = new Gtk.Image({
            gicon: Gio.icon_new_for_string('go-next-symbolic'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        })
        autoHideRow.add_suffix(goNextImage)



        // const autoHideRow = new SettingRow({
        //     title: _('Menu Layout'),
        //     subtitle: _('Choose a layout style for the menu'),
        //     icon_name: 'settings-layouts-symbolic',
        // });     

        // const autoHidePage = new autoHidePageClass(this._settings);
        // autoHideRow.settingPage = autoHidePage;


        // autoHideRow.connect('activated', () => {
        //     if (settingPage.setActiveLayout)
        //         settingPage.setActiveLayout(this._settings.get_enum('menu-layout'));

        //     this._window.present_subpage(settingPage);
        //     settingPage.resetScrollAdjustment();
        // });

        // autoHideRow.settingPage.connect('response', (_w, response) => {
        //     // if (response === Gtk.ResponseType.APPLY) {
        //     //     const layoutName = SettingsUtils.getMenuLayoutName(this._settings.get_enum('menu-layout'));
        //     //     this.tweaksRow.title = _('%s Layout Tweaks').format(_(layoutName));
        //     // }
        // });



        // ## Dock scale and size group
        const sizeGroup = new Adw.PreferencesGroup({
            title: _('Dock scale and size')
        })
        this.add(sizeGroup)

        
        return this
    }
})

export { General }