// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {DockManager} from './docking.js';
import {Main} from './dependencies/shell/ui.js';
import {Extension} from './dependencies/shell/extensions/extension.js';

// We export this so it can be accessed by other extensions
export let dockManager;

export default class DashToDockExtension extends Extension.Extension {
    enable() {
        this._extensionListenerId = Main.extensionManager.connect(
            'extension-state-changed', () => this._conditionallyEnableDock());

        // TODO: Remove this when upstream will disable extensions on shutdown
        // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/4214
        this._shutdownID = global.connect('shutdown', () => this.disable());

        this._conditionallyEnableDock();
    }

    _conditionallyEnableDock() {
        const toEnable = !Main.extensionManager._extensionOrder.includes(
            'dash-to-dock@micxgx.gmail.com');
        if (toEnable && !dockManager) {
            // TODO: Remove this when upstream will disable extensions on shutdown
            // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/4214
            this._shutdownID = global.connect('shutdown', () => this.disable());

            dockManager = new DockManager(this);
        } else if (!toEnable && dockManager) {
            dockManager?.destroy();
        }
    }

    disable() {
        global.disconnect(this._shutdownID);
        delete this._shutdownID;

        try {
            dockManager?.destroy();
            dockManager = null;
        } catch (e) {
            logError(e, 'Failed to destroy dockManager');
        } finally {
            Main.extensionManager.disconnect(this._extensionListenerId);
        }
    }
}
