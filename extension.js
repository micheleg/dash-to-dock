// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {DockManager} from './docking.js';
import {Extension} from './dependencies/shell/extensions/extension.js';

// We export this so it can be accessed by other extensions
export let dockManager;

export default class DashToDockExtension extends Extension.Extension {
    enable() {
        // TODO: Remove this when upstream will disable extensions on shutdown
        // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/4214
        global.connectObject('shutdown', () => this.disable(), this);
        dockManager = new DockManager(this);
    }

    disable() {
        global.disconnectObject(this);
        dockManager?.destroy();
        dockManager = null;
    }
}
