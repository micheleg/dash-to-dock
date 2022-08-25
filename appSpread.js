/* exported AppSpread */

const Main = imports.ui.main;
const SearchController = imports.ui.searchController;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

var AppSpread = class AppSpread {
    constructor() {
        this.app = null;
        this.supported = true;
        this.windows = [];

        // fail early and do nothing, if mandatory gnome shell functions are missing
        if (!Workspace?.Workspace?.prototype._isOverviewWindow ||
            !WorkspaceThumbnail?.WorkspaceThumbnail?.prototype._isOverviewWindow) {
            log('Dash to dock: Unable to temporarily replace shell functions for app spread - using previews instead');
            this.supported = false;
            return;
        }

        this._signalHandlers = new Utils.GlobalSignalsHandler();
        this._methodInjections = new Utils.InjectionsHandler();
    }

    get isInAppSpread() {
        return !!this.app;
    }

    destroy() {
        this._hideAppSpread();
        this._signalHandlers.destroy();
        this._methodInjections.destroy();
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
                const isOverviewWindow = originalMethod.call(this, window);
                return isOverviewWindow && appSpread.windows.includes(window);
            }
        ],
        [
            // Filter thumbnails to only show current app windows
            WorkspaceThumbnail.WorkspaceThumbnail.prototype, '_isOverviewWindow',
            function (originalMethod, windowActor) {
                const isOverviewWindow = originalMethod.call(this, windowActor);
                return isOverviewWindow && appSpread.windows.includes(windowActor.metaWindow);
            }
        ]);

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

        // Restore original behaviour
        this.app = null;
        this._enableSearch();
        this._methodInjections.clear();
        this._signalHandlers.clear();

        // Check reason for leaving AppSpread was closing app windows and only one window left...
        if (this.windows.length === 1)
            Main.activateWindow(this.windows[0]);

        this.windows = [];
    }

    _disableSearch() {
        if (!SearchController.SearchController.prototype._shouldTriggerSearch)
            return;

        if (Main.overview.searchEntry)
            Main.overview.searchEntry.opacity = 0;

        this._methodInjections.add(
            SearchController.SearchController.prototype,
            '_shouldTriggerSearch', () => false);
    }

    _enableSearch() {
        if (Main.overview.searchEntry)
            Main.overview.searchEntry.opacity = 255;
    }
};
