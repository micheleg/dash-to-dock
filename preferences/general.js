'use strict';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { MonitorsConfig } from '../conveniences/monitorsconfig.js'


const General = GObject.registerClass({
    GTypeName: 'General'
},
class General extends Adw.PreferencesPage{

    _monitorsConfig = new MonitorsConfig();

    _updateMonitorsSettings() {
        // Monitor options
        const preferredMonitor = this._settings.get_int('preferred-monitor');
        const preferredMonitorByConnector = this._settings.get_string('preferred-monitor-by-connector');
        const dockMonitorCombo = this._builder.get_object('dock_monitor_combo');

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
                    `${__('Primary monitor: ') + monitor.displayName} - ${
                        monitor.connector}`);
                primaryIndex = this._monitors.length;
            } else {
                dockMonitorCombo.append_text(
                    /* Translators: Followed by monitor index, Display Name - Connector. */
                    `${__('Secondary monitor ') + (monitor.index + 1)} - ${
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

    constructor(settings,extPrefs){
        super();

        this._settings = settings;

        // Set headerbar page info
        this.title = _('General')
        this.icon_name = 'dialog-information-symbolic'
        
        // ---------------------------------
        // ## Position preferences group
        // ---------------------------------
        const PosGroup = new Adw.PreferencesGroup({
            title: _('Position'),
            description: _('General position of the dock'),
        });
        this.add(PosGroup);
    
        // ## Dock Monitor Position
        // ---------------------------------
        const monitorSelector = new Adw.ActionRow({
            title: _('Show the dock on')
        });
        PosGroup.add(monitorSelector);

        // ## Dock Screen Position
        // ---------------------------------

        const positionList = new Gtk.StringList()
        positionList.append(_('Top'));
        positionList.append(_('Right'));
        positionList.append(_('Bottom'));
        positionList.append(_('Left'));

        const dockPositionSelector = new Adw.ComboRow({
            title: _('Position on screen'),
            model: positionList,
            selected: this._settings.get_enum('dock-position')
        });
        PosGroup.add(dockPositionSelector);
        
        dockPositionSelector.connect('notify::selected', widget => {
            this._settings.set_enum('dock-position', widget.selected);
        });

        // ---------------------------------
        // ## ## auto hide preferences group
        // ---------------------------------
        const AHGroup = new Adw.PreferencesGroup({
            title: _('Auto hide')
        });
        this.add(AHGroup);
    

        // ## Inteligent autohide
        // ---------------------------------
        const row = new Adw.SwitchRow({
            title: _('Inteligent autohide'),
            subtitle: _('Hide the dock when it obstrucs a windows of the current appliation.'),
        });
        AHGroup.add(row);
        
        return this
    }
}
);

export { General }