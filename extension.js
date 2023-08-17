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
        this._conditionallyEnableDock();
    }

    _conditionallyEnableDock() {
        const toEnable = !Main.extensionManager._extensionOrder.includes(
            'dash-to-dock@micxgx.gmail.com');
        if (toEnable)
            dockManager = new DockManager(this);
        else
            dockManager?.destroy();
    }

    disable() {
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
