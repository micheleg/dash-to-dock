/* ========================================================================================================
 * myWorkspaceSwitchPopup.js - 
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:
 *     * This code was copied from the Workspace to dock extension
 *       https://github.com/passingthru67/workspaces-to-dock
 *     * This code was copied from the Frippery Bottom Panel extension
 *       http://frippery.org/extensions/ and modified to create a workspaces switcher popup.
 *       Copyright (C) 2011-2015 R M Yorston.
 *     * Part of this code also comes from gnome-shell-extensions:
 *       http://git.gnome.org/browse/gnome-shell-extensions/
 * ========================================================================================================
 */


const Clutter = imports.gi.Clutter;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const WindowManager = imports.ui.windowManager;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;
const Tweener = imports.ui.tweener;

let GSFunctions = {};

const DISPLAY_TIMEOUT = 600;
let myShowWorkspaceSwitcher, origShowWorkspaceSwitcher;
let nrows = 1;

function get_ncols() {
    let ncols = Math.floor(global.screen.n_workspaces/nrows);
    if ( global.screen.n_workspaces%nrows != 0 )
       ++ncols

    return ncols;
}

const myWorkspaceSwitcherPopup = new Lang.Class({
    Name: 'workspcestodockWorkspaceSwitcherPopup',
    Extends:  WorkspaceSwitcherPopup.WorkspaceSwitcherPopup,

    _getPreferredHeight : function (actor, forWidth, alloc) {
        let children = this._list.get_children();
        let workArea = Main.layoutManager.getWorkAreaForMonitor(
                        Main.layoutManager.primaryIndex);

        let availHeight = workArea.height;
        availHeight -= this.actor.get_theme_node().get_vertical_padding();
        availHeight -= this._container.get_theme_node().get_vertical_padding();
        availHeight -= this._list.get_theme_node().get_vertical_padding();

        let height = 0;
        for (let i = 0; i < children.length; i++) {
            let [childMinHeight, childNaturalHeight] =
                    children[i].get_preferred_height(-1);
            height = Math.max(height, childNaturalHeight);
        }

        height = nrows * height;

        let spacing = this._itemSpacing * (nrows - 1);
        height += spacing;
        height = Math.min(height, availHeight);

        this._childHeight = (height - spacing) / nrows;

        alloc.min_size = height;
        alloc.natural_size = height;
    },

    _getPreferredWidth : function (actor, forHeight, alloc) {
        let children = this._list.get_children();
        let workArea = Main.layoutManager.getWorkAreaForMonitor(
                        Main.layoutManager.primaryIndex);

        let availWidth = workArea.width;
        availWidth -= this.actor.get_theme_node().get_horizontal_padding();
        availWidth -= this._container.get_theme_node().get_horizontal_padding();
        availWidth -= this._list.get_theme_node().get_horizontal_padding();

        let ncols = get_ncols();
        let height = 0;
        for (let i = 0; i < children.length; i++) {
            let [childMinHeight, childNaturalHeight] =
                    children[i].get_preferred_height(-1);
            height = Math.max(height, childNaturalHeight);
        }

        let width = ncols * height * workArea.width/workArea.height;

        let spacing = this._itemSpacing * (ncols - 1);
        width += spacing;
        width = Math.min(width, availWidth);

        this._childWidth = (width - spacing) / ncols;

        alloc.min_size = width;
        alloc.natural_size = width;
    },

    _allocate : function (actor, box, flags) {
        let children = this._list.get_children();
        let childBox = new Clutter.ActorBox();

        let ncols = get_ncols();

        for ( let ir=0; ir<nrows; ++ir ) {
            for ( let ic=0; ic<ncols; ++ic ) {
                let i = ncols*ir + ic;
                let x = box.x1 + ic * (this._childWidth + this._itemSpacing);
                childBox.x1 = x;
                childBox.x2 = x + this._childWidth;
                let y = box.y1 + ir * (this._childHeight + this._itemSpacing);
                childBox.y1 = y;
                childBox.y2 = y + this._childHeight;
                children[i].allocate(childBox, flags);
            }
        }
    },

    _redisplay : function() {
        this._list.destroy_all_children();

        for (let i = 0; i < global.screen.n_workspaces; i++) {
            let indicator = null;

           if (i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.LEFT)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-up' });
           else if (i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.RIGHT)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-down' });
           else if (i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.UP)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-up' });
           else if(i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.DOWN)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-down' });
           else
               indicator = new St.Bin({ style_class: 'ws-switcher-box' });

           this._list.add_actor(indicator);

        }

        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let [containerMinHeight, containerNatHeight] = this._container.get_preferred_height(global.screen_width);
        let [containerMinWidth, containerNatWidth] = this._container.get_preferred_width(containerNatHeight);
        this._container.x = workArea.x + Math.floor((workArea.width - containerNatWidth) / 2);
        this._container.y = workArea.y + Math.floor((workArea.height - containerNatHeight) / 2);
    },

    display : function(direction, activeWorkspaceIndex) {
        this._direction = direction;
        this._activeWorkspaceIndex = activeWorkspaceIndex;

        this._redisplay();
        if (this._timeoutId != 0)
            Mainloop.source_remove(this._timeoutId);
        this._timeoutId = Mainloop.timeout_add(DISPLAY_TIMEOUT, Lang.bind(this, this._onTimeout));
        this._show();
    }
});

const WorkspaceSwitcher = new Lang.Class({
    Name: 'workspcestodockWorkspaceSwitcher',

    _init: function(params) {
        // Override Gnome Shell functions
        this._overrideGnomeShellFunctions();
        this._resetBindings();

        global.screen.override_workspace_layout(Meta.ScreenCorner.TOPLEFT, false, nrows, -1);
    },

    destroy: function() {
        // Restor Gnome Shell functions
        this._restoreGnomeShellFunctions();
        this._resetBindings();

        global.screen.override_workspace_layout(Meta.ScreenCorner.TOPLEFT, false, -1, 1);
    },

    _overrideGnomeShellFunctions: function() {
        // Override showWorkspacesSwitcher to show custom horizontal workspace switcher popup
        GSFunctions['WindowManager_showWorkspaceSwitcher'] = WindowManager.WindowManager.prototype._showWorkspaceSwitcher;
        WindowManager.WindowManager.prototype._showWorkspaceSwitcher = function(display, screen, window, binding) {
            if (!Main.sessionMode.hasWorkspaces)
                return;

            if (screen.n_workspaces == 1)
                return;

            let [action,,,target] = binding.get_name().split('-');
            let newWs;
            let direction;

            if (action == 'move') {
                // "Moving" a window to another workspace doesn't make sense when
                // it cannot be unstuck, and is potentially confusing if a new
                // workspaces is added at the start/end
                if (window.is_always_on_all_workspaces() ||
                    (Meta.prefs_get_workspaces_only_on_primary() &&
                     window.get_monitor() != Main.layoutManager.primaryIndex))
                  return;
            }

            if (target == 'last') {
                direction = Meta.MotionDirection.RIGHT;
                newWs = screen.get_workspace_by_index(screen.n_workspaces - 1);
            } else if (isNaN(target)) {
                // Prepend a new workspace dynamically
                if (screen.get_active_workspace_index() == 0 &&
                    action == 'move' && target == 'left' && this._isWorkspacePrepended == false) {
                    this.insertWorkspace(0);
                    this._isWorkspacePrepended = true;
                }

                direction = Meta.MotionDirection[target.toUpperCase()];
                newWs = screen.get_active_workspace().get_neighbor(direction);
            } else if (target > 0) {
                target--;
                newWs = screen.get_workspace_by_index(target);

                if (screen.get_active_workspace().index() > target)
                    direction = Meta.MotionDirection.LEFT;
                else
                    direction = Meta.MotionDirection.RIGHT;
            }

            if (direction != Meta.MotionDirection.LEFT &&
                direction != Meta.MotionDirection.RIGHT)
                return;

            if (action == 'switch')
                this.actionMoveWorkspace(newWs);
            else
                this.actionMoveWindow(window, newWs);

            if (!Main.overview.visible) {
                if (this._workspaceSwitcherPopup == null) {
                    this._workspaceSwitcherPopup = new myWorkspaceSwitcherPopup();
                    this._workspaceSwitcherPopup.connect('destroy',
                        Lang.bind(this, function() {
                            this._workspaceSwitcherPopup = null;
                        }));
                }
                this._workspaceSwitcherPopup.display(direction, newWs.index());
            }
        };

        // Override updateWorkspaceActors for horizontal animation of overview windows
        GSFunctions['WorkspacesView_updateWorkspaceActors'] = WorkspacesView.WorkspacesView.prototype._updateWorkspaceActors;
        WorkspacesView.WorkspacesView.prototype._updateWorkspaceActors = function(showAnimation) {
            let active = global.screen.get_active_workspace_index();

            this._animating = showAnimation;

            for (let w = 0; w < this._workspaces.length; w++) {
                let workspace = this._workspaces[w];

                Tweener.removeTweens(workspace.actor);

                let x = (w - active) * this._fullGeometry.width;

                if (showAnimation) {
                    let params = { x: x,
                                   time: WorkspacesView.WORKSPACE_SWITCH_TIME,
                                   transition: 'easeOutQuad'
                                 };
                    // we have to call _updateVisibility() once before the
                    // animation and once afterwards - it does not really
                    // matter which tween we use, so we pick the first one ...
                    if (w == 0) {
                        this._updateVisibility();
                        params.onComplete = Lang.bind(this,
                            function() {
                                this._animating = false;
                                this._updateVisibility();
                            });
                    }
                    Tweener.addTween(workspace.actor, params);
                } else {
                    workspace.actor.set_position(x, 0);
                    if (w == 0)
                        this._updateVisibility();
                }
            }
        };

        // Override overview scroll event for horizontal scrolling of workspaces
        GSFunctions['WorkspacesDisplay_onScrollEvent'] = WorkspacesView.WorkspacesDisplay.prototype._onScrollEvent;
        WorkspacesView.WorkspacesDisplay.prototype._onScrollEvent = function(actor, event) {
            if (!this.actor.mapped)
                return Clutter.EVENT_PROPAGATE;
            let activeWs = global.screen.get_active_workspace();
            let ws;
            switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                ws = activeWs.get_neighbor(Meta.MotionDirection.LEFT);
                break;
            case Clutter.ScrollDirection.DOWN:
                ws = activeWs.get_neighbor(Meta.MotionDirection.RIGHT);
                break;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
            Main.wm.actionMoveWorkspace(ws);
            return Clutter.EVENT_STOP;
        };

    },

    _restoreGnomeShellFunctions: function() {
        // Restore showWorkspacesSwitcher to show normal workspace switcher popup
        WindowManager.WindowManager.prototype._showWorkspaceSwitcher = GSFunctions['WindowManager_showWorkspaceSwitcher'];

        // Restore updateWorkspaceActors to original vertical animation of overview windows
        WorkspacesView.WorkspacesView.prototype._updateWorkspaceActors = GSFunctions['WorkspacesView_updateWorkspaceActors'];

        // Restore onScrollEvent to original vertical scrolling of workspaces
        WorkspacesView.WorkspacesDisplay.prototype._onScrollEvent = GSFunctions['WorkspacesDisplay_onScrollEvent']
    },

    _resetBindings: function() {
        // Reset bindings to active showWorkspaceSwitcher function
        let wm = Main.wm;
        Meta.keybindings_set_custom_handler('switch-to-workspace-left',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-right',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-up',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-down',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-1',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-2',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-3',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-4',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-5',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-6',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-7',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-8',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-9',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-10',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-11',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-12',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-last',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));

        Meta.keybindings_set_custom_handler('move-to-workspace-left',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-right',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-up',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-down',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-1',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-2',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-3',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-4',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-5',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-6',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-7',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-8',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-9',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-10',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-11',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-12',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('move-to-workspace-last',
                    Lang.bind(wm, wm._showWorkspaceSwitcher));

        wm._workspaceSwitcherPopup = null;
    }
});
