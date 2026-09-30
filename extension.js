// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {DockManager as BaseDockManager} from './docking.js';
import {Utils} from './imports.js';
import {Extension} from './dependencies/shell/extensions/extension.js';

class DockManager extends BaseDockManager {
    _bindSettingsChanges() {
        super._bindSettingsChanges();
        this._signalsHandler.add(
            this._settings,
            'changed::hide-if-monitor-unavailable',
            this._toggle.bind(this));
    }

    _createDocks() {
        if (this.settings.hideIfMonitorUnavailable &&
            !this.settings.multiMonitor &&
            this.settings.preferredMonitor === -2 &&
            this.settings.preferredMonitorByConnector !== 'primary') {
            const monitorManager = Utils.getMonitorManager();
            const preferredMonitorIndex = monitorManager.get_monitor_for_connector(
                this.settings.preferredMonitorByConnector);

            if (preferredMonitorIndex < 0)
                return;
        }

        super._createDocks();
    }
}

// We export this so it can be accessed by other extensions
export let dockManager;

export default class DashToDockExtension extends Extension.Extension {
    enable() {
        // TODO: Remove this when upstream will disable extensions on shutdown
        // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/4214
        this._shutdownID = global.connect('shutdown', () => this.disable());
        dockManager = new DockManager(this);
    }

    disable() {
        global.disconnect(this._shutdownID);
        delete this._shutdownID;
        dockManager?.destroy();
        dockManager = null;
    }
}
