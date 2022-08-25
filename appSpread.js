/* exported AppSpread */

const Main = imports.ui.main;
const SearchController = imports.ui.searchController;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

var AppSpread = class AppSpread {
    constructor() {
        this.isInAppSpread = false;
        this.supported = true;

        // gnome shell functions to temporarily replace while in app spread
        this.originalWorkspaceIsOverviewWindow = Workspace?.Workspace?.prototype._isOverviewWindow;
        this.originalThumbnailIsOverviewWindow = WorkspaceThumbnail?.WorkspaceThumbnail?.prototype._isOverviewWindow;
        this.originalShouldTriggerSearch = SearchController?.SearchController?.prototype._shouldTriggerSearch;
        // fail early and do nothing, if mandatory gnome shell functions are missing
        if (!this.originalWorkspaceIsOverviewWindow || !this.originalThumbnailIsOverviewWindow) {
            log('Dash to dock: Unable to temporarily replace shell functions for app spread - using previews instead');
            this.supported = false;
            return;
        }

        // we need to hook into overview 'hidden' like this, in case appspread overview is hidden by choosing another app
        // it should then do its cleanup too
        this._hideOverviewHandlerId = Main.overview.connect('hidden', this._hideAppSpread.bind(this));
    }

    disconnect() {
        if (this._hideOverviewHandlerId) {
            Main.overview.disconnect(this._hideOverviewHandlerId);
        }
    }

    toggle(appSpreadMetaWindows) {
        if (Main.overview._shown) {
            Main.overview.hide(); // also triggers hook 'hidden'
        } else {
            this._showAppSpread(appSpreadMetaWindows);
        }
    }

    _showAppSpread(appSpreadMetaWindows) {
        // Checked in overview "hide" event handler _hideAppSpread
        this.isInAppSpread = true;
        this.appSpreadMetaWindows = appSpreadMetaWindows;

        // Filter workspaces to only show current app windows
        const originalWorkspaceIsOverviewWindow = this.originalWorkspaceIsOverviewWindow;
        Workspace.Workspace.prototype._isOverviewWindow = function(metaWindow) {
            const originalResult = originalWorkspaceIsOverviewWindow(metaWindow);
            return originalResult && appSpreadMetaWindows.indexOf(metaWindow) > -1;
        };

        // Filter thumbnails to only show current app windows
        const originalThumbnailIsOverviewWindow = this.originalThumbnailIsOverviewWindow;
        WorkspaceThumbnail.WorkspaceThumbnail.prototype._isOverviewWindow = function(metaWindowActor) {
            const originalResult = originalThumbnailIsOverviewWindow(metaWindowActor);
            return originalResult && appSpreadMetaWindows.indexOf(metaWindowActor.meta_window) > -1;
        };

        // If closing windows in AppSpread, and only one window left: exit app spread and focus remaining window (handled in _hideAppSpread)
        this.destroyWindowId = global.window_manager.connect('destroy', (_, windowActor) => {
            const metaWindow = windowActor.get_meta_window();
            const index = appSpreadMetaWindows.indexOf(metaWindow);
            if (index > -1) {
                appSpreadMetaWindows.splice(index, 1);
            }
            if (appSpreadMetaWindows.length === 1) {
                Main.overview.hide();
            }
        });

        Main.overview.show();
        // this._disableSearch();
    }

    _hideAppSpread() {
        if (!this.isInAppSpread)
            return;

        this.isInAppSpread = false;
        // Restore original behaviour
        // this._enableSearch();
        Workspace.Workspace.prototype._isOverviewWindow = this.originalWorkspaceIsOverviewWindow;
        WorkspaceThumbnail.WorkspaceThumbnail.prototype._isOverviewWindow = this.originalThumbnailIsOverviewWindow;
        global.window_manager.disconnect(this.destroyWindowId);
        // Check reason for leaving AppSpread was closing app windows and only one window left..
        if (this.appSpreadMetaWindows.length === 1)
            Main.activateWindow(this.appSpreadMetaWindows[0]);
    }

    _disableSearch() {
        if (Main.overview.searchEntry)
            Main.overview.searchEntry.opacity = 0;

        if (this.originalShouldTriggerSearch) {
            SearchController.SearchController.prototype._shouldTriggerSearch = function() {
                return false;
            };
        }
    }

    _enableSearch() {
        if (Main.overview.searchEntry)
            Main.overview.searchEntry.opacity = 255;

        if (this.originalShouldTriggerSearch) {
            SearchController.SearchController.prototype._shouldTriggerSearch = this.originalShouldTriggerSearch;
        }
    }
};
