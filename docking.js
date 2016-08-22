// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const IconGrid = imports.ui.iconGrid;
const Overview = imports.ui.overview;
const OverviewControls = imports.ui.overviewControls;
const PointerWatcher = imports.ui.pointerWatcher;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;
const ViewSelector = imports.ui.viewSelector;
const WorkspaceSwitcherPopup= imports.ui.workspaceSwitcherPopup;
const Layout = imports.ui.layout;
const LayoutManager = imports.ui.main.layoutManager;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const Theming = Me.imports.theming;
const MyDash = Me.imports.dash;

const DOCK_DWELL_CHECK_INTERVAL = 100;

const State = {
    HIDDEN:  0,
    SHOWING: 1,
    SHOWN:   2,
    HIDING:  3
};

/**
 * A simple St.Widget with one child whose allocation takes into account the
 * slide out of its child via the _slidex parameter ([0:1]).
 *
 * Required since I want to track the input region of this container which is
 * based on its allocation even if the child overlows the parent actor. By doing
 * this the region of the dash that is slideout is not steling anymore the input
 * regions making the extesion usable when the primary monitor is the right one.
 *
 * The slidex parameter can be used to directly animate the sliding. The parent
 * must have a WEST (SOUTH) anchor_point to achieve the sliding to the RIGHT (BOTTOM)
 * side.
 *
 * It can't be an extended object because of this: https://bugzilla.gnome.org/show_bug.cgi?id=688973.
 * thus use the Shell.GenericContainer pattern.
*/
const DashSlideContainer = new Lang.Class({
    Name: 'DashToDock.DashSlideContainer',

    _init: function(params) {
        // Default local params
        let localDefaults = {
            side: St.Side.LEFT,
            initialSlideValue: 1
        }

        let localParams = Params.parse(params, localDefaults, true);

        if (params) {
            // Remove local params before passing the params to the parent
            // constructor to avoid errors.
            let prop;
            for (prop in localDefaults) {
                if ((prop in params))
                    delete params[prop];
            }
        }

        this.actor = new Shell.GenericContainer(params);
        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));

        this.actor._delegate = this;

        this._child = null;

        // slide parameter: 1 = visible, 0 = hidden.
        this._slidex = localParams.initialSlideValue;
        this._side = localParams.side;
        this._slideoutSize = 0; // minimum size when slided out
    },

    _allocate: function(actor, box, flags) {
        if (this._child == null)
            return;

        let availWidth = box.x2 - box.x1;
        let availHeight = box.y2 - box.y1;
        let [minChildWidth, minChildHeight, natChildWidth, natChildHeight] =
            this._child.get_preferred_size();

        let childWidth = natChildWidth;
        let childHeight = natChildHeight;

        let childBox = new Clutter.ActorBox();

        let slideoutSize = this._slideoutSize;

        if (this._side == St.Side.LEFT) {
            childBox.x1 = (this._slidex -1) * (childWidth - slideoutSize);
            childBox.x2 = slideoutSize + this._slidex*(childWidth - slideoutSize);
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        }
        else if ((this._side == St.Side.RIGHT) || (this._side == St.Side.BOTTOM)) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        }
        else if (this._side == St.Side.TOP) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = (this._slidex -1) * (childHeight - slideoutSize);
            childBox.y2 = slideoutSize + this._slidex * (childHeight - slideoutSize);
        }

        this._child.allocate(childBox, flags);
        this._child.set_clip(-childBox.x1, -childBox.y1,
                             -childBox.x1+availWidth, -childBox.y1 + availHeight);
    },

    /**
     * Just the child width but taking into account the slided out part
     */
    _getPreferredWidth: function(actor, forHeight, alloc) {
        let [minWidth, natWidth] = this._child.get_preferred_width(forHeight);
        if ((this._side ==  St.Side.LEFT) || (this._side == St.Side.RIGHT)) {
            minWidth = (minWidth - this._slideoutSize) * this._slidex + this._slideoutSize;
            natWidth = (natWidth - this._slideoutSize) * this._slidex + this._slideoutSize;
        }

        alloc.min_size = minWidth;
        alloc.natural_size = natWidth;
    },

    /**
     * Just the child height but taking into account the slided out part
     */
    _getPreferredHeight: function(actor, forWidth,  alloc) {
        let [minHeight, natHeight] = this._child.get_preferred_height(forWidth);
        if ((this._side ==  St.Side.TOP) || (this._side ==  St.Side.BOTTOM)) {
            minHeight = (minHeight - this._slideoutSize) * this._slidex + this._slideoutSize;
            natHeight = (natHeight - this._slideoutSize) * this._slidex + this._slideoutSize;
        }
        alloc.min_size = minHeight;
        alloc.natural_size = natHeight;
    },

    /**
     * I was expecting it to be a virtual function... stil I don't understand
     * how things work.
     */
    add_child: function(actor) {
        // I'm supposed to have only on child
        if (this._child !== null)
            this.actor.remove_child(actor);

        this._child = actor;
        this.actor.add_child(actor);
    },

    set slidex(value) {
        this._slidex = value;
        this._child.queue_relayout();
    },

    get slidex() {
        return this._slidex;
    }
});

const DockedDash = new Lang.Class({
    Name: 'DashToDock.DockedDash',

    _init: function(settings) {
        this._rtl = (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL);

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._position = Convenience.getPosition(settings);
        this._isHorizontal = ((this._position == St.Side.TOP) || (this._position == St.Side.BOTTOM));

        // Temporary ignore hover events linked to autohide for whatever reason
        this._ignoreHover = false;
        this._oldignoreHover = null;
        // This variables are linked to the settings regardles of autohide or intellihide
        // being temporary disable. Get set by _updateVisibilityMode;
        this._autohideIsEnabled = null;
        this._intellihideIsEnabled = null;
        this._fixedIsEnabled = null;

        // Create intellihide object to monitor windows overlapping
        this._intellihide = new Intellihide.Intellihide(this._settings);

        // initialize dock state
        this._dockState = State.HIDDEN;

        /* status variable: true when the overview is shown through the dash
         * applications button.
         */
        this.forcedOverview = false;

        // Put dock on the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // this store size and the position where the dash is shown;
        // used by intellihide module to check window overlap.
        this.staticBox = new Clutter.ActorBox();

        // Initialize pressure barrier variables
        this._canUsePressure = false;
        this._pressureBarrier = null;
        this._barrier = null;
        this._removeBarrierTimeoutId = 0;

        // Initialize dwelling system variables
        this._dockDwelling = false;
        this._dockWatch = null;
        this._dockDwellUserTime = 0;
        this._dockDwellTimeoutId = 0

        // Create a new dash object
        this.dash = new MyDash.MyDash(this._settings);

        // set stored icon size  to the new dash
        Main.overview.dashIconSize = this.dash.iconSize;

        // connect app icon into the view selector
        this.dash.showAppsButton.connect('notify::checked', Lang.bind(this, this._onShowAppsButtonToggled));

        if (!this._settings.get_boolean('show-show-apps-button'))
            this.dash.hideShowAppsButton();

        // Create the main actor and the containers for sliding in and out and
        // centering, turn on track hover

        let positionStyleClass = ['top', 'right', 'bottom', 'left'];
        // This is the centering actor
        this.actor = new St.Bin({
            name: 'dashtodockContainer',
            reactive: false,
            style_class: positionStyleClass[this._position],
            x_align: this._isHorizontal?St.Align.MIDDLE:St.Align.START,
            y_align: this._isHorizontal?St.Align.START:St.Align.MIDDLE
        });
        this.actor._delegate = this;

        // This is the sliding actor whose allocation is to be tracked for input regions
        this._slider = new DashSlideContainer({
            side: this._position,
            initialSlideValue: 0
        });

        // This is the actor whose hover status us tracked for autohide
        this._box = new St.BoxLayout({
            name: 'dashtodockBox',
            reactive: true,
            track_hover: true
        });
        this._box.connect('notify::hover', Lang.bind(this, this._hoverChanged));

        // Create and apply height constraint to the dash. It's controlled by this.actor height
        this.constrainSize = new Clutter.BindConstraint({
            source: this.actor,
            coordinate: this._isHorizontal?Clutter.BindCoordinate.WIDTH:Clutter.BindCoordinate.HEIGHT
        });
        this.dash.actor.add_constraint(this.constrainSize);

        // Connect global signals
        this._signalsHandler = new Convenience.GlobalSignalsHandler();
        this._signalsHandler.add([
            Main.overview,
            'item-drag-begin',
            Lang.bind(this, this._onDragStart)
        ], [
            Main.overview,
            'item-drag-end',
            Lang.bind(this, this._onDragEnd)
        ], [
            Main.overview,
            'item-drag-cancelled',
            Lang.bind(this, this._onDragEnd)
        ], [
            // update when monitor changes, for instance in multimonitor when monitor are attached
            global.screen,
            'monitors-changed',
            Lang.bind(this, this._resetPosition )
        ], [
            // update when workarea changes, for instance if  other extensions modify the struts
            //(like moving th panel at the bottom)
            global.screen,
            'workareas-changed',
            Lang.bind(this, this._resetPosition)
        ], [
            Main.overview,
            'showing',
            Lang.bind(this, this._onOverviewShowing)
        ], [
            Main.overview,
            'hiding',
            Lang.bind(this, this._onOverviewHiding)
        ], [
            // Hide on appview
            Main.overview.viewSelector,
            'page-changed',
            Lang.bind(this, this._pageChanged)
        ], [
            Main.overview.viewSelector,
            'page-empty',
            Lang.bind(this, this._onPageEmpty)
        ], [
            // Ensure the ShowAppsButton status is kept in sync
            Main.overview.viewSelector._showAppsButton,
            'notify::checked',
            Lang.bind(this, this._syncShowAppsButtonToggled)
        ], [
            // Monitor windows overlapping
            this._intellihide,
            'status-changed',
            Lang.bind(this, this._updateDashVisibility)
        ], [
            // Keep dragged icon consistent in size with this dash
            this.dash,
            'icon-size-changed',
            Lang.bind(this, function() {
                Main.overview.dashIconSize = this.dash.iconSize;
            })
        ], [
            // This duplicate the similar signal which is in owerview.js.
            // Being connected and thus executed later this effectively
            // overwrite any attempt to use the size of the default dash
            //which given the customization is usually much smaller.
            // I can't easily disconnect the original signal
            Main.overview._controls.dash,
            'icon-size-changed',
            Lang.bind(this, function() {
                Main.overview.dashIconSize = this.dash.iconSize;
            })
        ]);

        this._injectionsHandler = new Convenience.InjectionsHandler();
        this._themeManager = new Theming.ThemeManager(this._settings, this.actor, this.dash);

        // Since the actor is not a topLevel child and its parent is now not added to the Chrome,
        // the allocation change of the parent container (slide in and slideout) doesn't trigger
        // anymore an update of the input regions. Force the update manually.
        this.actor.connect('notify::allocation',
                                              Lang.bind(Main.layoutManager, Main.layoutManager._queueUpdateRegions));

        this.dash._container.connect('allocation-changed', Lang.bind(this, this._updateStaticBox));
        this._slider.actor.connect(this._isHorizontal ? 'notify::x' : 'notify::y', Lang.bind(this, this._updateStaticBox));

        // sync hover after a popupmenu is closed
        this.dash.connect('menu-closed', Lang.bind(this, function() {
            this._box.sync_hover();
        }));

        // Restore dash accessibility
        Main.ctrlAltTabManager.addGroup(
            this.dash.actor, _('Dash'), 'user-bookmarks-symbolic',
                {focusCallback: Lang.bind(this, this._onAccessibilityFocus)});

        // Load optional features
        this._optionalScrollWorkspaceSwitch();
        this._optionalWorkspaceIsolation();

         // Delay operations that require the shell to be fully loaded and with
         // user theme applied.

        this._paintId = this.actor.connect('paint', Lang.bind(this, this._initialize));

        // Hide usual Dash
        Main.overview._controls.dash.actor.hide();

        // Also set dash width to 1, so it's almost not taken into account by code
        // calculaing the reserved space in the overview. The reason to keep it at 1 is
        // to allow its visibility change to trigger an allocaion of the appGrid which
        // in turn is triggergin the appsIcon spring animation, required when no other
        // actors has this effect, i.e in horizontal mode and without the workspaceThumnails
        // 1 static workspace only)
        Main.overview._controls.dash.actor.set_width(1);

        // Manage the  which is used to reserve space in the overview for the dock
        // Add and additional dashSpacer positioned according to the dash positioning.
        // It gets restored on extension unload.
        this._dashSpacer = new OverviewControls.DashSpacer();
        this._dashSpacer.setDashActor(this._box);

        if (this._position == St.Side.LEFT)
            Main.overview._controls._group.insert_child_at_index(this._dashSpacer, this._rtl ? -1 : 0); // insert on first
        else if (this._position ==  St.Side.RIGHT)
            Main.overview._controls._group.insert_child_at_index(this._dashSpacer, this._rtl ? 0 : -1); // insert on last
        else if (this._position == St.Side.TOP)
            Main.overview._overview.insert_child_at_index(this._dashSpacer, 0);
        else if (this._position == St.Side.BOTTOM)
            Main.overview._overview.insert_child_at_index(this._dashSpacer, -1);

        // Add dash container actor and the container to the Chrome.
        this.actor.set_child(this._slider.actor);
        this._slider.add_child(this._box);
        this._box.add_actor(this.dash.actor);

        // Add aligning container without tracking it for input region (old affectsinputRegion: false that was removed).
        // The public method trackChrome requires the actor to be child of a tracked actor. Since I don't want the parent
        // to be tracked I use the private internal _trackActor instead.
        Main.uiGroup.add_child(this.actor);

        if (this._settings.get_boolean('dock-fixed'))
            Main.layoutManager._trackActor(this._slider.actor, {affectsStruts: true, trackFullscreen: true});
        else
            Main.layoutManager._trackActor(this._slider.actor);

        // Keep the dash below the modalDialogGroup
        Main.layoutManager.uiGroup.set_child_below_sibling(this.actor,Main.layoutManager.modalDialogGroup);

        // pretend this._slider is isToplevel child so that fullscreen is actually tracked
        let index = Main.layoutManager._findActor(this._slider.actor);
        Main.layoutManager._trackedActors[index].isToplevel = true;

        // Set initial position
        this._resetPosition();
    },

    _initialize: function() {
        if (this._paintId > 0) {
            this.actor.disconnect(this._paintId);
            this._paintId=0;
        }

        this.dash.setIconSize(this._settings.get_int('dash-max-icon-size'), true);

        // Apply custome css class according to the settings
        this._themeManager.updateCustomTheme();

        // Since Gnome 3.8 dragging an app without having opened the overview before cause the attemp to
        //animate a null target since some variables are not initialized when the viewSelector is created
        if (Main.overview.viewSelector._activePage == null)
            Main.overview.viewSelector._activePage = Main.overview.viewSelector._workspacesPage;

        this._updateVisibilityMode();

        // In case we are already inside the overview when the extension is loaded,
        // for instance on unlocking the screen if it was locked with the overview open.
        if (Main.overview.visibleTarget) {
            this._onOverviewShowing();
            this._pageChanged();
        }

        // Setup pressure barrier (GS38+ only)
        this._updatePressureBarrier();
        this._updateBarrier();

        // setup dwelling system if pressure barriers are not available
        this._setupDockDwellIfNeeded();
    },

    destroy: function() {
        // Disconnect global signals
        this._signalsHandler.destroy();
        // The dash and intellihide have global signals as well internally
        this.dash.destroy();
        this._intellihide.destroy();

        this._injectionsHandler.destroy();

        // Destroy main clutter actor: this should be sufficient removing it and
        // destroying  all its children
        this.actor.destroy();

        // Remove barrier timeout
        if (this._removeBarrierTimeoutId > 0)
            Mainloop.source_remove(this._removeBarrierTimeoutId);

        // Remove existing barrier
        this._removeBarrier();

        // Remove pointer watcher
        if (this._dockWatch) {
            PointerWatcher.getPointerWatcher()._removeWatch(this._dockWatch);
            this._dockWatch = null;
        }

        // Remove the dashSpacer
        this._dashSpacer.destroy();

        // Reshow normal dash previously hidden, restore panel position if changed.
        Main.overview._controls.dash.actor.show();
        Main.overview._controls.dash.actor.set_width(-1); //reset default dash size
        // This force the recalculation of the icon size
        Main.overview._controls.dash._maxHeight = -1;

        // reset stored icon size  to the default dash
        Main.overview.dashIconSize = Main.overview._controls.dash.iconSize;
        // Reshow panel corners
        this._revertPanelCorners();
        this._resetLegacyTray();
    },

    _bindSettingsChanges: function() {
        this._settings.connect('changed::scroll-switch-workspace', Lang.bind(this, function() {
            this._optionalScrollWorkspaceSwitch(this._settings.get_boolean('scroll-switch-workspace'));
        }));

        this._settings.connect('changed::dash-max-icon-size', Lang.bind(this, function() {
            this.dash.setIconSize(this._settings.get_int('dash-max-icon-size'));
        }));

        this._settings.connect('changed::icon-size-fixed', Lang.bind(this, function() {
            this.dash.setIconSize(this._settings.get_int('dash-max-icon-size'));
        }));

        this._settings.connect('changed::show-favorites', Lang.bind(this, function() {
            this.dash.resetAppIcons();
        }));

        this._settings.connect('changed::show-running', Lang.bind(this, function() {
            this.dash.resetAppIcons();
        }));

        this._settings.connect('changed::show-apps-at-top', Lang.bind(this, function() {
            this.dash.resetAppIcons();
        }));

        this._settings.connect('changed::show-show-apps-button', Lang.bind(this, function() {
            if (this._settings.get_boolean('show-show-apps-button'))
                this.dash.showShowAppsButton();
            else
                this.dash.hideShowAppsButton();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function() {

            if (this._settings.get_boolean('dock-fixed')) {
                Main.layoutManager._untrackActor(this._slider.actor);
                Main.layoutManager._trackActor(this._slider.actor, {affectsStruts: true, trackFullscreen: true});
            } else {
                Main.layoutManager._untrackActor(this._slider.actor);
                Main.layoutManager._trackActor(this._slider.actor);
             }

            this._resetPosition();

            // Add or remove barrier depending on if dock-fixed
            this._updateBarrier();

            this._updateVisibilityMode();
        }));

        this._settings.connect('changed::intellihide', Lang.bind(this, this._updateVisibilityMode));

        this._settings.connect('changed::intellihide-mode', Lang.bind(this, function() {
            this._intellihide.forceUpdate();
        }));

        this._settings.connect('changed::autohide', Lang.bind(this, function() {
            this._updateVisibilityMode();
            this._updateBarrier();
        }));
        this._settings.connect('changed::extend-height', Lang.bind(this,this._resetPosition));
        this._settings.connect('changed::preferred-monitor', Lang.bind(this,this._resetPosition));
        this._settings.connect('changed::height-fraction', Lang.bind(this,this._resetPosition));
        this._settings.connect('changed::require-pressure-to-show', Lang.bind(this,function() {
            // Remove pointer watcher
            if (this._dockWatch) {
                PointerWatcher.getPointerWatcher()._removeWatch(this._dockWatch);
                this._dockWatch = null;
            }
            this._setupDockDwellIfNeeded();
            this._updateBarrier();
        }));
        this._settings.connect('changed::pressure-threshold', Lang.bind(this,function() {
            this._updatePressureBarrier();
            this._updateBarrier();
        }));

    },

    /**
     * This is call when visibility settings change
     */
    _updateVisibilityMode: function() {
        if (this._settings.get_boolean('dock-fixed')) {
            this._fixedIsEnabled = true;
            this._autohideIsEnabled = false;
            this._intellihideIsEnabled = false;
        }
        else {
            this._fixedIsEnabled = false;
            this._autohideIsEnabled = this._settings.get_boolean('autohide')
            this._intellihideIsEnabled = this._settings.get_boolean('intellihide')
        }

        if (this._intellihideIsEnabled)
            this._intellihide.enable();
        else
            this._intellihide.disable();

        this._updateDashVisibility();
    },

    /**
     * Show/hide dash based on, in order of priority:
     * overview visibility
     * fixed mode
     * intellihide
     * autohide
     * overview visibility
     */
    _updateDashVisibility: function() {
        if (Main.overview.visibleTarget)
            return;

        if (this._fixedIsEnabled) {
            this._removeAnimations();
            this._animateIn(this._settings.get_double('animation-time'), 0);
        }
        else if (this._intellihideIsEnabled) {
            if (this._intellihide.getOverlapStatus()) {
                this._ignoreHover = false;
                // Do not hide if autohide is enabled and mouse is hover
                if (!this._box.hover || !this._autohideIsEnabled)
                    this._animateOut(this._settings.get_double('animation-time'), 0);
            }
            else {
                this._ignoreHover = true;
                this._removeAnimations();
                this._animateIn(this._settings.get_double('animation-time'), 0);
            }
        }
        else {
            if (this._autohideIsEnabled) {
                this._ignoreHover = false;
                global.sync_pointer();

                if (this._box.hover)
                    this._animateIn(this._settings.get_double('animation-time'), 0);
                else
                    this._animateOut(this._settings.get_double('animation-time'), 0);
            }
            else
                this._animateOut(this._settings.get_double('animation-time'), 0);
        }
    },

    _onOverviewShowing: function() {
        this._ignoreHover = true;
        this._intellihide.disable();
        this._removeAnimations();
        this._animateIn(this._settings.get_double('animation-time'), 0);
    },

    _onOverviewHiding: function() {
        this._ignoreHover = false;
        this._intellihide.enable();
        this._updateDashVisibility();
    },

    _hoverChanged: function() {
        if (!this._ignoreHover) {
            // Skip if dock is not in autohide mode for instance because it is shown
            // by intellihide.
            if (this._autohideIsEnabled) {
                if (this._box.hover)
                    this._show();
                else
                    this._hide();
            }
        }
    },

    _show: function() {
        if ((this._dockState == State.HIDDEN) || (this._dockState == State.HIDING)) {
            if (this._dockState == State.HIDING)
                // suppress all potential queued hiding animations - i.e. added to Tweener but not started,
                // always give priority to show
                this._removeAnimations();

            this.emit('showing');
            this._animateIn(this._settings.get_double('animation-time'), 0);
        }
    },

    _hide: function() {
        // If no hiding animation is running or queued
        if ((this._dockState == State.SHOWN) || (this._dockState == State.SHOWING)) {
            let delay;

            if (this._dockState == State.SHOWING)
                //if a show already started, let it finish; queue hide without removing the show.
                // to obtain this I increase the delay to avoid the overlap and interference
                // between the animations
                delay = this._settings.get_double('hide-delay') + this._settings.get_double('animation-time');
            else
                delay = this._settings.get_double('hide-delay');

            this.emit('hiding');
            this._animateOut(this._settings.get_double('animation-time'), delay);
        }
    },

    _animateIn: function(time, delay) {
        this._dockState = State.SHOWING;

        Tweener.addTween(this._slider, {
            slidex: 1,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this._dockState = State.SHOWN;
                // Remove barrier so that mouse pointer is released and can access monitors on other side of dock
                // NOTE: Delay needed to keep mouse from moving past dock and re-hiding dock immediately. This
                // gives users an opportunity to hover over the dock
                if (this._removeBarrierTimeoutId > 0)
                    Mainloop.source_remove(this._removeBarrierTimeoutId);
                this._removeBarrierTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, this._removeBarrier));
            })
        });
    },

    _animateOut: function(time, delay) {
        this._dockState = State.HIDING;
        Tweener.addTween(this._slider, {
            slidex: 0,
            time: time,
            delay: delay ,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this._dockState = State.HIDDEN;
                this._updateBarrier();
            })
        });
    },

    /**
     * Dwelling system based on the GNOME Shell 3.14 messageTray code.
     */
    _setupDockDwellIfNeeded: function() {
        // If we don't have extended barrier features, then we need
        // to support the old tray dwelling mechanism.
        if (!global.display.supports_extended_barriers() || !this._settings.get_boolean('require-pressure-to-show')) {
            let pointerWatcher = PointerWatcher.getPointerWatcher();
            this._dockWatch = pointerWatcher.addWatch(DOCK_DWELL_CHECK_INTERVAL, Lang.bind(this, this._checkDockDwell));
            this._dockDwelling = false;
            this._dockDwellUserTime = 0;
        }
    },

    _checkDockDwell: function(x, y) {
        let monitor = this._monitor;

        // Check for the dock area
        let shouldDwell = (x >= this.staticBox.x1 && x <= this.staticBox.x2 &&
                           y >= this.staticBox.y1  && y <= this.staticBox.y2);

        // Check for the correct screen edge
        // Position is approximated to the lower integer
        if (this._position == St.Side.LEFT)
            shouldDwell = shouldDwell && (x == this._monitor.x);
        else if (this._position == St.Side.RIGHT)
            shouldDwell = shouldDwell && (x == this._monitor.x + this._monitor.width - 1);
        else if (this._position == St.Side.TOP)
            shouldDwell = shouldDwell && (y == this._monitor.y);
        else if (this._position == St.Side.BOTTOM)
            shouldDwell = shouldDwell && (y == this._monitor.y + this._monitor.height - 1);

        if (shouldDwell) {
            // We only set up dwell timeout when the user is not hovering over the dock
            // already (!this._box.hover).
            // The _dockDwelling variable is used so that we only try to
            // fire off one dock dwell - if it fails (because, say, the user has the mouse down),
            // we don't try again until the user moves the mouse up and down again.
            if (!this._dockDwelling && !this._box.hover && (this._dockDwellTimeoutId == 0)) {
                // Save the interaction timestamp so we can detect user input
                let focusWindow = global.display.focus_window;
                this._dockDwellUserTime = focusWindow ? focusWindow.user_time : 0;

                this._dockDwellTimeoutId = Mainloop.timeout_add(this._settings.get_double('show-delay') * 1000,
                                                                Lang.bind(this, this._dockDwellTimeout));
                GLib.Source.set_name_by_id(this._dockDwellTimeoutId, '[dash-to-dock] this._dockDwellTimeout');
            }
            this._dockDwelling = true;
        }
        else {
            this._cancelDockDwell();
            this._dockDwelling = false;
        }
    },

    _cancelDockDwell: function() {
        if (this._dockDwellTimeoutId != 0) {
            Mainloop.source_remove(this._dockDwellTimeoutId);
            this._dockDwellTimeoutId = 0;
        }
    },

    _dockDwellTimeout: function() {
        this._dockDwellTimeoutId = 0;

        if (!this._settings.get_boolean('autohide-in-fullscreen') && this._monitor.inFullscreen)
            return GLib.SOURCE_REMOVE;

        // We don't want to open the tray when a modal dialog
        // is up, so we check the modal count for that. When we are in the
        // overview we have to take the overview's modal push into account
        if (Main.modalCount > (Main.overview.visible ? 1 : 0))
            return GLib.SOURCE_REMOVE;

        // If the user interacted with the focus window since we started the tray
        // dwell (by clicking or typing), don't activate the message tray
        let focusWindow = global.display.focus_window;
        let currentUserTime = focusWindow ? focusWindow.user_time : 0;
        if (currentUserTime != this._dockDwellUserTime)
            return GLib.SOURCE_REMOVE;

        // Reuse the pressure version function, the logic is the same
        this._onPressureSensed();
        return GLib.SOURCE_REMOVE;
    },

    _updatePressureBarrier: function() {
        this._canUsePressure = global.display.supports_extended_barriers();
        let pressureThreshold = this._settings.get_double('pressure-threshold');

        // Remove existing pressure barrier
        if (this._pressureBarrier) {
            this._pressureBarrier.destroy();
            this._pressureBarrier = null;
        }

        if (this._barrier) {
            this._barrier.destroy();
            this._barrier = null;
        }

        // Create new pressure barrier based on pressure threshold setting
        if (this._canUsePressure) {
            this._pressureBarrier = new Layout.PressureBarrier(pressureThreshold, this._settings.get_double('show-delay')*1000,
                                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
            this._pressureBarrier.connect('trigger', Lang.bind(this, function(barrier) {
                if (!this._settings.get_boolean('autohide-in-fullscreen') && this._monitor.inFullscreen)
                    return;
                this._onPressureSensed();
            }));
        }
    },

    /**
     * handler for mouse pressure sensed
     */
    _onPressureSensed: function() {
        if (Main.overview.visibleTarget)
            return;

        // In case the mouse move away from the dock area before hovering it, in such case the leave event
        // would never be triggered and the dock would stay visible forever.
        let triggerTimeoutId =  Mainloop.timeout_add(250, Lang.bind(this, function() {
            triggerTimeoutId = 0;
            this._hoverChanged();
            return GLib.SOURCE_REMOVE;
        }));

        this._show();
    },

    /**
     * Remove pressure barrier
     */
    _removeBarrier: function() {
        if (this._barrier) {
            if (this._pressureBarrier)
                this._pressureBarrier.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._barrier = null;
        }
        this._removeBarrierTimeoutId = 0;
        return false;
    },

    /**
     * Update pressure barrier size
     */
    _updateBarrier: function() {
        // Remove existing barrier
        this._removeBarrier();

        // Manually reset pressure barrier
        // This is necessary because we remove the pressure barrier when it is triggered to show the dock
        if (this._pressureBarrier) {
            this._pressureBarrier._reset();
            this._pressureBarrier._isTriggered = false;
        }

        // Create new barrier
        // Note: dash in fixed position doesn't use pressure barrier
        if (this._canUsePressure && this._autohideIsEnabled && this._settings.get_boolean('require-pressure-to-show')) {
            let x1, x2, y1, y2, direction;

            if (this._position == St.Side.LEFT) {
                x1 = this.staticBox.x1;
                x2 = this.staticBox.x1;
                y1 = this.staticBox.y1;
                y2 = this.staticBox.y2;
                direction = Meta.BarrierDirection.POSITIVE_X;
            }
            else if (this._position == St.Side.RIGHT) {
                x1 = this.staticBox.x2;
                x2 = this.staticBox.x2;
                y1 = this.staticBox.y1;
                y2 = this.staticBox.y2;
                direction = Meta.BarrierDirection.NEGATIVE_X;
            }
            else if (this._position == St.Side.TOP) {
                x1 = this.staticBox.x1;
                x2 = this.staticBox.x2;
                y1 = this.staticBox.y1;
                y2 = this.staticBox.y1;
                direction = Meta.BarrierDirection.POSITIVE_Y;
            }
            else if (this._position == St.Side.BOTTOM) {
                x1 = this.staticBox.x1;
                x2 = this.staticBox.x2;
                y1 = this.staticBox.y2;
                y2 = this.staticBox.y2;
                direction = Meta.BarrierDirection.NEGATIVE_Y;
            }

            this._barrier = new Meta.Barrier({
                display: global.display,
                x1: x1,
                x2: x2,
                y1: y1,
                y2: y2,
                directions: direction
            });
            if (this._pressureBarrier)
                this._pressureBarrier.addBarrier(this._barrier);
        }
    },

    _isPrimaryMonitor: function() {
        return ((this._monitor.x == Main.layoutManager.primaryMonitor.x) &&
             (this._monitor.y == Main.layoutManager.primaryMonitor.y));
    },

    _resetPosition: function() {
        // Ensure variables linked to settings are updated.
        this._updateVisibilityMode();

        let monitorIndex = this._settings.get_int('preferred-monitor');
        let extendHeight = this._settings.get_boolean('extend-height');

        if ((monitorIndex > 0) && (monitorIndex < Main.layoutManager.monitors.length))
            this._monitor = Main.layoutManager.monitors[monitorIndex];
        else {
            monitorIndex = Main.layoutManager.primaryIndex
            this._monitor = Main.layoutManager.primaryMonitor;
        }

        // Note: do not use the workarea coordinates in the direction on which the dock is placed,
        // to avoid a loop [position change -> workArea change -> position change] with
        // fixed dock.
        let workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);

        // Reserve space for the dash on the overview
        // if the dock is on the primary monitor
        if (this._isPrimaryMonitor())
            this._dashSpacer.show();
        else
            // No space is required in the overview of the dash
            this._dashSpacer.hide();

        let fraction = this._settings.get_double('height-fraction');

        if (extendHeight)
            fraction = 1;
        else if ((fraction < 0) || (fraction > 1))
            fraction = 0.95;

        let anchor_point;

        if (this._isHorizontal) {
            this.actor.width = Math.round( fraction * workArea.width);

            let pos_y;
            if (this._position == St.Side.BOTTOM) {
                pos_y =  this._monitor.y + this._monitor.height;
                anchor_point = Clutter.Gravity.SOUTH_WEST;
            }
            else {
                pos_y = this._monitor.y;
                anchor_point = Clutter.Gravity.NORTH_WEST;
            }

            this.actor.move_anchor_point_from_gravity(anchor_point);
            this.actor.x = workArea.x + Math.round((1 - fraction) / 2 * workArea.width);
            this.actor.y = pos_y;

            if (extendHeight) {
                this.dash._container.set_width(this.actor.width);
                this.actor.add_style_class_name('extended');
            }
            else {
                this.dash._container.set_width(-1);
                this.actor.remove_style_class_name('extended');
            }
        }
        else {
            this.actor.height = Math.round(fraction * workArea.height);

            let pos_x;
            if (this._position == St.Side.RIGHT) {
                pos_x =  this._monitor.x + this._monitor.width;
                anchor_point = Clutter.Gravity.NORTH_EAST;
            }
            else {
                pos_x =  this._monitor.x;
                anchor_point = Clutter.Gravity.NORTH_WEST;
            }

            this.actor.move_anchor_point_from_gravity(anchor_point);
            this.actor.x = pos_x;
            this.actor.y = workArea.y + Math.round((1 - fraction) / 2 * workArea.height);

            if (extendHeight) {
                this.dash._container.set_height(this.actor.height);
                this.actor.add_style_class_name('extended');
            }
            else {
                this.dash._container.set_height(-1);
                this.actor.remove_style_class_name('extended');
            }
        }

        this._y0 = this.actor.y;
        this._adjustPanelCorners();

        this._adjustLegacyTray();
        this._updateStaticBox();
    },

    _adjustLegacyTray: function() {
        let use_work_area = true;

        if (this._fixedIsEnabled && !this._settings.get_boolean('extend-height')
            && this._isPrimaryMonitor()
            && ((this._position == St.Side.BOTTOM) || (this._position == St.Side.LEFT)))
            use_work_area = false;

        Main.legacyTray.actor.clear_constraints();
        let constraint = new Layout.MonitorConstraint({
            primary: true,
            work_area: use_work_area
        });
        Main.legacyTray.actor.add_constraint(constraint);
    },

    _resetLegacyTray: function() {
        Main.legacyTray.actor.clear_constraints();
        let constraint = new Layout.MonitorConstraint({
            primary: true,
            work_area: true
        });
        Main.legacyTray.actor.add_constraint(constraint);
    },

    _updateStaticBox: function() {
        this.staticBox.init_rect(
            this.actor.x + this._slider.actor.x - (this._position == St.Side.RIGHT ? this._box.width : 0),
            this.actor.y + this._slider.actor.y - (this._position == St.Side.BOTTOM ? this._box.height : 0),
            this._box.width,
            this._box.height
        );

        this._intellihide.updateTargetBox(this.staticBox);
    },

    /**
     * Adjust Panel corners
     */
    _adjustPanelCorners: function() {
        let extendHeight = this._settings.get_boolean('extend-height');
        if (!this._isHorizontal && this._isPrimaryMonitor() && extendHeight && this._fixedIsEnabled) {
            Main.panel._rightCorner.actor.hide();
            Main.panel._leftCorner.actor.hide();
        }
        else
            this._revertPanelCorners();
    },

    _revertPanelCorners: function() {
        Main.panel._leftCorner.actor.show();
        Main.panel._rightCorner.actor.show();
    },

    _removeAnimations: function() {
        Tweener.removeTweens(this._slider);
    },

    _onDragStart: function() {
        // The dash need to be above the top_window_group, otherwise it doesn't
        // accept dnd of app icons when not in overiew mode.
        Main.layoutManager.uiGroup.set_child_above_sibling(this.actor, global.top_window_group);
        this._oldignoreHover = this._ignoreHover;
        this._ignoreHover = true;
        this._animateIn(this._settings.get_double('animation-time'), 0);
    },

    _onDragEnd: function() {
        // Restore drag default dash stack order
        Main.layoutManager.uiGroup.set_child_below_sibling(this.actor, Main.layoutManager.modalDialogGroup);
        if (this._oldignoreHover !== null)
            this._ignoreHover  = this._oldignoreHover;
        this._oldignoreHover = null;
        this._box.sync_hover();
        if (Main.overview._shown)
            this._pageChanged();
    },

    _pageChanged: function() {
        let activePage = Main.overview.viewSelector.getActivePage();
        let dashVisible = (activePage == ViewSelector.ViewPage.WINDOWS ||
                           activePage == ViewSelector.ViewPage.APPS);

        if (dashVisible)
            this._animateIn(this._settings.get_double('animation-time'), 0);
        else
            this._animateOut(this._settings.get_double('animation-time'), 0);
    },

    _onPageEmpty: function() {
        /* The dash spacer is required only in the WINDOWS view if in the default position.
         * The 'page-empty' signal is emitted in between a change of view,
         * signalling the spacer can be added and removed without visible effect,
         * as it's done for the upstream dashSpacer.
         *
         * Moreover, hiding the spacer ensure the appGrid allocaton is triggered.
         * This matter as the appview spring animation is triggered by to first reallocaton of the appGrid,
         * (See appDisplay.js, line 202 on GNOME Shell 3.14:
         *                             this._grid.actor.connect('notify::allocation', ...)
         * which in turn seems to be triggered by changes in the other actors in the overview.
         * Normally, as far as I could understand, either the dashSpacer being hidden or the workspacesThumbnails
         * sliding out would trigger the allocation. However, with no stock dash
         * and no thumbnails, which happen if the user configured only 1 and static workspace,
         * the animation out of icons is not played.
         */

        let activePage = Main.overview.viewSelector.getActivePage();
        this._dashSpacer.visible = (this._isHorizontal || activePage == ViewSelector.ViewPage.WINDOWS);
    },

    /**
     * Show dock and give key focus to it
     */
    _onAccessibilityFocus: function() {
        this._box.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
        this._animateIn(this._settings.get_double('animation-time'), 0);
    },

    _onShowAppsButtonToggled: function() {
        // Sync the status of the default appButtons. Only if the two statuses are
        // different, that means the user interacted with the extension provided
        // application button, cutomize the behaviour. Otherwise the shell has changed the
        // status (due to the _syncShowAppsButtonToggled function below) and it
        // has already performed the desired action.

        let animate = this._settings.get_boolean('animate-show-apps');
        let selector = Main.overview.viewSelector;

        if (selector._showAppsButton.checked !== this.dash.showAppsButton.checked) {
            // find visible view
            let visibleView;
            Main.overview.viewSelector.appDisplay._views.every(function(v, index) {
                if (v.view.actor.visible) {
                    visibleView = index;
                    return false;
                }
                else
                    return true;
            });

            if (this.dash.showAppsButton.checked) {
                // force spring animation triggering.By default the animation only
                // runs if we are already inside the overview.
                if (!Main.overview._shown) {
                    this.forcedOverview = true;
                    if (animate) {
                        let view = Main.overview.viewSelector.appDisplay._views[visibleView].view;
                        let grid = view._grid;

                        // Animate in the the appview, hide the appGrid to avoiud flashing
                        // Go to the appView before entering the overview, skipping the workspaces.
                        // Do this manually avoiding opacity in transitions so that the setting of the opacity
                        // to 0 doesn't get overwritten.
                        Main.overview.viewSelector._activePage.opacity = 0;
                        Main.overview.viewSelector._activePage.hide();
                        Main.overview.viewSelector._activePage = Main.overview.viewSelector._appsPage;
                        Main.overview.viewSelector._activePage.show();
                        grid.actor.opacity = 0;

                        // The animation has to be trigered manually because the AppDisplay.animate
                        // method is waiting for an allocation not happening, as we skip the workspace view
                        // and the appgrid could already be allocated from previous shown.
                        // It has to be triggered after the overview is shown as wrong coordinates are obtained
                        // otherwise.
                        let overviewShownId = Main.overview.connect('shown', Lang.bind(this, function() {
                            Main.overview.disconnect(overviewShownId);
                            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                                grid.actor.opacity = 255;
                                grid.animateSpring(IconGrid.AnimationDirection.IN, this.dash.showAppsButton);
                            }));
                        }));
                    }
                }

                // Finally show the overview
                selector._showAppsButton.checked = true;
                Main.overview.show();
            }
            else {
                if (this.forcedOverview) {
                    // force exiting overview if needed

                    if (animate) {
                        // Manually trigger springout animation without activating the
                        // workspaceView to avoid the zoomout animation. Hide the appPage
                        // onComplete to avoid ugly flashing of original icons.
                        let view = Main.overview.viewSelector.appDisplay._views[visibleView].view;
                        let grid = view._grid;
                        view.animate(IconGrid.AnimationDirection.OUT, Lang.bind(this, function() {
                            Main.overview.viewSelector._appsPage.hide();
                            Main.overview.hide();
                            selector._showAppsButton.checked = false;
                            this.forcedOverview = false;
                        }));
                    }
                    else {
                        Main.overview.hide();
                        this.forcedOverview = false;
                    }
                }
                else {
                    selector._showAppsButton.checked = false;
                    this.forcedOverview = false;
                }
            }
        }

        // whenever the button is unactivated even if not by the user still reset the
        // forcedOverview flag
        if (this.dash.showAppsButton.checked == false)
            this.forcedOverview = false;
    },

    /**
     * Keep ShowAppsButton status in sync with the overview status
     */
    _syncShowAppsButtonToggled: function() {
        let status = Main.overview.viewSelector._showAppsButton.checked;
        if (this.dash.showAppsButton.checked !== status)
            this.dash.showAppsButton.checked = status;
    },

    // Optional features enable/disable

    /**
     * Switch workspace by scrolling over the dock
     */
    _optionalScrollWorkspaceSwitch: function() {
        let label = 'optionalScrollWorkspaceSwitch';

        this._settings.connect('changed::scroll-switch-workspace', Lang.bind(this, function() {
            if (this._settings.get_boolean('scroll-switch-workspace'))
                Lang.bind(this, enable)();
            else
                Lang.bind(this, disable)();
        }));

        if (this._settings.get_boolean('scroll-switch-workspace'))
            Lang.bind(this, enable)();

        function enable() {
            this._signalsHandler.removeWithLabel(label);

            this._signalsHandler.addWithLabel(label, [
                this._box,
                'scroll-event',
                Lang.bind(this, onScrollEvent)
            ]);

            this._optionalScrollWorkspaceSwitchDeadTimeId = 0;
        }

        function disable() {
            this._signalsHandler.removeWithLabel(label);

            if (this._optionalScrollWorkspaceSwitchDeadTimeId > 0) {
                Mainloop.source_remove(this._optionalScrollWorkspaceSwitchDeadTimeId);
                this._optionalScrollWorkspaceSwitchDeadTimeId = 0;
            }
        }

        // This was inspired to desktop-scroller@obsidien.github.com
        function onScrollEvent(actor, event) {
            // When in overview change workscape only in windows view
            if (Main.overview.visible && Main.overview.viewSelector.getActivePage() !== ViewSelector.ViewPage.WINDOWS)
                return false;

            let activeWs = global.screen.get_active_workspace();
            let direction = null;

            switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                direction = Meta.MotionDirection.UP;
                break;
            case Clutter.ScrollDirection.DOWN:
                direction = Meta.MotionDirection.DOWN;
                break;
            case Clutter.ScrollDirection.SMOOTH:
                let [dx, dy] = event.get_scroll_delta();
                if (dy < 0)
                    direction = Meta.MotionDirection.UP;
                else if (dy > 0)
                    direction = Meta.MotionDirection.DOWN;
                break;
            }

            if (direction !== null) {
                // Prevent scroll events from triggering too many workspace switches
                // by adding a 250ms deadtime between each scroll event.
                // Usefull on laptops when using a touchpad.

                // During the deadtime do nothing
                if (this._optionalScrollWorkspaceSwitchDeadTimeId > 0)
                    return false;
                else
                    this._optionalScrollWorkspaceSwitchDeadTimeId = Mainloop.timeout_add(250, Lang.bind(this, function() {
                        this._optionalScrollWorkspaceSwitchDeadTimeId = 0;
                    }));

                let ws;

                ws = activeWs.get_neighbor(direction)

                if (Main.wm._workspaceSwitcherPopup == null)
                    Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
                    // Set the actor non reactive, so that it doesn't prevent the
                    // clicks events from reaching the dash actor. I can't see a reason
                    // why it should be reactive.
                    Main.wm._workspaceSwitcherPopup.actor.reactive = false;
                    Main.wm._workspaceSwitcherPopup.connect('destroy', function() {
                        Main.wm._workspaceSwitcherPopup = null;
                    });

                // Do not show wokspaceSwithcer in overview
                if (!Main.overview.visible)
                    Main.wm._workspaceSwitcherPopup.display(direction, ws.index());
                Main.wm.actionMoveWorkspace(ws);

                return true;
            }
            else
                return false;
        }
    },

    /**
     * Isolate overview to open new windows for inactive apps
     */
    _optionalWorkspaceIsolation: function() {

        let label = 'optionalWorkspaceIsolation';

        this._settings.connect('changed::isolate-workspaces', Lang.bind(this, function() {
            this.dash.resetAppIcons();
            if (this._settings.get_boolean('isolate-workspaces'))
                Lang.bind(this, enable)();
            else
                Lang.bind(this, disable)();
        }));

        if (this._settings.get_boolean('isolate-workspaces'))
            Lang.bind(this, enable)();

        function enable() {
            this._injectionsHandler.removeWithLabel(label);

            this._injectionsHandler.addWithLabel(label, [
                Shell.App.prototype,
                'activate',
                IsolatedOverview
            ]);

            this._signalsHandler.removeWithLabel(label);

            this._signalsHandler.addWithLabel(label, [
                global.screen,
                'restacked',
                Lang.bind(this.dash, this.dash._queueRedisplay)
            ]);
            this._signalsHandler.addWithLabel(label, [
                global.window_manager,
                'switch-workspace',
                Lang.bind(this.dash, this.dash._queueRedisplay)
            ]);
        }

        function disable() {
            this._injectionsHandler.removeWithLabel(label);
            this._signalsHandler.removeWithLabel(label);
        }

        function IsolatedOverview() {
            // These lines take care of Nautilus for icons on Desktop
            let windows = this.get_windows().filter(function(w) {
                return w.get_workspace().index() == global.screen.get_active_workspace_index();
            });
            if (windows.length == 1)
                if (windows[0].skip_taskbar)
                    return this.open_new_window(-1);

            if (this.is_on_workspace(global.screen.get_active_workspace()))
                return Main.activateWindow(windows[0]);
            return this.open_new_window(-1);
        }
    }
});

Signals.addSignalMethods(DockedDash.prototype);
