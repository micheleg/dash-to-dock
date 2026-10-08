// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    GLib,
    GObject,
    Meta,
} from './dependencies/gi.js';

import {DestroyableObject} from './destroyableObject.js';

import {
    Docking,
    Utils,
} from './imports.js';

// A good compromise between reactivity and efficiency; to be tuned.
const INTELLIHIDE_CHECK_INTERVAL = 100;

const OverlapStatus = Object.freeze({
    UNDEFINED: -1,
    FALSE: 0,
    TRUE: 1,
});

const IntellihideMode = Object.freeze({
    ALL_WINDOWS: 0,
    FOCUS_APPLICATION_WINDOWS: 1,
    MAXIMIZED_WINDOWS: 2,
    ALWAYS_ON_TOP: 3,
});

// List of windows type taken into account. Order is important (keep the original
// enum order).
const handledWindowTypes = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DOCK,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN,
    Meta.WindowType.DROPDOWN_MENU,
];

// List of applications, ignore windows of these applications in considering intellihide
const ignoreApps = ['com.rastersoft.ding', 'com.desktop.ding'];

/**
 * A rough and ugly implementation of the intellihide behaviour.
 * Intallihide object: emit 'status-changed' signal when the overlap of windows
 * with the provided targetBoxClutter.ActorBox changes;
 */
export class Intellihide extends DestroyableObject {
    static [GObject.signals] = {
        'status-changed': {param_types: [GObject.TYPE_INT]},
    };

    static {
        /* eslint-disable no-invalid-this */
        GObject.registerClass(this);
        /* eslint-enable no-invalid-this */
    }

    constructor(monitorIndex) {
        super();

        // Load settings
        this._monitorIndex = monitorIndex;

        this._focusApp = null; // The application whose window is focused.
        this._topApp = null; // The application whose window is on top on the monitor with the dock.

        this._status = OverlapStatus.UNDEFINED;
        this._targetBox = null;

        this._checkOverlapTimeoutContinue = false;
        this._checkOverlapTimeoutId = 0;

        // Connect global signals
        global.display.connectObject(
            // Add signals on windows created from now on
            'window-created', (...args) => this._windowCreated(...args),
            // triggered for instance when the window list order changes,
            // included when the workspace is switched
            'restacked', (...args) => this._checkOverlap(...args),
            this);

        // when windows are alwasy on top, the focus window can change
        // without the windows being restacked. Thus monitor window focus change.
        Docking.DockManager.windowTracker.connectObject(
            'notify::focus-app', (...args) => this._checkOverlap(...args), this);

        // update wne monitor changes, for instance in multimonitor when monitor are attached
        Utils.getMonitorManager().connectObject(
            'monitors-changed', (...args) => this._checkOverlap(...args), this);

        // Window signals
        global.get_window_actors().forEach(wa => this._addWindowSignals(wa));
    }

    destroy() {
        if (this._checkOverlapTimeoutId > 0) {
            GLib.source_remove(this._checkOverlapTimeoutId);
            this._checkOverlapTimeoutId = 0;
        }

        super.destroy();
    }

    _windowCreated(display, metaWindow) {
        this._addWindowSignals(metaWindow.get_compositor_private());
        this._doCheckOverlap();
    }

    _addWindowSignals(wa) {
        if (!this._handledWindow(wa))
            return;

        wa.connectObject('notify::allocation', () => this._checkOverlap(), this);
    }

    updateTargetBox(box) {
        this._targetBox = box;
        this._checkOverlap();
    }

    forceUpdate() {
        this._status = OverlapStatus.UNDEFINED;
        this._doCheckOverlap();
    }

    getOverlapStatus() {
        return this._status === OverlapStatus.TRUE;
    }

    _checkOverlap() {
        if (!this._targetBox)
            return;

        /* Limit the number of calls to the doCheckOverlap function */
        if (this._checkOverlapTimeoutId) {
            this._checkOverlapTimeoutContinue = true;
            return;
        }

        this._doCheckOverlap();

        this._checkOverlapTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, INTELLIHIDE_CHECK_INTERVAL, () => {
                this._doCheckOverlap();
                if (this._checkOverlapTimeoutContinue) {
                    this._checkOverlapTimeoutContinue = false;
                    return GLib.SOURCE_CONTINUE;
                } else {
                    this._checkOverlapTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            });
    }

    _doCheckOverlap() {
        if (!this._targetBox)
            return;

        let overlaps = OverlapStatus.FALSE;
        let windows = global.get_window_actors().filter(wa => this._handledWindow(wa));

        if (windows.length > 0) {
            /*
             * Get the top window on the monitor where the dock is placed.
             * The idea is that we dont want to overlap with the windows of the topmost application,
             * event is it's not the focused app -- for instance because in multimonitor the user
             * select a window in the secondary monitor.
             */

            let topWindow = null;
            for (let i = windows.length - 1; i >= 0; i--) {
                const metaWin = windows[i].get_meta_window();
                if (metaWin.get_monitor() === this._monitorIndex) {
                    topWindow = metaWin;
                    break;
                }
            }

            if (topWindow) {
                const {windowTracker} = Docking.DockManager;
                this._topApp = windowTracker.get_window_app(topWindow);
                // If there isn't a focused app, use that of the window on top
                this._focusApp = windowTracker.focus_app || this._topApp;

                windows = windows.filter(this._intellihideFilterInteresting, this);

                for (let i = 0;  i < windows.length; i++) {
                    const win = windows[i].get_meta_window();

                    if (win) {
                        const rect = win.get_frame_rect();

                        const test = (rect.x < this._targetBox.x2) &&
                                   (rect.x + rect.width > this._targetBox.x1) &&
                                   (rect.y < this._targetBox.y2) &&
                                   (rect.y + rect.height > this._targetBox.y1);

                        if (test) {
                            overlaps = OverlapStatus.TRUE;
                            break;
                        }
                    }
                }
            }
        }

        if (this._status !== overlaps) {
            this._status = overlaps;
            this.emit('status-changed', this._status);
        }
    }

    // Filter interesting windows to be considered for intellihide.
    // Consider all windows visible on the current workspace.
    // Optionally skip windows of other applications
    _intellihideFilterInteresting(wa) {
        const metaWin = wa.get_meta_window();
        const currentWorkspace = global.workspace_manager.get_active_workspace_index();
        const workspace = metaWin.get_workspace();
        const workspaceIndex = workspace.index();

        // Depending on the intellihide mode, exclude non-relevent windows
        switch (Docking.DockManager.settings.intellihideMode) {
        case IntellihideMode.ALL_WINDOWS:
            // Do nothing
            break;

        case IntellihideMode.FOCUS_APPLICATION_WINDOWS:
            // Skip windows of other apps
            if (this._focusApp) {
                // The DropDownTerminal extension is not an application per se
                // so we match its window by wm class instead
                if (metaWin.get_wm_class() === 'DropDownTerminalWindow')
                    return true;

                const {windowTracker} = Docking.DockManager;
                const currentApp = windowTracker.get_window_app(metaWin);
                const focusWindow = global.display.get_focus_window();

                // Consider half maximized windows side by side
                // and windows which are alwayson top
                if (currentApp !== this._focusApp && currentApp !== this._topApp &&
                    !((focusWindow && focusWindow.maximized_vertically &&
                       !focusWindow.maximized_horizontally) &&
                     (metaWin.maximized_vertically && !metaWin.maximized_horizontally) &&
                     metaWin.get_monitor() === focusWindow.get_monitor()) &&
                        !metaWin.is_above())
                    return false;
            }
            break;

        case IntellihideMode.MAXIMIZED_WINDOWS:
            // Skip unmaximized windows
            if (!metaWin.maximized_vertically && !metaWin.maximized_horizontally && !metaWin.fullscreen)
                return false;
            break;

        case IntellihideMode.ALWAYS_ON_TOP:
            // Always on top, except for fullscreen windows
            if (this._focusApp) {
                const {focusWindow} = global.display;
                if (!focusWindow?.fullscreen)
                    return false;
            }
            break;
        }

        if (workspaceIndex === currentWorkspace && metaWin.showing_on_its_workspace())
            return true;
        else
            return false;
    }

    // Filter windows by type
    // inspired by Opacify@gnome-shell.localdomain.pl
    _handledWindow(wa) {
        const metaWindow = wa.get_meta_window();

        if (!metaWindow)
            return false;

        // The DING extension desktop window needs to be excluded
        // so we match its window by application id and window property.
        const wmApp = metaWindow.get_gtk_application_id();
        if (ignoreApps.includes(wmApp) && metaWindow.is_skip_taskbar())
            return false;

        // The DropDownTerminal extension uses the POPUP_MENU window type hint
        // so we match its window by wm class instead
        if (metaWindow.get_wm_class() === 'DropDownTerminalWindow')
            return true;

        const wtype = metaWindow.get_window_type();
        for (let i = 0; i < handledWindowTypes.length; i++) {
            const hwtype = handledWindowTypes[i];
            if (hwtype === wtype)
                return true;
            else if (hwtype > wtype)
                return false;
        }
        return false;
    }
}
