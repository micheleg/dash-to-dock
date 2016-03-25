// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Signals = imports.signals;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Dash = imports.ui.dash;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;
const Workspace = imports.ui.workspace;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Windows = Me.imports.windows;

/**
 * Extend AppIcon
 *
 * - Pass settings to the constructor and bind settings changes
 * - Apply a css class based on the number of windows of each application (#N);
 * - Draw a dot for each window of the application based on the default "dot" style which is hidden (#N);
 *   a class of the form "running#N" is applied to the AppWellIcon actor.
 *   like the original .running one.
 * - add a .focused style to the focused app
 * - Customize click actions.
 * - Update minimization animation target
 *
 */

let tracker = Shell.WindowTracker.get_default();

const clickAction = {
    SKIP: 0,
    MINIMIZE: 1,
    LAUNCH: 2,
    CYCLE_WINDOWS: 3
};

let recentlyClickedAppLoopId = 0;
let recentlyClickedApp = null;
let recentlyClickedAppWindows = null;
let recentlyClickedAppIndex = 0;

const MyAppIcon = new Lang.Class({
    Name: 'DashToDock.AppIcon',
    Extends: AppDisplay.AppIcon,

    // settings are required inside.
    _init: function(settings, app, iconParams, onActivateOverride) {

        this._dtdSettings = settings;
        this._nWindows = 0;

        this.parent(app, iconParams, onActivateOverride);

        // Monitor windows-changes instead of app state.
        // Keep using the same Id and function callback (that is extended)
        if(this._stateChangedId>0) {
            this.app.disconnect(this._stateChangedId);
            this._stateChangedId=0;
        }

        this._stateChangedId = this.app.connect('windows-changed',
                                                Lang.bind(this,
                                                          this.onWindowsChanged));
        this._focuseAppChangeId = tracker.connect('notify::focus-app',
                                                Lang.bind(this,
                                                          this._onFocusAppChanged));

        this._dots = null;

        let keys = ['apply-custom-theme',
                    'custom-theme-running-dots',
                   'custom-theme-customize-running-dots',
                   'custom-theme-running-dots-color',
                   'custom-theme-running-dots-border-color',
                   'custom-theme-running-dots-border-width'];

        keys.forEach(function(key) {
          this._dtdSettings.connect('changed::'+key,
                                 Lang.bind(this, this._toggleDots)
          );
        }, this );

        this._toggleDots();
    },

    _onDestroy: function() {
        this.parent();

        // Disconect global signals
        // stateChangedId is already handled by parent)
        if(this._focusAppId>0)
            tracker.disconnect(this._focusAppId);
    },

    onWindowsChanged: function() {
      this._updateRunningStyle();
      this.updateIconGeometry();

    },

    // Update taraget for minimization animation
    updateIconGeometry: function() {

        // If (for unknown reason) the actor is not on the stage the reported size
        // and position are random values, which might exceeds the integer range
        // resulting in an error when assigned to the a rect. This is a more like
        // a workaround to prevent flooding the system with errors.
        if (this.actor.get_stage() == null)
            return

        let rect = new Meta.Rectangle();

		if (Windows.isStolen(this.app)) {
			if (this.actor.child) {
				this.actor.child.destroy();
				this.actor.child = null;
			}
		}

		[rect.x, rect.y] = this.actor.get_transformed_position();
		[rect.width, rect.height] = this.actor.get_transformed_size();

        let windows = Windows.getAllWindows(this.app);
        windows.forEach(function(w) {
            w.set_icon_geometry(rect);
        });

    },

    _toggleDots: function() {

        if ( this._dtdSettings.get_boolean('custom-theme-running-dots')
             || this._dtdSettings.get_boolean('apply-custom-theme') )
            this._showDots();
        else
            this._hideDots();
    },

    _showDots: function() {
        // I use opacity to hide the default dot because the show/hide function
        // are used by the parent class.
        this._dot.opacity = 0;

        // Just update style if dots already exist
        if (this._dots) {
            this._updateCounterClass();
            return;
        }

        this._dots = new St.DrawingArea({x_expand: true, y_expand: true});
        this._dots.connect('repaint', Lang.bind(this,
            function() {
                    this._drawCircles(this._dots, Convenience.getPosition(this._dtdSettings));
            }));
        this._iconContainer.add_child(this._dots);
        this._updateCounterClass();

    },

    _hideDots: function() {
        this._dot.opacity=255;
        if (this._dots)
            this._dots.destroy()
        this._dots = null;
    },

    _updateRunningStyle: function() {
        this.parent();
        this._updateCounterClass();
    },

    popupMenu: function() {
        this._removeMenuTimeout();
        this.actor.fake_release();
        this._draggable.fakeRelease();

        if (!this._menu) {
            this._menu = new MyAppIconMenu(this, this._dtdSettings);
            this._menu.connect('activate-window', Lang.bind(this, function (menu, window) {
                this.activateWindow(window);
            }));
            this._menu.connect('open-state-changed', Lang.bind(this, function (menu, isPoppedUp) {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            }));
            let id = Main.overview.connect('hiding', Lang.bind(this, function () { this._menu.close(); }));
            this._menu.actor.connect('destroy', function() {
                Main.overview.disconnect(id);
            });

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this.actor.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },

    _onFocusAppChanged: function() {
        if(tracker.focus_app == this.app)
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    activate: function(button) {

        if ( !this._dtdSettings.get_boolean('customize-click') ) {
            this.parent(button);
            return;
        }
        
        let isRunning = Windows.isWindowStealer(this.app) ?
			Windows.getAllWindows(this.app).length > 0 :
			this.app.state == Shell.AppState.RUNNING;

        let event = Clutter.get_current_event();
        let modifiers = event ? event.get_state() : 0;
        let openNewWindow = modifiers & Clutter.ModifierType.CONTROL_MASK &&
                            isRunning ||
                            button && button == 2;

		let focusedApp = tracker.focus_app;
        let isFocused = Windows.isWindowStealer(this.app) ?
			Windows.isStealingFrom(this.app, focusedApp) :
			this.app == focusedApp;

        if (!isRunning || openNewWindow)
            this.animateLaunch();

        if(button && button == 1 && isRunning) {

            if(modifiers & Clutter.ModifierType.CONTROL_MASK) {
                // Keep default behaviour: launch new window
                // By calling the parent method I make it compatible
                // with other extensions tweaking ctrl + click
                this.parent(button);
                return;

            } else if (this._dtdSettings.get_boolean('minimize-shift') && modifiers & Clutter.ModifierType.SHIFT_MASK) {
                // On double click, minimize all windows in the current workspace
                minimizeWindow(this.app, event.get_click_count() > 1);

            } else if(isFocused && !Main.overview._shown) {

                if(this._dtdSettings.get_enum('click-action') == clickAction.CYCLE_WINDOWS)
                    cycleThroughWindows(this.app);
                else if(this._dtdSettings.get_enum('click-action') == clickAction.MINIMIZE)
                    minimizeWindow(this.app, true);
                else if(this._dtdSettings.get_enum('click-action') == clickAction.LAUNCH)
                    this.app.open_new_window(-1);

            } else {
                // Activate all window of the app or only le last used
                if (this._dtdSettings.get_enum('click-action') == clickAction.CYCLE_WINDOWS && !Main.overview._shown) {
                    // If click cycles through windows I can activate one windows at a time
                    let windows = Windows.getInterestingWindows(this.app);
                    let w = windows[0];
                    Main.activateWindow(w);
                } else if(this._dtdSettings.get_enum('click-action') == clickAction.LAUNCH)
                    this.app.open_new_window(-1);
                else if(this._dtdSettings.get_enum('click-action') == clickAction.MINIMIZE) {
                    // If click minimizes all, then one expects all windows to be reshown
                    activateAllWindows(this.app);
                } else
                    this.app.activate();
            }
        } else {
         // Default behaviour
         if (openNewWindow)
            this.app.open_new_window(-1);
         else
            this.app.activate();
        }

        Main.overview.hide();
    },

    _updateCounterClass: function() {

        let maxN = 4;
        this._nWindows = Math.min(Windows.getInterestingWindows(this.app).length, maxN);

        for(let i = 1; i<=maxN; i++) {
            let className = 'running'+i;
            if(i!=this._nWindows)
                this.actor.remove_style_class_name(className);
            else
                this.actor.add_style_class_name(className);
        }

        if (this._dots)
            this._dots.queue_repaint();
    },

    _drawCircles: function(area, side) {

        let borderColor, borderWidth, bodyColor;

        if (!this._dtdSettings.get_boolean('apply-custom-theme')
            && this._dtdSettings.get_boolean('custom-theme-running-dots')
            && this._dtdSettings.get_boolean('custom-theme-customize-running-dots')) {
            borderColor = Clutter.color_from_string(this._dtdSettings.get_string('custom-theme-running-dots-border-color'))[1];
            borderWidth = this._dtdSettings.get_int('custom-theme-running-dots-border-width');
            bodyColor =  Clutter.color_from_string(this._dtdSettings.get_string('custom-theme-running-dots-color'))[1];
        } else {
            // Re-use the style - background color, and border width and color -
            // of the default dot
            let themeNode = this._dot.get_theme_node();
            borderColor = themeNode.get_border_color(side);
            borderWidth = themeNode.get_border_width(side);
            bodyColor = themeNode.get_background_color();
        }

        let [width, height] = area.get_surface_size();
        let cr = area.get_context();

        // Draw the required numbers of dots
        let radius = width/22 - borderWidth/2;
        radius = Math.max(radius, borderWidth/4+1);
        let padding = 0; // distance from the margin
        let spacing = radius + borderWidth; // separation between the dots
        let n = this._nWindows;

        cr.setLineWidth(borderWidth);
        Clutter.cairo_set_source_color(cr, borderColor);

        switch (side) {
        case St.Side.TOP:
            cr.translate((width - (2*n)*radius - (n-1)*spacing)/2, padding);
            for (let i=0; i<n;i++) {
                cr.newSubPath();
                cr.arc((2*i+1)*radius + i*spacing, radius + borderWidth/2, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.BOTTOM:
            cr.translate((width - (2*n)*radius - (n-1)*spacing)/2, height- padding- 2*radius);
            for (let i=0; i<n;i++) {
                cr.newSubPath();
                cr.arc((2*i+1)*radius + i*spacing, radius + borderWidth/2, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.LEFT:
            cr.translate(padding, (height - (2*n)*radius - (n-1)*spacing)/2);
            for (let i=0; i<n;i++) {
                cr.newSubPath();
                cr.arc(radius + borderWidth/2, (2*i+1)*radius + i*spacing, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.RIGHT:
            cr.translate(width - padding- 2*radius, (height - (2*n)*radius - (n-1)*spacing)/2);
            for (let i=0; i<n;i++) {
                cr.newSubPath();
                cr.arc(radius + borderWidth/2, (2*i+1)*radius + i*spacing, radius, 0, 2*Math.PI);
            }
            break;
        }

        cr.strokePreserve();

        Clutter.cairo_set_source_color(cr, bodyColor);
        cr.fill();
        cr.$dispose();
    }

});

function minimizeWindow(app, param) {
    // Param true make all app windows minimize
    let windows = Windows.getInterestingWindows(app);
    let current_workspace = global.screen.get_active_workspace();
    for (let i = 0; i < windows.length; i++) {
        let w = windows[i];
        if (w.get_workspace() == current_workspace && w.showing_on_its_workspace()) {
            w.minimize();
            // Just minimize one window. By specification it should be the
            // focused window on the current workspace.
            if(!param)
                break;
        }
    }
}

/*
 * By default only non minimized windows are activated.
 * This activates all windows in the current workspace.
 */
function activateAllWindows(app) {

    // First activate first window so workspace is switched if needed.
    if (!Windows.isWindowStealer(app))
		app.activate();

    // then activate all other app windows in the current workspace
    let windows = Windows.getInterestingWindows(app);
    let activeWorkspace = global.screen.get_active_workspace_index();

    if( windows.length<=0)
        return;

    let activatedWindows = 0;

    for (let i=windows.length-1; i>=0; i--) {
        if(windows[i].get_workspace().index() == activeWorkspace) {
            Main.activateWindow(windows[i]);
            activatedWindows++;
        }
    }
}

function cycleThroughWindows(app) {

    // Store for a little amount of time last clicked app and its windows
    // since the order changes upon window interaction
    let MEMORY_TIME=3000;

    let app_windows = Windows.getInterestingWindows(app);

    if(recentlyClickedAppLoopId>0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId = Mainloop.timeout_add(MEMORY_TIME, resetRecentlyClickedApp);

    // If there isn't already a list of windows for the current app,
    // or the stored list is outdated, use the current windows list.
    if( !recentlyClickedApp ||
        recentlyClickedApp.get_id() != app.get_id() ||
        recentlyClickedAppWindows.length != app_windows.length
      ) {

        recentlyClickedApp = app;
        recentlyClickedAppWindows = app_windows;
        recentlyClickedAppIndex = 0;
    }

    recentlyClickedAppIndex++;
    let index = recentlyClickedAppIndex % recentlyClickedAppWindows.length;
    let window = recentlyClickedAppWindows[index];

    Main.activateWindow(window);
}

function resetRecentlyClickedApp() {

    if(recentlyClickedAppLoopId>0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId=0;
    recentlyClickedApp =null;
    recentlyClickedAppWindows = null;
    recentlyClickedAppIndex = 0;

    return false;
}

/**
 * Extend AppIconMenu
 *
 * - Pass settings to the constructor
 * - set popup arrow side based on dash orientation
 * - Add close windows option based on quitfromdash extension
 *   (https://github.com/deuill/shell-extension-quitfromdash)
 */

const MyAppIconMenu = new Lang.Class({
    Name: 'DashToDock.MyAppIconMenu',
    Extends: AppDisplay.AppIconMenu,

    _init: function(source, settings) {

        let side = Convenience.getPosition(settings);

        // Damm it, there has to be a proper way of doing this...
        // As I can't call the parent parent constructor (?) passing the side
        // parameter, I overwite what I need later
        this.parent(source);

        // Change the initialized side where required.
        this._arrowSide = side;
        this._boxPointer._arrowSide = side;
        this._boxPointer._userArrowSide = side;
        
        this._settings = settings;
    },

    // helper function for the quit windows abilities
    _closeWindowInstance: function(metaWindow) {
        metaWindow.delete(global.get_current_time());
    },

    _redisplay: function() {

        this.parent();

		// steal windows menu
		this._appendSeparator();
		this._stealWindowsMenuItem = this._appendMenuItem(_('Steal Windows'));
		this._stealWindowsMenuItem.connect('activate', Lang.bind(this, function() {
			
			//let r = Util.spawn(['gnome-shell-extension-prefs', 'dash-to-dock@micxgx.gmail.com']);
			//global.log('>>>>>>>>>>>> ' + r);
			
		}));

        // quit menu
        let app = this._source.app;
        let count = Windows.getInterestingWindows(app).length;
        if ( count > 0) {
            this._appendSeparator();
            let quitFromDashMenuText = "";
            if (count == 1)
                quitFromDashMenuText = _("Quit");
            else
                quitFromDashMenuText = _("Quit") + ' ' + count + ' ' + _("Windows");

            this._quitfromDashMenuItem = this._appendMenuItem(quitFromDashMenuText);
            this._quitfromDashMenuItem.connect('activate', Lang.bind(this, function() {
                let app = this._source.app;
                let windows = Windows.getAllWindows(app);
                for (let i = 0; i < windows.length; i++) {
                    this._closeWindowInstance(windows[i])
                }
            }));
        }
    }
});
