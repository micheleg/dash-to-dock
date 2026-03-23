import {Atk, Clutter} from './dependencies/gi.js';

import {
    Main,
    SearchController,
    Workspace,
    WorkspaceThumbnail,
} from './dependencies/shell/ui.js';

import {Utils} from './imports.js';

const APP_SPREAD_RESTORE_ACTION = 'dock-app-spread-restore';

export class AppSpread {
    constructor() {
        this.app = null;
        this.supported = true;
        this.windows = [];

        // fail early and do nothing, if mandatory gnome shell functions are missing
        if (Main.overview.isDummy ||
            !Workspace?.Workspace?.prototype._isOverviewWindow ||
            !WorkspaceThumbnail?.WorkspaceThumbnail?.prototype._isOverviewWindow) {
            log('Dash to dock: Unable to temporarily replace shell functions ' +
                'for app spread - using previews instead');
            this.supported = false;
            return;
        }

        this._signalHandlers = new Utils.GlobalSignalsHandler();
        this._methodInjections = new Utils.InjectionsHandler();
        this._vfuncInjections = new Utils.VFuncInjectionsHandler();
    }

    get isInAppSpread() {
        return !!this.app;
    }

    destroy() {
        if (!this.supported)
            return;
        this._hideAppSpread();
        this._signalHandlers.destroy();
        this._methodInjections.destroy();
        this._vfuncInjections.destroy();
    }

    toggle(app) {
        const newApp = this.app !== app;
        if (this.app)
            Main.overview.hide(); // also triggers hook 'hidden'

        if (app && newApp)
            this._showAppSpread(app);
    }

    _updateWindows() {
        this.windows = this.app.get_windows();
    }

    _restoreDefaultWindows() {
        const {workspaceManager} = global;

        for (let i = 0; i < workspaceManager.nWorkspaces; i++) {
            const metaWorkspace = workspaceManager.get_workspace_by_index(i);
            metaWorkspace.list_windows().forEach(w => metaWorkspace.emit('window-added', w));
        }
    }

    _filterWindows() {
        const {workspaceManager} = global;

        for (let i = 0; i < workspaceManager.nWorkspaces; i++) {
            const metaWorkspace = workspaceManager.get_workspace_by_index(i);
            metaWorkspace.list_windows().filter(w => !this.windows.includes(w)).forEach(
                w => metaWorkspace.emit('window-removed', w));
        }
    }

    _restoreDefaultOverview() {
        this._hideAppSpread();
        this._restoreDefaultWindows();
    }

    _showAppSpread(app) {
        if (this.isInAppSpread)
            return;

        // Checked in overview "hide" event handler _hideAppSpread
        this.app = app;
        this._updateWindows();

        // we need to hook into overview 'hidden' like this, in case app spread
        // overview is hidden by choosing another app it should then do its
        // cleanup too
        this._signalHandlers.add(Main.overview, 'hidden', () => this._hideAppSpread());

        const appSpread = this;
        this._methodInjections.add([
            // Filter workspaces to only show current app windows
            Workspace.Workspace.prototype, '_isOverviewWindow',
            function (originalMethod, window) {
                /* eslint-disable no-invalid-this */
                const isOverviewWindow = originalMethod.call(this, window);
                return isOverviewWindow && appSpread.windows.includes(window);
                /* eslint-enable no-invalid-this */
            },
        ],
        [
            // Filter thumbnails to only show current app windows
            WorkspaceThumbnail.WorkspaceThumbnail.prototype, '_isOverviewWindow',
            function (originalMethod, windowActor) {
                /* eslint-disable no-invalid-this */
                const isOverviewWindow = originalMethod.call(this, windowActor);
                return isOverviewWindow && appSpread.windows.includes(windowActor.metaWindow);
                /* eslint-enable no-invalid-this */
            },
        ]);

        const activitiesButton = Main.panel.statusArea?.activities;

        if (activitiesButton) {
            this._signalHandlers.add(Main.overview, 'showing', () => {
                activitiesButton.remove_style_pseudo_class('overview');
                activitiesButton.remove_accessible_state(Atk.StateType.CHECKED);
            });

            let hasEventVFunc = false;
            try {
                hasEventVFunc = !!activitiesButton.constructor.prototype.vfunc_event;
            } catch {}

            if (hasEventVFunc) {
                this._vfuncInjections.add([
                    activitiesButton.constructor.prototype,
                    'event',
                    function (event) {
                        if (event.type() === Clutter.EventType.TOUCH_END ||
                            event.type() === Clutter.EventType.BUTTON_RELEASE) {
                            if (Main.overview.shouldToggleByCornerOrButton())
                                appSpread._restoreDefaultOverview();
                        }
                        return Clutter.EVENT_PROPAGATE;
                    },
                ]);
            } else {
                /* Shell >= 50 uses gestures on the activities button */
                const click = new Clutter.ClickGesture();
                click.set_recognize_on_press(true);
                click.set_enabled(true);
                click.connect('recognize', () => {
                    if (Main.overview.shouldToggleByCornerOrButton())
                        appSpread._restoreDefaultOverview();
                });
                activitiesButton.add_action_with_name(APP_SPREAD_RESTORE_ACTION, click);
            }

            this._vfuncInjections.add([
                activitiesButton.constructor.prototype,
                'key_release_event',
                function (keyEvent) {
                    const keyval = keyEvent.get_key_symbol?.() ?? keyEvent.keyval;
                    if (keyval === Clutter.KEY_Return || keyval === Clutter.KEY_space) {
                        if (Main.overview.shouldToggleByCornerOrButton())
                            appSpread._restoreDefaultOverview();
                    }
                    return Clutter.EVENT_PROPAGATE;
                },
            ]);
        }

        this._signalHandlers.add(Main.overview.dash.showAppsButton, 'notify::checked', () => {
            if (Main.overview.dash.showAppsButton.checked)
                this._restoreDefaultOverview();
        });

        // If closing windows in AppSpread, and only one window left:
        // exit app spread and focus remaining window (handled in _hideAppSpread)
        this._signalHandlers.add(this.app, 'windows-changed', () => {
            this._updateWindows();

            if (this.windows.length <= 1)
                Main.overview.hide();
        });

        this._disableSearch();

        Main.overview.show();
    }

    _hideAppSpread() {
        if (!this.isInAppSpread)
            return;

        if (Main.overview.visible) {
            Main.panel.statusArea?.activities.add_style_pseudo_class('overview');
            Main.panel.statusArea?.activities.add_accessible_state(Atk.StateType.CHECKED);
        }

        // Restore original behaviour
        this.app = null;
        this._enableSearch();
        this._methodInjections.clear();
        this._signalHandlers.clear();
        this._vfuncInjections.clear();
        Main.panel.statusArea?.activities.remove_action_by_name(APP_SPREAD_RESTORE_ACTION);

        // Check reason for leaving AppSpread was closing app windows and only one window left...
        if (this.windows.length === 1)
            Main.activateWindow(this.windows[0]);

        this.windows = [];
    }

    _disableSearch() {
        if (Main.overview.searchEntry) {
            Main.overview.searchEntry.opacity = 0;
            Main.overview.searchEntry.reactive = false;
        }

        if (!SearchController.SearchController.prototype._shouldTriggerSearch)
            return;

        this._methodInjections.add(
            SearchController.SearchController.prototype,
            '_shouldTriggerSearch', () => false);
    }

    _enableSearch() {
        if (Main.overview.searchEntry) {
            Main.overview.searchEntry.opacity = 255;
            Main.overview.searchEntry.reactive = true;
        }
    }
}
