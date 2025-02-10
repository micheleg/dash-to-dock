// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    Clutter,
    GLib,
    Gio,
    GObject,
    Meta,
    Shell,
    St,
} from './dependencies/gi.js';

import {
    AppMenu,
    AppDisplay,
    Layout,
    Main,
    OverviewControls,
    PointerWatcher,
    Workspace,
    WorkspacesView,
    WorkspaceSwitcherPopup,
} from './dependencies/shell/ui.js';

import {
    AnimationUtils,
} from './dependencies/shell/misc.js';

import {
    AppIconsDecorator,
    AppSpread,
    DockDash,
    DesktopIconsIntegration,
    FileManager1API,
    Intellihide,
    LauncherAPI,
    Locations,
    NotificationsMonitor,
    Theming,
    Utils,
} from './imports.js';

const {signals: Signals} = imports;

const DOCK_DWELL_CHECK_INTERVAL = 100;
const ICON_ANIMATOR_DURATION = 3000;
const STARTUP_ANIMATION_TIME = 500;

export const State = Object.freeze({
    HIDDEN:  0,
    SHOWING: 1,
    SHOWN:   2,
    HIDING:  3,
});

const scrollAction = Object.freeze({
    DO_NOTHING: 0,
    CYCLE_WINDOWS: 1,
    SWITCH_WORKSPACE: 2,
});

const Labels = Object.freeze({
    INITIALIZE: Symbol('initialize'),
    ISOLATION: Symbol('isolation'),
    LOCATIONS: Symbol('locations'),
    MAIN_DASH: Symbol('main-dash'),
    OLD_DASH_CHANGES: Symbol('old-dash-changes'),
    SETTINGS: Symbol('settings'),
    STARTUP_ANIMATION: Symbol('startup-animation'),
    WORKSPACE_SWITCH_SCROLL: Symbol('workspace-switch-scroll'),
});

/**
 * A simple St.Widget with one child whose allocation takes into account the
 * slide out of its child via the slide-x property ([0:1]).
 *
 * Required since I want to track the input region of this container which is
 * based on its allocation even if the child overflows the parent actor. By doing
 * this the region of the dash that is slide-out is not stealing anymore the input
 * regions making the extension usable when the primary monitor is the right one.
 *
 * The slide-x parameter can be used to directly animate the sliding. The parent
 * must have a WEST (SOUTH) anchor_point to achieve the sliding to the RIGHT (BOTTOM)
 * side.
 */
const DashSlideContainer = GObject.registerClass({
    Properties: {
        'monitor-index': GObject.ParamSpec.uint(
            'monitor-index', 'monitor-index', 'monitor-index',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            0, GLib.MAXUINT32, 0),
        'side': GObject.ParamSpec.enum(
            'side', 'side', 'side',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            St.Side, St.Side.LEFT),
        'slide-x': GObject.ParamSpec.double(
            'slide-x', 'slide-x', 'slide-x',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
            0, 1, 1),
    },
}, class DashSlideContainer extends St.Bin {
    _init(params = {}) {
        super._init(params);

        this._slideoutSize = 0; // minimum size when slided out
        this.connect('notify::slide-x', () => this.queue_relayout());

        if (this.side === St.Side.TOP && DockManager.settings.dockFixed) {
            this._signalsHandler = new Utils.GlobalSignalsHandler(this);
            this._signalsHandler.add(Main.panel, 'notify::height',
                () => this.queue_relayout());
        }
    }

    vfunc_allocate(box) {
        const contentBox = this.get_theme_node().get_content_box(box);

        this.set_allocation(box);

        if (!this.child)
            return;

        const availWidth = contentBox.x2 - contentBox.x1;
        let availHeight = contentBox.y2 - contentBox.y1;
        const [, , natChildWidth, natChildHeight] =
            this.child.get_preferred_size();

        const childWidth = natChildWidth;
        const childHeight = natChildHeight;

        const childBox = new Clutter.ActorBox();

        const slideoutSize = this._slideoutSize;

        if (this.side === St.Side.LEFT) {
            childBox.x1 = (this.slideX - 1) * (childWidth - slideoutSize);
            childBox.x2 = slideoutSize + this.slideX * (childWidth - slideoutSize);
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        } else if ((this.side === St.Side.RIGHT) || (this.side === St.Side.BOTTOM)) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        } else if (this.side === St.Side.TOP) {
            const monitor = Main.layoutManager.monitors[this.monitorIndex];
            let yOffset = 0;
            if (Main.panel.x === monitor.x && Main.panel.y === monitor.y &&
                DockManager.settings.dockFixed)
                yOffset = Main.panel.height;
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = (this.slideX - 1) * (childHeight - slideoutSize) + yOffset;
            childBox.y2 = slideoutSize + this.slideX * (childHeight - slideoutSize) + yOffset;
            availHeight += yOffset;
        }

        this.child.allocate(childBox);

        this.child.set_clip(-childBox.x1, -childBox.y1,
            -childBox.x1 + availWidth, -childBox.y1 + availHeight);
    }

    /**
     * Just the child width but taking into account the slided out part
     *
     * @param forHeight
     */
    vfunc_get_preferred_width(forHeight) {
        let [minWidth, natWidth] = super.vfunc_get_preferred_width(forHeight || 0);
        if ((this.side ===  St.Side.LEFT) || (this.side === St.Side.RIGHT)) {
            minWidth = (minWidth - this._slideoutSize) * this.slideX + this._slideoutSize;
            natWidth = (natWidth - this._slideoutSize) * this.slideX + this._slideoutSize;
        }
        return [minWidth, natWidth];
    }

    /**
     * Just the child height but taking into account the slided out part
     *
     * @param forWidth
     */
    vfunc_get_preferred_height(forWidth) {
        let [minHeight, natHeight] = super.vfunc_get_preferred_height(forWidth || 0);
        if ((this.side ===  St.Side.TOP) || (this.side ===  St.Side.BOTTOM)) {
            minHeight = (minHeight - this._slideoutSize) * this.slideX + this._slideoutSize;
            natHeight = (natHeight - this._slideoutSize) * this.slideX + this._slideoutSize;

            if (this.side === St.Side.TOP && DockManager.settings.dockFixed) {
                const monitor = Main.layoutManager.monitors[this.monitorIndex];
                if (Main.panel.x === monitor.x && Main.panel.y === monitor.y) {
                    minHeight += Main.panel.height;
                    natHeight += Main.panel.height;
                }
            }
        }
        return [minHeight, natHeight];
    }
});

const DockedDash = GObject.registerClass({
    Properties: {
        'is-main': GObject.ParamSpec.boolean(
            'is-main', 'is-main', 'is-main',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            false),
        'monitor-index': GObject.ParamSpec.uint(
            'monitor-index', 'monitor-index', 'monitor-index',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            0, GLib.MAXUINT32, 0),
    },
    Signals: {
        'showing': {},
        'hiding': {},
    },
}, class DashToDock extends St.Bin {
    _init(params) {
        this._position = Utils.getPosition();

        // This is the centering actor
        super._init({
            ...params,
            name: 'dashtodockContainer',
            reactive: false,
            style_class: Theming.PositionStyleClass[this._position],
        });

        if (this.monitorIndex === undefined) {
            // Hello turkish locale, gjs has instead defined this.monitorIndex
            // See: https://gitlab.gnome.org/GNOME/gjs/-/merge_requests/742
            this.monitorIndex = this.monitor_index;
        }

        this._rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;

        // Load settings
        const {settings} = DockManager;
        this._isHorizontal = (this._position === St.Side.TOP) || (this._position === St.Side.BOTTOM);

        // Temporary ignore hover events linked to autohide for whatever reason
        this._ignoreHover = false;
        this._oldIgnoreHover = null;
        // This variables are linked to the settings regardles of autohide or intellihide
        // being temporary disable. Get set by _updateVisibilityMode;
        this._autohideIsEnabled = null;
        this._intellihideIsEnabled = null;

        // This variable marks if _disableUnredirect() is called
        // to help restore the original state when intelihide is disabled.
        this._unredirectDisabled = false;

        // Create intellihide object to monitor windows overlapping
        this._intellihide = new Intellihide.Intellihide(this.monitorIndex);

        // initialize dock state
        this._dockState = State.HIDDEN;

        // Put dock on the required monitor
        this._monitor = Main.layoutManager.monitors[this.monitorIndex];

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
        this._dockDwellTimeoutId = 0;

        // Create a new dash object
        this.dash = new DockDash.DockDash(this.monitorIndex);

        if (Main.overview.isDummy || !settings.showShowAppsButton)
            this.dash.hideShowAppsButton();

        // Create the containers for sliding in and out and
        // centering, turn on track hover
        // This is the sliding actor whose allocation is to be tracked for input regions
        this._slider = new DashSlideContainer({
            monitor_index: this._monitor.index,
            side: this._position,
            slide_x: Main.layoutManager._startingUp ? 0 : 1,
            ...this._isHorizontal ? {
                x_align: Clutter.ActorAlign.CENTER,
            } : {
                y_align: Clutter.ActorAlign.CENTER,
            },
        });

        // This is the actor whose hover status us tracked for autohide
        this._box = new St.BoxLayout({
            name: 'dashtodockBox',
            reactive: true,
            track_hover: true,
        });
        this._box.connect('notify::hover', this._hoverChanged.bind(this));

        // Connect global signals
        this._signalsHandler = new Utils.GlobalSignalsHandler(this);
        this._bindSettingsChanges();
        this._signalsHandler.add([
            // update when workarea changes, for instance if  other extensions modify the struts
            // (like moving th panel at the bottom)
            global.display,
            'workareas-changed',
            this._resetPosition.bind(this),
        ], [
            global.display,
            'in-fullscreen-changed',
            this._updateBarrier.bind(this),
        ], [
            // Monitor windows overlapping
            this._intellihide,
            'status-changed',
            this._updateDashVisibility.bind(this),
        ], [
            this.dash,
            'menu-opened',
            () => {
                this._onMenuOpened();
            },
        ], [
            // sync hover after a popupmenu is closed
            this.dash,
            'menu-closed',
            () => {
                this._onMenuClosed();
            },
        ], [
            this.dash,
            'notify::requires-visibility',
            () => this._updateDashVisibility(),
        ]);

        if (!Main.overview.isDummy) {
            this._signalsHandler.add([
                Main.overview,
                'item-drag-begin',
                this._onDragStart.bind(this),
            ], [
                Main.overview,
                'item-drag-end',
                this._onDragEnd.bind(this),
            ], [
                Main.overview,
                'item-drag-cancelled',
                this._onDragEnd.bind(this),
            ], [
                Main.overview,
                'showing',
                this._onOverviewShowing.bind(this),
            ], [
                Main.overview,
                'hiding',
                this._onOverviewHiding.bind(this),
            ],
            [
                Main.overview,
                'hidden',
                this._onOverviewHidden.bind(this),
            ]);
        }

        this._themeManager = new Theming.ThemeManager(this);
        this._signalsHandler.add(this._themeManager, 'updated',
            () => this.dash.resetAppIcons());

        this._signalsHandler.add(DockManager.iconTheme, 'changed',
            () => this.dash.resetAppIcons());

        // Since the actor is not a topLevel child and its parent is now not added to the Chrome,
        // the allocation change of the parent container (slide in and slideout) doesn't trigger
        // anymore an update of the input regions. Force the update manually.
        this.connect('notify::allocation',
            Main.layoutManager._queueUpdateRegions.bind(Main.layoutManager));


        // Since Clutter has no longer ClutterAllocationFlags,
        // "allocation-changed" signal has been removed. MR !1245
        this.dash._container.connect('notify::allocation', this._updateStaticBox.bind(this));
        this._slider.connect(this._isHorizontal ? 'notify::x' : 'notify::y',
            this._updateStaticBox.bind(this));

        // Load optional features that need to be activated for one dock only
        if (this.isMain)
            this._enableExtraFeatures();
        // Load optional features that need to be activated once per dock
        this._optionalScrollWorkspaceSwitch();

        // Delay operations that require the shell to be fully loaded and with
        // user theme applied.

        this._signalsHandler.addWithLabel(Labels.INITIALIZE, global.stage,
            'after-paint', () => this._initialize());

        // Add dash container actor and the container to the Chrome.
        this.set_child(this._slider);
        this._slider.set_child(this._box);
        this._box.add_child(this.dash);

        // Add aligning container without tracking it for input region
        this._trackDock();

        // Create and apply height/width constraint to the dash.
        if (this._isHorizontal) {
            this.connect('notify::width', () => {
                this.dash.setMaxSize(this.width, this.height);
            });
        } else {
            this.connect('notify::height', () => {
                this.dash.setMaxSize(this.width, this.height);
            });
        }

        if (this._position === St.Side.RIGHT) {
            this.connect('notify::width', () =>
                (this.translation_x = -this.width));
        } else if (this._position === St.Side.BOTTOM) {
            this.connect('notify::height', () =>
                (this.translation_y = -this.height));
        }

        // Set initial position
        this._resetPosition();

        this.connect('destroy', this._onDestroy.bind(this));
    }

    get position() {
        return this._position;
    }

    get isHorizontal() {
        return this._isHorizontal;
    }

    _untrackDock() {
        Main.layoutManager.untrackChrome(this);
    }

    _trackDock() {
        if (DockManager.settings.dockFixed) {
            Main.layoutManager.addChrome(this, {
                trackFullscreen: true,
                affectsStruts: true,
            });
        } else {
            Main.layoutManager.addChrome(this);
        }
    }

    _initialize() {
        this._signalsHandler.removeWithLabel(Labels.INITIALIZE);

        // Apply custom css class according to the settings
        this._themeManager.updateCustomTheme();

        this._updateVisibilityMode();

        // In case we are already inside the overview when the extension is loaded,
        // for instance on unlocking the screen if it was locked with the overview open.
        if (Main.overview.visibleTarget)
            this._onOverviewShowing();

        this._updateAutoHideBarriers();
    }

    _onDestroy() {
        // The dash, intellihide and themeManager have global signals as well internally
        this.dash.destroy();
        this._intellihide.destroy();
        this._themeManager.destroy();

        if (this._marginLater) {
            Utils.laterRemove(this._marginLater);
            delete this._marginLater;
        }

        if (this._triggerTimeoutId)
            GLib.source_remove(this._triggerTimeoutId);

        this._restoreUnredirect();

        // Remove barrier timeout
        if (this._removeBarrierTimeoutId > 0)
            GLib.source_remove(this._removeBarrierTimeoutId);

        // Remove existing barrier
        this._removeBarrier();

        // Remove pointer watcher
        if (this._dockWatch) {
            PointerWatcher.getPointerWatcher()._removeWatch(this._dockWatch);
            this._dockWatch = null;
        }
    }

    _updateAutoHideBarriers() {
        // Remove pointer watcher
        if (this._dockWatch) {
            PointerWatcher.getPointerWatcher()._removeWatch(this._dockWatch);
            this._dockWatch = null;
        }

        // Setup pressure barrier (GS38+ only)
        this._updatePressureBarrier();
        this._updateBarrier();

        // setup dwelling system if pressure barriers are not available
        this._setupDockDwellIfNeeded();
    }

    _bindSettingsChanges() {
        const {settings} = DockManager;
        this._signalsHandler.add([
            settings,
            'changed::scroll-action',
            () => {
                this._optionalScrollWorkspaceSwitch();
            },
        ], [
            settings,
            'changed::dash-max-icon-size',
            () => {
                this.dash.setIconSize(settings.dashMaxIconSize);
            },
        ], [
            settings,
            'changed::icon-size-fixed',
            () => {
                this.dash.setIconSize(settings.dashMaxIconSize);
            },
        ], [
            settings,
            'changed::show-favorites',
            () => {
                this.dash.resetAppIcons();
            },
        ], [
            settings,
            'changed::show-trash',
            () => {
                this.dash.resetAppIcons();
            },
            Utils.SignalsHandlerFlags.CONNECT_AFTER,
        ], [
            settings,
            'changed::show-mounts',
            () => {
                this.dash.resetAppIcons();
            },
            Utils.SignalsHandlerFlags.CONNECT_AFTER,
        ], [
            settings,
            'changed::isolate-locations',
            () => this.dash.resetAppIcons(),
            Utils.SignalsHandlerFlags.CONNECT_AFTER,
        ], [
            settings,
            'changed::dance-urgent-applications',
            () => this.dash.resetAppIcons(),
            Utils.SignalsHandlerFlags.CONNECT_AFTER,
        ], [
            settings,
            'changed::show-running',
            () => {
                this.dash.resetAppIcons();
            },
        ], [
            settings,
            'changed::show-apps-always-in-the-edge',
            () => {
                this.dash.updateShowAppsButton();
            },
        ], [
            settings,
            'changed::show-apps-at-top',
            () => {
                this.dash.updateShowAppsButton();
            },
        ], [
            settings,
            'changed::show-show-apps-button',
            () => {
                if (!Main.overview.isDummy &&
                        settings.showShowAppsButton)
                    this.dash.showShowAppsButton();
                else
                    this.dash.hideShowAppsButton();
            },
        ], [
            settings,
            'changed::dock-fixed',
            () => {
                this._untrackDock();
                this._trackDock();

                this._resetPosition();
                this._updateAutoHideBarriers();
                this._updateVisibilityMode();
            },
        ], [
            settings,
            'changed::manualhide',
            () => {
                this._updateVisibilityMode();
            },
        ], [
            settings,
            'changed::intellihide',
            () => {
                this._updateVisibilityMode();
                this._updateVisibleDesktop();
            },
        ], [
            settings,
            'changed::intellihide-mode',
            () => {
                this._intellihide.forceUpdate();
            },
        ], [
            settings,
            'changed::autohide',
            () => {
                this._updateVisibilityMode();
                this._updateAutoHideBarriers();
            },
        ], [
            settings,
            'changed::autohide-in-fullscreen',
            this._updateBarrier.bind(this),
        ], [
            settings,
            'changed::show-dock-urgent-notify',
            () => {
                this.dash.resetAppIcons();
            },
        ],
        [
            settings,
            'changed::extend-height',
            this._resetPosition.bind(this),
        ], [
            settings,
            'changed::height-fraction',
            this._resetPosition.bind(this),
        ], [
            settings,
            'changed::always-center-icons',
            () => this.dash.resetAppIcons(),
        ], [
            settings,
            'changed::require-pressure-to-show',
            () => this._updateAutoHideBarriers(),
        ], [
            settings,
            'changed::pressure-threshold',
            () => {
                this._updatePressureBarrier();
                this._updateBarrier();
            },
        ]);
    }

    _disableUnredirect() {
        if (!this._unredirectDisabled) {
            if (Meta.disable_unredirect_for_display !== undefined)
                Meta.disable_unredirect_for_display(global.display);
            else if (global.compositor.disable_unredirect !== undefined)
                global.compositor.disable_unredirect();
            this._unredirectDisabled = true;
        }
    }

    _restoreUnredirect() {
        if (this._unredirectDisabled) {
            if (Meta.enable_unredirect_for_display !== undefined)
                Meta.enable_unredirect_for_display(global.display);
            else if (global.compositor.enable_unredirect !== undefined)
                global.compositor.enable_unredirect();
            this._unredirectDisabled = false;
        }
    }

    /**
     * This is call when visibility settings change
     */
    _updateVisibilityMode() {
        const {settings} = DockManager;
        if (DockManager.settings.dockFixed || DockManager.settings.manualhide) {
            this._autohideIsEnabled = false;
            this._intellihideIsEnabled = false;
        } else {
            this._autohideIsEnabled = settings.autohide;
            this._intellihideIsEnabled = settings.intellihide;
        }

        if (this._autohideIsEnabled)
            this.add_style_class_name('autohide');
        else
            this.remove_style_class_name('autohide');

        if (this._intellihideIsEnabled) {
            this._intellihide.enable();
        } else {
            this._intellihide.disable();
            this._restoreUnredirect();
        }

        this._updateDashVisibility();
    }

    /**
     * Show/hide dash based on, in order of priority:
     * overview visibility
     * fixed mode
     * intellihide
     * autohide
     * overview visibility
     */
    _updateDashVisibility() {
        if (DockManager.settings.manualhide) {
            this._ignoreHover = true;
            this._removeAnimations();
            this._animateOut(0, 0);
            return;
        }

        if (Main.overview.visibleTarget)
            return;

        const {settings} = DockManager;

        if (DockManager.settings.dockFixed) {
            this._removeAnimations();
            this._animateIn(settings.animationTime, 0);
        } else if (this._intellihideIsEnabled) {
            if (!this.dash.requiresVisibility && this._intellihide.getOverlapStatus()) {
                this._ignoreHover = false;
                // Do not hide if autohide is enabled and mouse is hover
                if (!this._box.hover || !this._autohideIsEnabled)
                    this._animateOut(settings.animationTime, 0);
            } else {
                this._ignoreHover = true;
                this._removeAnimations();
                this._animateIn(settings.animationTime, 0);
            }
        } else if (this._autohideIsEnabled) {
            this._ignoreHover = false;

            if (this._box.hover || this.dash.requiresVisibility)
                this._animateIn(settings.animationTime, 0);
            else
                this._animateOut(settings.animationTime, 0);
        } else {
            this._animateOut(settings.animationTime, 0);
        }
    }

    _onOverviewShowing() {
        this.add_style_class_name('overview');

        this._ignoreHover = true;
        this._intellihide.disable();
        this._removeAnimations();
        this._animateIn(DockManager.settings.animationTime, 0);
    }

    _onOverviewHiding() {
        this._intellihide.enable();
        this._updateDashVisibility();
    }

    _onOverviewHidden() {
        this.remove_style_class_name('overview');
        this._updateDashVisibility();
    }

    _onMenuOpened() {
        this._ignoreHover = true;
    }

    _onMenuClosed() {
        this._ignoreHover = false;
        this._box.sync_hover();
        this._updateDashVisibility();
    }

    _hoverChanged() {
        if (!this._ignoreHover) {
            // Skip if dock is not in autohide mode for instance because it is shown
            // by intellihide.
            if (this._autohideIsEnabled) {
                if (this._box.hover || Main.overview.visible)
                    this._show();
                else
                    this._hide();
            }
        }
    }

    getDockState() {
        return this._dockState;
    }

    _show() {
        this._delayedHide = false;
        if ((this._dockState === State.HIDDEN) || (this._dockState === State.HIDING)) {
            if (this._dockState === State.HIDING)
                // suppress all potential queued transitions - i.e. added but not started,
                // always give priority to show
                this._removeAnimations();

            this.emit('showing');
            this._animateIn(DockManager.settings.animationTime, 0);
        }
    }

    _hide() {
        // If no hiding animation is running or queued
        if ((this._dockState === State.SHOWN) || (this._dockState === State.SHOWING)) {
            const {settings} = DockManager;
            const delay = settings.hideDelay;

            if (this._dockState === State.SHOWING) {
                // if a show already started, let it finish; queue hide without removing the show.
                // to obtain this, we wait for the animateIn animation to be completed
                this._delayedHide = true;
                return;
            }

            this.emit('hiding');
            this._animateOut(settings.animationTime, delay);
        }
    }

    _animateIn(time, delay) {
        if (this._intellihideIsEnabled)
            this._disableUnredirect();
        this._dockState = State.SHOWING;
        this.dash.iconAnimator.start();
        this._delayedHide = false;

        this._slider.ease_property('slide-x', 1, {
            duration: time * 1000,
            delay: delay * 1000,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._dockState = State.SHOWN;
                // Remove barrier so that mouse pointer is released and can
                // monitors on other side of dock.
                // NOTE: Delay needed to keep mouse from moving past dock and
                // re-hiding dock immediately. This gives users an opportunity
                // to hover over the dock
                if (this._removeBarrierTimeoutId > 0)
                    GLib.source_remove(this._removeBarrierTimeoutId);

                if (!this._delayedHide) {
                    this._removeBarrierTimeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT, 100, this._removeBarrier.bind(this));
                } else {
                    this._hide();
                }
            },
        });
    }

    _animateOut(time, delay) {
        this._dockState = State.HIDING;

        this._slider.ease_property('slide-x', 0, {
            duration: time * 1000,
            delay: delay * 1000,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._dockState = State.HIDDEN;
                if (this._intellihideIsEnabled)
                    this._restoreUnredirect();
                // Remove queued barrier removal timeout if any
                if (this._removeBarrierTimeoutId > 0)
                    GLib.source_remove(this._removeBarrierTimeoutId);
                this._updateBarrier();
                this.dash.iconAnimator.pause();
            },
        });
    }

    /**
     * Dwelling system based on the GNOME Shell 3.14 messageTray code.
     */
    _setupDockDwellIfNeeded() {
        // If we don't have extended barrier features, then we need
        // to support the old tray dwelling mechanism.
        if (this._autohideIsEnabled &&
            (!Utils.supportsExtendedBarriers() ||
             !DockManager.settings.requirePressureToShow)) {
            const pointerWatcher = PointerWatcher.getPointerWatcher();
            this._dockWatch = pointerWatcher.addWatch(
                DOCK_DWELL_CHECK_INTERVAL, this._checkDockDwell.bind(this));
            this._dockDwelling = false;
            this._dockDwellUserTime = 0;
        }
    }

    _checkDockDwell(x, y) {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);
        let shouldDwell;
        // Check for the correct screen edge, extending the sensitive area to the whole workarea,
        // minus 1 px to avoid conflicting with other active corners.
        if (this._position === St.Side.LEFT) {
            shouldDwell = (x === this._monitor.x) && (y > workArea.y) &&
                (y < workArea.y + workArea.height);
        } else if (this._position === St.Side.RIGHT) {
            shouldDwell = (x === this._monitor.x + this._monitor.width - 1) &&
                (y > workArea.y) && (y < workArea.y + workArea.height);
        } else if (this._position === St.Side.TOP) {
            shouldDwell = (y === this._monitor.y) && (x > workArea.x) &&
                (x < workArea.x + workArea.width);
        } else if (this._position === St.Side.BOTTOM) {
            shouldDwell = (y === this._monitor.y + this._monitor.height - 1) &&
                (x > workArea.x) && (x < workArea.x + workArea.width);
        }

        if (shouldDwell) {
            // We only set up dwell timeout when the user is not hovering over the dock
            // already (!this._box.hover).
            // The _dockDwelling variable is used so that we only try to
            // fire off one dock dwell - if it fails (because, say, the user has the mouse down),
            // we don't try again until the user moves the mouse up and down again.
            if (!this._dockDwelling && !this._box.hover && (this._dockDwellTimeoutId === 0)) {
                // Save the interaction timestamp so we can detect user input
                const focusWindow = global.display.focus_window;
                this._dockDwellUserTime = focusWindow ? focusWindow.user_time : 0;

                this._dockDwellTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    DockManager.settings.showDelay * 1000,
                    this._dockDwellTimeout.bind(this));
                GLib.Source.set_name_by_id(this._dockDwellTimeoutId,
                    '[dash-to-dock] this._dockDwellTimeout');
            }
            this._dockDwelling = true;
        } else {
            this._cancelDockDwell();
            this._dockDwelling = false;
        }
    }

    _cancelDockDwell() {
        if (this._dockDwellTimeoutId !== 0) {
            GLib.source_remove(this._dockDwellTimeoutId);
            this._dockDwellTimeoutId = 0;
        }
    }

    _dockDwellTimeout() {
        this._dockDwellTimeoutId = 0;

        if (!DockManager.settings.autohideInFullscreen &&
            this._monitor.inFullscreen)
            return GLib.SOURCE_REMOVE;

        // We don't want to open the tray when a modal dialog
        // is up, so we check the modal count for that. When we are in the
        // overview we have to take the overview's modal push into account
        if (Main.modalCount > (Main.overview.visible ? 1 : 0))
            return GLib.SOURCE_REMOVE;

        // If the user interacted with the focus window since we started the tray
        // dwell (by clicking or typing), don't activate the message tray
        const focusWindow = global.display.focus_window;
        const currentUserTime = focusWindow ? focusWindow.user_time : 0;
        if (currentUserTime !== this._dockDwellUserTime)
            return GLib.SOURCE_REMOVE;

        // Reuse the pressure version function, the logic is the same
        this._onPressureSensed();
        return GLib.SOURCE_REMOVE;
    }

    _updatePressureBarrier() {
        const {settings} = DockManager;
        this._canUsePressure = Utils.supportsExtendedBarriers();
        const {pressureThreshold} = settings;

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
        if (this._canUsePressure && this._autohideIsEnabled &&
            DockManager.settings.requirePressureToShow) {
            this._pressureBarrier = new Layout.PressureBarrier(
                pressureThreshold, settings.showDelay * 1000,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
            this._pressureBarrier.connect('trigger', _barrier => {
                if (!settings.autohideInFullscreen && this._monitor.inFullscreen)
                    return;
                this._onPressureSensed();
            });
        }
    }

    /**
     * handler for mouse pressure sensed
     */
    _onPressureSensed() {
        if (Main.overview.visibleTarget)
            return;

        if (this._triggerTimeoutId)
            GLib.source_remove(this._triggerTimeoutId);

        // In case the mouse move away from the dock area before hovering it,
        // in such case the leave event would never be triggered and the dock
        // would stay visible forever.
        this._triggerTimeoutId =  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            const [x, y, mods_] = global.get_pointer();
            let shouldHide = true;
            switch (this._position) {
            case St.Side.LEFT:
                if (x <= this.staticBox.x2 &&
                    x >= this._monitor.x &&
                    y >= this._monitor.y &&
                    y <= this._monitor.y + this._monitor.height)
                    shouldHide = false;

                break;
            case St.Side.RIGHT:
                if (x >= this.staticBox.x1 &&
                    x <= this._monitor.x + this._monitor.width &&
                    y >= this._monitor.y &&
                    y <= this._monitor.y + this._monitor.height)
                    shouldHide = false;

                break;
            case St.Side.TOP:
                if (x >= this._monitor.x &&
                    x <= this._monitor.x + this._monitor.width &&
                    y <= this.staticBox.y2 &&
                    y >= this._monitor.y)
                    shouldHide = false;

                break;
            case St.Side.BOTTOM:
                if (x >= this._monitor.x &&
                    x <= this._monitor.x + this._monitor.width &&
                    y >= this.staticBox.y1 &&
                    y <= this._monitor.y + this._monitor.height)
                    shouldHide = false;
            }
            if (shouldHide) {
                this._triggerTimeoutId = 0;
                this._hoverChanged();
                return GLib.SOURCE_REMOVE;
            } else {
                return GLib.SOURCE_CONTINUE;
            }
        });

        this._show();
    }

    /**
     * Remove pressure barrier
     */
    _removeBarrier() {
        if (this._barrier) {
            if (this._pressureBarrier)
                this._pressureBarrier.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._barrier = null;
        }
        this._removeBarrierTimeoutId = 0;
        return false;
    }

    /**
     * Update pressure barrier size
     */
    _updateBarrier() {
        // Remove existing barrier
        this._removeBarrier();

        // The barrier needs to be removed in fullscreen with autohide disabled
        // otherwise the mouse can get trapped on monitor.
        if (this._monitor.inFullscreen &&
            !DockManager.settings.autohideInFullscreen)
            return;

        // Manually reset pressure barrier
        // This is necessary because we remove the pressure barrier when it is
        // triggered to show the dock
        if (this._pressureBarrier) {
            this._pressureBarrier._reset();
            this._pressureBarrier._isTriggered = false;
        }

        // Create new barrier
        // The barrier extends to the whole workarea, minus 1 px to avoid
        // conflicting with other active corners
        // Note: dash in fixed position doesn't use pressure barrier.
        if (this._canUsePressure && this._autohideIsEnabled &&
            DockManager.settings.requirePressureToShow) {
            let x1, x2, y1, y2, direction;
            const workArea = Main.layoutManager.getWorkAreaForMonitor(
                this._monitor.index);

            if (this._position === St.Side.LEFT) {
                x1 = this._monitor.x + 1;
                x2 = x1;
                y1 = workArea.y + 1;
                y2 = workArea.y + workArea.height - 1;
                direction = Meta.BarrierDirection.POSITIVE_X;
            } else if (this._position === St.Side.RIGHT) {
                x1 = this._monitor.x + this._monitor.width - 1;
                x2 = x1;
                y1 = workArea.y + 1;
                y2 = workArea.y + workArea.height - 1;
                direction = Meta.BarrierDirection.NEGATIVE_X;
            } else if (this._position === St.Side.TOP) {
                x1 = workArea.x + 1;
                x2 = workArea.x + workArea.width - 1;
                y1 = this._monitor.y;
                y2 = y1;
                direction = Meta.BarrierDirection.POSITIVE_Y;
            } else if (this._position === St.Side.BOTTOM) {
                x1 = workArea.x + 1;
                x2 = workArea.x + workArea.width - 1;
                y1 = this._monitor.y + this._monitor.height;
                y2 = y1;
                direction = Meta.BarrierDirection.NEGATIVE_Y;
            }

            if (this._pressureBarrier && this._dockState === State.HIDDEN) {
                this._barrier = new Meta.Barrier({
                    backend: global.backend,
                    x1,
                    x2,
                    y1,
                    y2,
                    directions: direction,
                });
                this._pressureBarrier.addBarrier(this._barrier);
            }
        }
    }

    _isPrimaryMonitor() {
        return this.monitorIndex === Main.layoutManager.primaryIndex;
    }

    _resetPosition() {
        // Ensure variables linked to settings are updated.
        this._updateVisibilityMode();

        const {dockFixed: fixedIsEnabled, dockExtended: extendHeight} = DockManager.settings;

        if (fixedIsEnabled)
            this.add_style_class_name('fixed');
        else
            this.remove_style_class_name('fixed');

        // Note: do not use the workarea coordinates in the direction on which the dock is placed,
        // to avoid a loop [position change -> workArea change -> position change] with
        // fixed dock.
        const workArea = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex);

        let fraction = DockManager.settings.heightFraction;
        if (extendHeight)
            fraction = 1;
        else if ((fraction < 0) || (fraction > 1))
            fraction = 0.95;

        if (this._isHorizontal) {
            this.width = Math.round(fraction * workArea.width);

            let posY = this._monitor.y;
            if (this._position === St.Side.BOTTOM)
                posY += this._monitor.height;

            this.x = workArea.x + Math.round((1 - fraction) / 2 * workArea.width);
            this.y = posY;

            if (extendHeight) {
                this.dash._container.set_width(this.width);
                this.add_style_class_name('extended');
            } else {
                this.dash._container.set_width(-1);
                this.remove_style_class_name('extended');
            }
        } else {
            this.height = Math.round(fraction * workArea.height);

            let posX = this._monitor.x;
            if (this._position === St.Side.RIGHT)
                posX += this._monitor.width;

            this.x = posX;
            this.y = workArea.y + Math.round((1 - fraction) / 2 * workArea.height);

            if (extendHeight) {
                this.dash._container.set_height(this.height);
                this.add_style_class_name('extended');
            } else {
                this.dash._container.set_height(-1);
                this.remove_style_class_name('extended');
            }
        }
    }

    _updateVisibleDesktop() {
        if (!this._intellihideIsEnabled)
            return;

        const {desktopIconsUsableArea} = DockManager.getDefault();
        if (this._position === St.Side.BOTTOM)
            desktopIconsUsableArea.setMargins(this.monitorIndex, 0, this._box.height, 0, 0);
        else if (this._position === St.Side.TOP)
            desktopIconsUsableArea.setMargins(this.monitorIndex, this._box.height, 0, 0, 0);
        else if (this._position === St.Side.RIGHT)
            desktopIconsUsableArea.setMargins(this.monitorIndex, 0, 0, 0, this._box.width);
        else if (this._position === St.Side.LEFT)
            desktopIconsUsableArea.setMargins(this.monitorIndex, 0, 0, this._box.width, 0);
    }

    _updateStaticBox() {
        this.staticBox.init_rect(
            this.x + this._slider.x - (this._position === St.Side.RIGHT ? this._box.width : 0),
            this.y + this._slider.y - (this._position === St.Side.BOTTOM ? this._box.height : 0),
            this._box.width,
            this._box.height
        );

        this._intellihide.updateTargetBox(this.staticBox);
        this._updateVisibleDesktop();
    }

    _removeAnimations() {
        this._slider.remove_all_transitions();
    }

    _onDragStart() {
        this._oldIgnoreHover = this._ignoreHover;
        this._ignoreHover = true;
        this._animateIn(DockManager.settings.animationTime, 0);
    }

    _onDragEnd() {
        if (this._oldIgnoreHover)
            this._ignoreHover = this._oldIgnoreHover;
        this._oldIgnoreHover = null;
        this._box.sync_hover();
        this._updateDashVisibility();
    }

    /**
     * Show dock and give key focus to it
     */
    _onAccessibilityFocus() {
        this._box.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
        this._animateIn(DockManager.settings.animationTime, 0);
    }

    // Optional features to be enabled only for the main Dock
    _enableExtraFeatures() {
        // Restore dash accessibility
        Main.ctrlAltTabManager.addGroup(
            this.dash, _('Dash'), 'user-bookmarks-symbolic',
            {focusCallback: this._onAccessibilityFocus.bind(this)});
    }

    /**
     * Switch workspace by scrolling over the dock
     */
    _optionalScrollWorkspaceSwitch() {
        const isEnabled = () =>
            DockManager.settings.scrollAction === scrollAction.SWITCH_WORKSPACE;

        const enable = () => {
            this._signalsHandler.removeWithLabel(Labels.WORKSPACE_SWITCH_SCROLL);

            this._signalsHandler.addWithLabel(Labels.WORKSPACE_SWITCH_SCROLL,
                this._box, 'scroll-event', (_, e) => onScrollEvent(e));
        };

        const disable = () => {
            this._signalsHandler.removeWithLabel(Labels.WORKSPACE_SWITCH_SCROLL);

            if (this._optionalScrollWorkspaceSwitchDeadTimeId) {
                GLib.source_remove(this._optionalScrollWorkspaceSwitchDeadTimeId);
                this._optionalScrollWorkspaceSwitchDeadTimeId = 0;
            }
        };

        DockManager.settings.connect('changed::scroll-action', () => {
            if (isEnabled())
                enable();
            else
                disable();
        });

        if (isEnabled())
            enable();

        // This was inspired to desktop-scroller@obsidien.github.com
        const onScrollEvent = event => {
            // When in overview change workspace only in windows view
            if (Main.overview.visible)
                return false;

            const activeWs = global.workspace_manager.get_active_workspace();
            let direction = null;

            let prevDirection, nextDirection;
            if (global.workspace_manager.layout_columns > global.workspace_manager.layout_rows) {
                prevDirection = Meta.MotionDirection.UP;
                nextDirection = Meta.MotionDirection.DOWN;
            } else {
                prevDirection = Meta.MotionDirection.LEFT;
                nextDirection = Meta.MotionDirection.RIGHT;
            }

            switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                direction = prevDirection;
                break;
            case Clutter.ScrollDirection.DOWN:
                direction = nextDirection;
                break;
            case Clutter.ScrollDirection.SMOOTH: {
                const [dx_, dy] = event.get_scroll_delta();
                if (dy < 0)
                    direction = prevDirection;
                else if (dy > 0)
                    direction = nextDirection;
            }
                break;
            }

            if (direction) {
                // Prevent scroll events from triggering too many workspace switches
                // by adding a 250ms dead time between each scroll event.
                // Useful on laptops when using a touch pad.

                // During the deadtime do nothing
                if (this._optionalScrollWorkspaceSwitchDeadTimeId) {
                    return false;
                } else {
                    this._optionalScrollWorkspaceSwitchDeadTimeId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT, 250, () => {
                            this._optionalScrollWorkspaceSwitchDeadTimeId = 0;
                        });
                }

                let ws;

                ws = activeWs.get_neighbor(direction);

                if (!Main.wm._workspaceSwitcherPopup) {
                    // Support Workspace Grid extension showing their custom
                    // Grid Workspace Switcher
                    if (global.workspace_manager.workspace_grid !== undefined) {
                        Main.wm._workspaceSwitcherPopup =
                            global.workspace_manager.workspace_grid.getWorkspaceSwitcherPopup();
                    } else {
                        Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
                    }
                }
                // Set the actor non reactive, so that it doesn't prevent the
                // clicks events from reaching the dash actor. I can't see a reason
                // why it should be reactive.
                Main.wm._workspaceSwitcherPopup.reactive = false;
                Main.wm._workspaceSwitcherPopup.connect('destroy', () => {
                    Main.wm._workspaceSwitcherPopup = null;
                });

                // If Workspace Grid is installed, let them handle the scroll behavior.
                if (global.workspace_manager.workspace_grid !== undefined)
                    ws = global.workspace_manager.workspace_grid.actionMoveWorkspace(direction);
                else
                    Main.wm.actionMoveWorkspace(ws);

                // Do not show workspaceSwitcher in overview
                if (!Main.overview.visible)
                    Main.wm._workspaceSwitcherPopup.display(direction, ws.index());

                return true;
            } else {
                return false;
            }
        };
    }

    _activateApp(appIndex) {
        const children = this.dash._box.get_children().filter(actor => {
            return actor.child &&
                       actor.child.app;
        });

        // Apps currently in the dash
        const apps = children.map(actor => {
            return actor.child;
        });

        // Activate with button = 1, i.e. same as left click
        const button = 1;
        if (appIndex < apps.length)
            apps[appIndex].activate(button);
    }
});

/*
 * Handle keyboard shortcuts
 */
const NUM_HOTKEYS = 10;

const KeyboardShortcuts = class DashToDockKeyboardShortcuts {
    constructor() {
        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._hotKeysEnabled = false;
        if (DockManager.settings.hotKeys)
            this._enableHotKeys();

        this._signalsHandler.add([
            DockManager.settings,
            'changed::hot-keys',
            () => {
                if (DockManager.settings.hotKeys)
                    this._enableHotKeys.bind(this)();
                else
                    this._disableHotKeys.bind(this)();
            },
        ]);

        this._optionalNumberOverlay();
    }

    destroy() {
        DockManager.allDocks.forEach(dock => {
            if (dock._numberOverlayTimeoutId) {
                GLib.source_remove(dock._numberOverlayTimeoutId);
                dock._numberOverlayTimeoutId = 0;
            }
        });

        // Remove keybindings
        this._disableHotKeys();
        this._disableExtraShortcut();
        this._signalsHandler.destroy();
    }

    _enableHotKeys() {
        if (this._hotKeysEnabled)
            return;

        // Setup keyboard bindings for dash elements
        const keys = ['app-hotkey-', 'app-shift-hotkey-', 'app-ctrl-hotkey-'];
        const {mainDock} = DockManager.getDefault();
        keys.forEach(function (key) {
            for (let i = 0; i < NUM_HOTKEYS; i++) {
                const appNum = i;
                Main.wm.addKeybinding(key + (i + 1), DockManager.settings,
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                    () => {
                        mainDock._activateApp(appNum);
                        this._showOverlay();
                    });
            }
        }, this);

        this._hotKeysEnabled = true;
    }

    _disableHotKeys() {
        if (!this._hotKeysEnabled)
            return;

        const keys = ['app-hotkey-', 'app-shift-hotkey-', 'app-ctrl-hotkey-'];
        keys.forEach(key => {
            for (let i = 0; i < NUM_HOTKEYS; i++)
                Main.wm.removeKeybinding(key + (i + 1));
        }, this);

        this._hotKeysEnabled = false;
    }

    _optionalNumberOverlay() {
        const {settings} = DockManager;
        this._shortcutIsSet = false;
        // Enable extra shortcut if either 'overlay' or 'show-dock' are true
        if (settings.hotKeys &&
           (settings.hotkeysOverlay || settings.hotkeysShowDock))
            this._enableExtraShortcut();

        this._signalsHandler.add([
            settings,
            'changed::hot-keys',
            this._checkHotkeysOptions.bind(this),
        ], [
            settings,
            'changed::hotkeys-overlay',
            this._checkHotkeysOptions.bind(this),
        ], [
            settings,
            'changed::hotkeys-show-dock',
            this._checkHotkeysOptions.bind(this),
        ]);
    }

    _checkHotkeysOptions() {
        const {settings} = DockManager;

        if (settings.hotKeys &&
           (settings.hotkeysOverlay || settings.hotkeysShowDock))
            this._enableExtraShortcut();
        else
            this._disableExtraShortcut();
    }

    _enableExtraShortcut() {
        if (!this._shortcutIsSet) {
            Main.wm.addKeybinding('shortcut', DockManager.settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                this._showOverlay.bind(this));
            this._shortcutIsSet = true;
        }
    }

    _disableExtraShortcut() {
        if (this._shortcutIsSet) {
            Main.wm.removeKeybinding('shortcut');
            this._shortcutIsSet = false;
        }
    }

    _showOverlay() {
        for (const dock of DockManager.allDocks) {
            if (DockManager.settings.hotkeysOverlay)
                dock.dash.toggleNumberOverlay(true);

            // Restart the counting if the shortcut is pressed again
            if (dock._numberOverlayTimeoutId) {
                GLib.source_remove(dock._numberOverlayTimeoutId);
                dock._numberOverlayTimeoutId = 0;
            }

            // Hide the overlay/dock after the timeout
            const timeout = DockManager.settings.shortcutTimeout * 1000;
            dock._numberOverlayTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, timeout, () => {
                    dock._numberOverlayTimeoutId = 0;
                    dock.dash.toggleNumberOverlay(false);
                    // Hide the dock again if necessary
                    dock._updateDashVisibility();
                });

            // Show the dock if it is hidden
            if (DockManager.settings.hotkeysShowDock) {
                const showDock = dock._intellihideIsEnabled || dock._autohideIsEnabled;
                if (showDock)
                    dock._show();
            }
        }
    }
};

/**
 * Isolate overview to open new windows for inactive apps
 * Note: the future implementation is not fully contained here.
 * Some bits are around in other methods of other classes.
 * This class just take care of enabling/disabling the option.
 */
const WorkspaceIsolation = class DashToDockWorkspaceIsolation {
    constructor() {
        const {settings} = DockManager;

        this._signalsHandler = new Utils.GlobalSignalsHandler();
        this._injectionsHandler = new Utils.InjectionsHandler();

        const updateAllDocks = () => {
            DockManager.allDocks.forEach(dock =>
                dock.dash.resetAppIcons());
            if (settings.isolateWorkspaces ||
                settings.isolateMonitors)
                this._enable.bind(this)();
            else
                this._disable.bind(this)();
        };
        this._signalsHandler.add(
            [settings, 'changed::isolate-workspaces', updateAllDocks],
            [settings, 'changed::workspace-agnostic-urgent-windows', updateAllDocks],
            [settings, 'changed::isolate-monitors', updateAllDocks]
        );

        if (settings.isolateWorkspaces ||
            settings.isolateMonitors)
            this._enable();
    }

    _enable() {
        // ensure I never double-register/inject
        // although it should never happen
        this._disable();

        DockManager.allDocks.forEach(dock => {
            this._signalsHandler.addWithLabel(
                Labels.ISOLATION,
                [global.display, 'restacked', () => dock.dash._queueRedisplay()],
                [global.display, 'window-marked-urgent', () => dock.dash._queueRedisplay()],
                [global.display, 'window-demands-attention', () => dock.dash._queueRedisplay()],
                [global.window_manager, 'switch-workspace', () => dock.dash._queueRedisplay()]
            );

            // This last signal is only needed for monitor isolation, as windows
            // might migrate from one monitor to another without triggering 'restacked'
            if (DockManager.settings.isolateMonitors) {
                this._signalsHandler.addWithLabel(Labels.ISOLATION,
                    global.display,
                    'window-entered-monitor',
                    dock.dash._queueRedisplay.bind(dock.dash));
            }
        }, this);

        /**
         * here this is the Shell.App
         */
        function IsolatedOverview() {
            // These lines take care of Nautilus for icons on Desktop
            const activeWorkspaceIndex =
                global.workspaceManager.get_active_workspace_index();
            const windows = this.get_windows().filter(w =>
                !w.skipTaskbar && w.get_workspace().index() === activeWorkspaceIndex);

            if (windows.length)
                return Main.activateWindow(windows[0]);
            return this.open_new_window(-1);
        }

        this._injectionsHandler.addWithLabel(Labels.ISOLATION,
            Shell.App.prototype,
            'activate',
            IsolatedOverview);
    }

    _disable() {
        this._signalsHandler.removeWithLabel(Labels.ISOLATION);
        this._injectionsHandler.removeWithLabel(Labels.ISOLATION);
    }

    destroy() {
        this._signalsHandler.destroy();
        this._injectionsHandler.destroy();
    }
};


export class DockManager {
    constructor(extension) {
        if (DockManager._singleton)
            throw new Error('DashToDock has been already initialized');
        DockManager._singleton = this;
        this._extension = extension;
        this._signalsHandler = new Utils.GlobalSignalsHandler(this);
        this._methodInjections = new Utils.InjectionsHandler(this);
        this._vfuncInjections = new Utils.VFuncInjectionsHandler(this);
        this._propertyInjections = new Utils.PropertyInjectionsHandler(this);
        this._settings = this._extension.getSettings(
            'org.gnome.shell.extensions.dash-to-dock');
        this._appSwitcherSettings = new Gio.Settings({schema_id: 'org.gnome.shell.app-switcher'});
        this._mapSettingsValues();

        this._iconTheme = new St.IconTheme();

        this._desktopIconsUsableArea = new DesktopIconsIntegration.DesktopIconsUsableAreaClass();
        this._oldDash = Main.overview.isDummy ? null : Main.overview.dash;
        this._discreteGpuAvailable = AppDisplay.discreteGpuAvailable;
        this._appSpread = new AppSpread.AppSpread();
        this._notificationsMonitor = new NotificationsMonitor.NotificationsMonitor();

        const needsRemoteModel = () =>
            !this._notificationsMonitor.dndMode && this._settings.showIconsEmblems;

        const ensureRemoteModel = () => {
            if (needsRemoteModel && !this._remoteModel) {
                this._remoteModel = new LauncherAPI.LauncherEntryRemoteModel();
                this._appIconsDecorator = new AppIconsDecorator.AppIconsDecorator();
            } else if (!needsRemoteModel) {
                this._remoteModel?.destroy();
                delete this._remoteModel;
                this._appIconsDecorator?.destroy();
                delete this._appIconsDecorator;
            }
        };
        ensureRemoteModel();

        this._notificationsMonitor.connect('changed', ensureRemoteModel);
        this._settings.connect('changed::show-icons-emblems', ensureRemoteModel);

        if (this._discreteGpuAvailable === undefined) {
            const updateDiscreteGpuAvailable = () => {
                const switcherooProxy = global.get_switcheroo_control();
                if (switcherooProxy) {
                    const prop = switcherooProxy.get_cached_property('HasDualGpu');
                    this._discreteGpuAvailable = prop?.unpack() ?? false;
                } else {
                    this._discreteGpuAvailable = false;
                }
            };
            this._signalsHandler.add(global, 'notify::switcheroo-control',
                () => updateDiscreteGpuAvailable());
            updateDiscreteGpuAvailable();
        }

        // Connect relevant signals to the toggling function
        this._bindSettingsChanges();

        this._ensureLocations();

        /* Array of all the docks created */
        this._allDocks = [];
        this._createDocks();

        this._overrideAppMenus();

        // status variable: true when the overview is shown through the dash
        // applications button.
        this._forcedOverview = false;
    }

    static getDefault() {
        return DockManager._singleton;
    }

    static get allDocks() {
        return DockManager.getDefault()._allDocks;
    }

    static get extension() {
        return DockManager.getDefault().extension;
    }

    static get settings() {
        return DockManager.getDefault().settings;
    }

    get extension() {
        return this._extension;
    }

    get settings() {
        return this._settings;
    }

    static get iconTheme() {
        return DockManager.getDefault().iconTheme;
    }

    get settings() { // eslint-disable-line no-dupe-class-members
        return this._settings;
    }

    get iconTheme() {
        return this._iconTheme;
    }

    get fm1Client() {
        return this._fm1Client;
    }

    get remoteModel() {
        return this._remoteModel;
    }

    get mainDock() {
        return this._allDocks.length ? this._allDocks[0] : null;
    }

    get removables() {
        return this._removables;
    }

    get trash() {
        return this._trash;
    }

    get desktopIconsUsableArea() {
        return this._desktopIconsUsableArea;
    }

    get discreteGpuAvailable() {
        return AppDisplay.discreteGpuAvailable || this._discreteGpuAvailable;
    }

    get appSpread() {
        return this._appSpread;
    }

    get notificationsMonitor() {
        return this._notificationsMonitor;
    }

    getDockByMonitor(monitorIndex) {
        return this._allDocks.find(d => d.monitorIndex === monitorIndex);
    }

    _ensureLocations() {
        const {showMounts, showTrash} = this.settings;

        if (showTrash || showMounts) {
            if (!this._fm1Client)
                this._fm1Client = new FileManager1API.FileManager1Client();
        } else if (this._fm1Client) {
            this._fm1Client.destroy();
            this._fm1Client = null;
        }

        if (showMounts && !this._removables) {
            this._removables = new Locations.Removables();
        } else if (!showMounts && this._removables) {
            this._removables.destroy();
            this._removables = null;
        }

        if (showTrash && !this._trash) {
            this._trash = new Locations.Trash();
        } else if (!showTrash && this._trash) {
            this._trash.destroy();
            this._trash = null;
        }

        Locations.unWrapFileManagerApp();
        [this._methodInjections, this._propertyInjections].forEach(
            injections => injections.removeWithLabel(Labels.LOCATIONS));

        if (showMounts || showTrash) {
            if (this.settings.isolateLocations) {
                const fileManagerApp = Locations.wrapFileManagerApp();

                this._methodInjections.addWithLabel(Labels.LOCATIONS, [
                    Shell.AppSystem.prototype, 'get_running',
                    function (originalMethod, ...args) {
                        /* eslint-disable no-invalid-this */
                        const runningApps = originalMethod.call(this, ...args);
                        const locationApps = Locations.getRunningApps();
                        if (!locationApps.length)
                            return runningApps;

                        const fileManagerIdx = runningApps.indexOf(fileManagerApp);
                        if (fileManagerIdx > -1 && fileManagerApp?.state !== Shell.AppState.RUNNING)
                            runningApps.splice(fileManagerIdx, 1);

                        return [...runningApps, ...locationApps].sort(Utils.shellAppCompare);
                        /* eslint-enable no-invalid-this */
                    },
                ],
                [
                    Shell.WindowTracker.prototype, 'get_window_app',
                    function (originalMethod, window) {
                        /* eslint-disable no-invalid-this */
                        const locationApp = Locations.getRunningApps().find(a =>
                            a.get_windows().includes(window));
                        return locationApp ?? originalMethod.call(this, window);
                        /* eslint-enable no-invalid-this */
                    },
                ],
                [
                    Shell.WindowTracker.prototype, 'get_app_from_pid',
                    function (originalMethod, pid) {
                        /* eslint-disable no-invalid-this */
                        const locationApp = Locations.getRunningApps().find(a =>
                            a.get_pids().includes(pid));
                        return locationApp ?? originalMethod.call(this, pid);
                        /* eslint-enable no-invalid-this */
                    },
                ]);

                const {get: defaultFocusAppGetter} = Object.getOwnPropertyDescriptor(
                    Shell.WindowTracker.prototype, 'focus_app');
                this._propertyInjections.addWithLabel(Labels.LOCATIONS,
                    Shell.WindowTracker.prototype, 'focus_app', {
                        get() {
                            const locationApp = Locations.getRunningApps().find(a => a.isFocused);
                            return locationApp ?? defaultFocusAppGetter.call(this);
                        },
                    });
            }
        }
    }

    _toggle() {
        if (this._toggleLater)
            return;

        this._toggleLater = Utils.laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
            delete this._toggleLater;
            this._restoreDash();
            this._deleteDocks();
            this._createDocks();
            this.emit('toggled');
        });
    }

    _mapExternalSetting(settings, key, mappedKey, mapValueFunction) {
        const camelMappedKey = mappedKey.replace(/-([a-z\d])/g, k => k[1].toUpperCase());

        const dockPropertyDesc = Object.getOwnPropertyDescriptor(this.settings, camelMappedKey);

        if (!dockPropertyDesc)
            throw new Error('Setting %s not found in dock'.format(mappedKey));

        const mappedValue = () => mapValueFunction(settings.get_value(key).recursiveUnpack());
        Object.defineProperty(this.settings, camelMappedKey, {
            get: () => mappedValue() ?? dockPropertyDesc.value,
            set: value => {
                if (mappedValue())
                    dockPropertyDesc.value = value;
            },
        });

        this._signalsHandler.addWithLabel(Labels.SETTINGS, settings,
            'changed::%s'.format(key), () => {
                this._signalsHandler.blockWithLabel(Labels.SETTINGS);
                this.settings.emit('changed::%s'.format(mappedKey), mappedKey);
                this._signalsHandler.unblockWithLabel(Labels.SETTINGS);
            });
    }

    _mapSettingsValues() {
        this.settings.settingsSchema.list_keys().forEach(key => {
            const camelKey = key.replace(/-([a-z\d])/g, k => k[1].toUpperCase());
            const updateSetting = () => {
                const schemaKey = this.settings.settingsSchema.get_key(key);
                if (schemaKey.get_range().deepUnpack()[0] === 'enum')
                    this.settings[camelKey] = this.settings.get_enum(key);
                else
                    this.settings[camelKey] = this.settings.get_value(key).recursiveUnpack();
            };
            updateSetting();
            this._signalsHandler.addWithLabel(Labels.SETTINGS, this.settings,
                `changed::${key}`, updateSetting);
            if (key !== camelKey) {
                Object.defineProperty(this.settings, key,
                    {get: () => this.settings[camelKey]});
            }
        });
        Object.defineProperties(this.settings, {
            dockExtended: {get: () => this.settings.extendHeight},
        });
    }

    _bindSettingsChanges() {
        // Connect relevant signals to the toggling function
        this._signalsHandler.addWithLabel(Labels.SETTINGS, [
            Utils.getMonitorManager(),
            'monitors-changed',
            this._toggle.bind(this),
        ], [
            Main.sessionMode,
            'updated',
            this._toggle.bind(this),
        ], [
            this._settings,
            'changed::multi-monitor',
            this._toggle.bind(this),
        ], [
            this._settings,
            'changed::preferred-monitor',
            this._toggle.bind(this),
        ], [
            this._settings,
            'changed::preferred-monitor-by-connector',
            this._toggle.bind(this),
        ], [
            this._settings,
            'changed::dock-position',
            this._toggle.bind(this),
        ], [
            this._settings,
            'changed::extend-height',
            () => this._adjustPanelCorners(),
        ], [
            this._settings,
            'changed::dock-fixed',
            () => this._adjustPanelCorners(),
        ], [
            this._settings,
            'changed::show-trash',
            () => this._ensureLocations(),
        ], [
            this._settings,
            'changed::show-mounts',
            () => this._ensureLocations(),
        ], [
            this._settings,
            'changed::isolate-locations',
            () => this._ensureLocations(),
        ], [
            this._settings,
            'changed::intellihide',
            () => {
                if (!this._settings.intellihide)
                    this._desktopIconsUsableArea.resetMargins();
            },
        ]);

        this._mapExternalSetting(this._appSwitcherSettings, 'current-workspace-only',
            'isolate-workspaces', value => value || undefined);
    }

    _createDocks() {
        // If there are no monitors (headless configurations, but it can also
        // happen temporary while disconnecting and reconnecting monitors), just
        // do nothing. When a monitor will be connected we we'll be notified and
        // and thus create the docks. This prevents pointing trying to access
        // monitors throughout the code, were we are assuming that at least the
        // primary monitor is present.
        if (Main.layoutManager.monitors.length <= 0)
            return;


        this._preferredMonitorIndex = this.settings.preferredMonitor;
        if (this._preferredMonitorIndex === -2) {
            const monitorManager = Utils.getMonitorManager();
            this._preferredMonitorIndex = monitorManager.get_monitor_for_connector(
                this.settings.preferredMonitorByConnector);
        } else if (this._preferredMonitorIndex >= 0) {
            // Primary monitor used to be always 0 in Gdk, but the shell has a different
            // concept (where the order depends on mutter order).
            // So even if now the extension settings may use the same logic of the shell
            // we prefer not to break the previously configured systems, and so we still
            // assume that the gsettings monitor numbering follows the old strategy.
            // This ensure the indexing in the settings and in the shell are matched,
            // i.e. that we start counting from the primaryMonitorIndex
            this._preferredMonitorIndex =
                (Main.layoutManager.primaryIndex + this._preferredMonitorIndex) %
                Main.layoutManager.monitors.length;
        }

        // In case of multi-monitor, we consider the dock on the primary monitor
        // to be the preferred (main) one regardless of the settings the dock
        // goes on the primary monitor also if the settings are inconsistent
        // (e.g. desired monitor not connected).
        if (this.settings.multiMonitor ||
            this._preferredMonitorIndex < 0 ||
            this._preferredMonitorIndex > Main.layoutManager.monitors.length - 1)
            this._preferredMonitorIndex = Main.layoutManager.primaryIndex;


        // First we create the main Dock, to get the extra features to bind to this one
        let dock = new DockedDash({
            monitorIndex: this._preferredMonitorIndex,
            isMain: true,
        });
        this._allDocks.push(dock);

        // connect app icon into the view selector
        dock.dash.showAppsButton.connect('notify::checked',
            this._onShowAppsButtonToggled.bind(this));

        // Make the necessary changes to Main.overview.dash
        this._prepareMainDash();

        // Adjust corners if necessary
        this._adjustPanelCorners();

        if (this.settings.multiMonitor) {
            const nMon = Main.layoutManager.monitors.length;
            for (let iMon = 0; iMon < nMon; iMon++) {
                if (iMon === this._preferredMonitorIndex)
                    continue;
                dock = new DockedDash({monitorIndex: iMon});
                this._allDocks.push(dock);
                // connect app icon into the view selector
                dock.dash.showAppsButton.connect('notify::checked',
                    this._onShowAppsButtonToggled.bind(this));
            }
        }

        // Load optional features. We load *after* the docks are created, since
        // we need to connect the signals to all dock instances.
        this._workspaceIsolation = new WorkspaceIsolation();
        this._keyboardShortcuts = new KeyboardShortcuts();

        this.emit('docks-ready');
    }

    _prepareStartupAnimation() {
        DockManager.allDocks.forEach(dock => {
            const {dash} = dock;

            dock.opacity = 255;
            dash.set({
                opacity: 0,
                translation_x: 0,
                translation_y: 0,
            });
        });
    }

    _runStartupAnimation() {
        DockManager.allDocks.forEach(dock => {
            const {dash} = dock;

            switch (dock.position) {
            case St.Side.LEFT:
                dash.translation_x = -dash.width;
                break;
            case St.Side.RIGHT:
                dash.translation_x = dash.width;
                break;
            case St.Side.BOTTOM:
                dash.translation_y = dash.height;
                break;
            case St.Side.TOP:
                dash.translation_y = -dash.height;
                break;
            }

            dash.ease({
                opacity: 255,
                translation_x: 0,
                translation_y: 0,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
    }

    _prepareMainDash() {
        // Ensure Main.overview.dash is set to our dash in dummy mode
        // while just use the default getter otherwise.
        // The getter must be dynamic and not set only when we've a dummy
        // overview because the mode can change dynamically.
        this._propertyInjections.removeWithLabel(Labels.MAIN_DASH);
        const defaultDashGetter = Object.getOwnPropertyDescriptor(
            Main.overview.constructor.prototype, 'dash').get;
        this._propertyInjections.addWithLabel(Labels.MAIN_DASH, Main.overview, 'dash', {
            get: () => Main.overview.isDummy
                ? this.mainDock.dash : defaultDashGetter.call(Main.overview),
        });

        if (Main.overview.isDummy)
            return;

        // Hide usual Dash
        this._oldDash.hide();

        // Also set dash width to 1, so it's almost not taken into account by code
        // calculating the reserved space in the overview. The reason to keep it at 1 is
        // to allow its visibility change to trigger an allocation of the appGrid which
        // in turn is triggering the appsIcon spring animation, required when no other
        // actors has this effect, i.e in horizontal mode and without the workspaceThumbnails
        // 1 static workspace only)
        this._oldDash.set_height(1);

        this._signalsHandler.addWithLabel(Labels.OLD_DASH_CHANGES, [
            this._oldDash,
            'notify::visible',
            () => this._oldDash.hide(),
        ], [
            this._oldDash,
            'notify::height',
            () => this._oldDash.set_height(1),
        ]);

        // Pretend I'm the dash: meant to make app grid swarm animation come from
        // the right position of the appShowButton.
        this.overviewControls.dash = this.mainDock.dash;
        this.searchController._showAppsButton = this.mainDock.dash.showAppsButton;

        // We also need to ignore max-size changes
        this._methodInjections.addWithLabel(Labels.MAIN_DASH, this._oldDash,
            'setMaxSize', () => {});
        this._methodInjections.addWithLabel(Labels.MAIN_DASH, this._oldDash,
            'allocate', () => {});
        // And to return the preferred height depending on the state
        this._methodInjections.addWithLabel(Labels.MAIN_DASH, this._oldDash,
            'get_preferred_height', (_originalMethod, ...args) => {
                if (this.mainDock.isHorizontal && !this.settings.dockFixed)
                    return this.mainDock.get_preferred_height(...args);
                return [0, 0];
            });

        // FIXME: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2890
        // const { ControlsManagerLayout } = OverviewControls;
        const ControlsManagerLayout = this.overviewControls.layout_manager.constructor;

        const maybeAdjustBoxSize = (state, box, spacing) => {
            // ensure that an undefined value will be converted into a valid one
            spacing = spacing ?? 0;

            if (state === OverviewControls.ControlsState.WINDOW_PICKER) {
                const searchBox = this.overviewControls._searchEntry.get_allocation_box();
                const {shouldShow: wsThumbnails} = this.overviewControls._thumbnailsBox;

                if (!wsThumbnails) {
                    box.y1 += spacing;
                    box.y2 -= spacing;
                }

                box.y2 -= searchBox.get_height() + 2 * spacing;
            }

            return box;
        };

        const maybeAdjustBoxToDock = (state, box, spacing) => {
            maybeAdjustBoxSize(state, box, spacing);

            if (this.mainDock.isHorizontal || this.settings.dockFixed)
                return box;

            const [, preferredWidth] = this.mainDock.get_preferred_width(
                box.get_height());

            if (this.mainDock.position === St.Side.LEFT)
                box.x1 += preferredWidth;
            else if (this.mainDock.position === St.Side.RIGHT)
                box.x2 -= preferredWidth;

            return box;
        };

        this._vfuncInjections.addWithLabel(Labels.MAIN_DASH, ControlsManagerLayout.prototype,
            'allocate', function (container) {
                /* eslint-disable no-invalid-this */
                const oldPostAllocation = this._runPostAllocation;
                this._runPostAllocation = () => {};

                const monitor = Main.layoutManager.findMonitorForActor(container);
                const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
                const startX = workArea.x - monitor.x;
                const startY = workArea.y - monitor.y;
                const workAreaBox = new Clutter.ActorBox();
                workAreaBox.set_origin(startX, startY);
                workAreaBox.set_size(workArea.width, workArea.height);

                // GNOME 46 changes "spacing" to "_spacing".
                const spacing = this.spacing ?? this._spacing;

                maybeAdjustBoxToDock(undefined, workAreaBox, spacing);
                const oldStartY = workAreaBox.y1;

                const propertyInjections = new Utils.PropertyInjectionsHandler();
                propertyInjections.add(Main.layoutManager.panelBox, 'height', {value: startY});

                if (Main.layoutManager.panelBox.y === Main.layoutManager.primaryMonitor.y)
                    workAreaBox.y1 -= oldStartY;

                this.vfunc_allocate(container, workAreaBox);

                propertyInjections.destroy();
                workAreaBox.y1 = oldStartY;

                const adjustActorHorizontalAllocation = actor => {
                    if (!actor.visible || !workAreaBox.x1)
                        return;

                    const contentBox = actor.get_allocation_box();
                    contentBox.set_size(workAreaBox.get_width(), contentBox.get_height());
                    contentBox.set_origin(workAreaBox.x1, contentBox.y1);
                    actor.allocate(contentBox);
                };

                [this._searchEntry, this._workspacesThumbnails, this._searchController].forEach(
                    actor => adjustActorHorizontalAllocation(actor));

                this._runPostAllocation = oldPostAllocation;
                this._runPostAllocation();
                /* eslint-enable no-invalid-this */
            });

        /**
         * This can be removed or bypassed when GNOME/gnome-shell!1892 will be merged
         *
         * @param originalFunction
         * @param state
         * @param workAreaBox
         * @param {...any} args
         */
        function workspaceBoxOriginFixer(originalFunction, state, workAreaBox, ...args) {
            /* eslint-disable no-invalid-this */
            const workspaceBox = originalFunction.call(this, state, workAreaBox, ...args);
            workspaceBox.set_origin(workAreaBox.x1, workspaceBox.y1);
            return workspaceBox;
            /* eslint-enable no-invalid-this */
        }

        this._methodInjections.addWithLabel(Labels.MAIN_DASH, [
            ControlsManagerLayout.prototype,
            '_computeWorkspacesBoxForState',
            function (originalFunction, state, ...args) {
                /* eslint-disable no-invalid-this */
                if (state === OverviewControls.ControlsState.HIDDEN)
                    return originalFunction.call(this, state, ...args);

                const box = workspaceBoxOriginFixer.call(this, originalFunction, state, ...args);
                // GNOME 46 changes "spacing" to "_spacing".
                const spacing = this.spacing ?? this._spacing;
                const dock = DockManager.getDefault().getDockByMonitor(Main.layoutManager.primaryIndex);
                if (!dock)
                    return box;
                else
                    return maybeAdjustBoxSize(state, box, spacing);
                /* eslint-enable no-invalid-this */
            },
        ], [
            WorkspacesView.SecondaryMonitorDisplay.prototype,
            '_getWorkspacesBoxForState',
            function (originalFunction, state, ...args) {
                /* eslint-disable no-invalid-this */
                if (state === OverviewControls.ControlsState.HIDDEN)
                    return originalFunction.call(this, state, ...args);

                const box = workspaceBoxOriginFixer.call(this, originalFunction, state, ...args);
                const dock = DockManager.getDefault().getDockByMonitor(this._monitorIndex);
                if (!dock)
                    return box;
                if (state === OverviewControls.ControlsState.WINDOW_PICKER &&
                    dock.position === St.Side.BOTTOM) {
                    const [, preferredHeight] = dock.get_preferred_height(box.get_width());
                    box.y2 -= preferredHeight;
                }
                return box;
                /* eslint-enable no-invalid-this */
            },
        ], [
            ControlsManagerLayout.prototype,
            '_getAppDisplayBoxForState',
            function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                return workspaceBoxOriginFixer.call(this, originalFunction, ...args);
                /* eslint-enable no-invalid-this */
            },
        ]);

        this._vfuncInjections.addWithLabel(Labels.MAIN_DASH, Workspace.WorkspaceBackground.prototype,
            'allocate', function (box) {
                /* eslint-disable no-invalid-this */
                this.vfunc_allocate(box);

                // This code has been submitted upstream via GNOME/gnome-shell!1892
                // so can be removed when that gets merged (or bypassed on newer shell
                // versions).
                const monitor = Main.layoutManager.monitors[this._monitorIndex];
                const [contentWidth, contentHeight] = this._bin.get_content_box().get_size();
                const [mX1, mX2] = [monitor.x, monitor.x + monitor.width];
                const [mY1, mY2] = [monitor.y, monitor.y + monitor.height];
                const [wX1, wX2] = [this._workarea.x, this._workarea.x + this._workarea.width];
                const [wY1, wY2] = [this._workarea.y, this._workarea.y + this._workarea.height];
                const xScale = contentWidth / this._workarea.width;
                const yScale = contentHeight / this._workarea.height;
                const leftOffset = wX1 - mX1;
                const topOffset = wY1 - mY1;
                const rightOffset = mX2 - wX2;
                const bottomOffset = mY2 - wY2;

                const contentBox = new Clutter.ActorBox();
                contentBox.set_origin(-leftOffset * xScale, -topOffset * yScale);
                contentBox.set_size(
                    contentWidth + (leftOffset + rightOffset) * xScale,
                    contentHeight + (topOffset + bottomOffset) * yScale);

                this._backgroundGroup.allocate(contentBox);
                /* eslint-enable no-invalid-this */
            });

        // Reduce the space that the workspaces can use in secondary monitors
        this._methodInjections.addWithLabel(Labels.MAIN_DASH, WorkspacesView.WorkspacesView.prototype,
            '_getFirstFitAllWorkspaceBox', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                const box = originalFunction.call(this, ...args);
                if (DockManager.settings.dockFixed ||
                    this._monitorIndex === Main.layoutManager.primaryIndex)
                    return box;

                const dock = DockManager.getDefault().getDockByMonitor(this._monitorIndex);
                if (!dock)
                    return box;

                if (dock.isHorizontal) {
                    const [, preferredHeight] = dock.get_preferred_height(box.get_width());
                    box.y2 -= preferredHeight;
                    if (dock.position === St.Side.TOP)
                        box.set_origin(box.x1, box.y1 + preferredHeight);
                } else {
                    const [, preferredWidth] = dock.get_preferred_width(box.get_height());
                    box.x2 -= preferredWidth / 2;
                    if (dock.position === St.Side.LEFT)
                        box.set_origin(box.x1 + preferredWidth, box.y1);
                }
                return box;
                /* eslint-enable no-invalid-this */
            });

        if (AppDisplay.BaseAppView?.prototype?._pageForCoords) {
            // Ensure we handle Dnd events happening on the dock when we're
            // dragging from AppDisplay.
            // Remove when merged
            // https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2002
            this._methodInjections.addWithLabel(Labels.MAIN_DASH,
                AppDisplay.BaseAppView.prototype,
                '_pageForCoords', function (originalFunction, ...args) {
                    /* eslint-disable no-invalid-this */
                    if (!this._scrollView.has_pointer)
                        return AppDisplay.SidePages.NONE;
                    return originalFunction.call(this, ...args);
                    /* eslint-enable no-invalid-this */
                });
        }

        if (Main.layoutManager._startingUp) {
            this._prepareStartupAnimation();

            const hadOverview = Main.sessionMode.hasOverview;

            // Convince LayoutManager to use the legacy startup animation:
            if (this._settings.disableOverviewOnStartup)
                Main.sessionMode.hasOverview = false;

            this._signalsHandler.addWithLabel(Labels.STARTUP_ANIMATION,
                Main.layoutManager, 'startup-complete', () => {
                    this._signalsHandler.removeWithLabel(Labels.STARTUP_ANIMATION);
                    Main.sessionMode.hasOverview = hadOverview;
                    this._runStartupAnimation();
                });
        }
    }

    _deleteDocks() {
        if (!this._allDocks.length)
            return;

        // Remove extra features
        this._workspaceIsolation.destroy();
        this._keyboardShortcuts.destroy();
        this._desktopIconsUsableArea.resetMargins();

        // Delete all docks
        this._allDocks.forEach(d => d.destroy());
        this._allDocks = [];

        this.emit('docks-destroyed');
    }

    _restoreDash() {
        if (!this._oldDash)
            return;

        this._signalsHandler.removeWithLabel(Labels.OLD_DASH_CHANGES);
        [this._methodInjections, this._vfuncInjections, this._propertyInjections].forEach(
            injections => injections.removeWithLabel(Labels.MAIN_DASH));

        this.overviewControls.layout_manager._dash = this._oldDash;
        this.overviewControls.dash = this._oldDash;
        this.searchController._showAppsButton = this._oldDash.showAppsButton;
        Main.overview.dash.show();
        Main.overview.dash.set_height(-1); // reset default dash size
        // This force the recalculation of the icon size
        Main.overview.dash._maxHeight = -1;
    }

    get overviewControls() {
        return Main.overview._overview.controls;
    }

    get searchController() {
        return this.overviewControls._searchController;
    }

    _onShowAppsButtonToggled(button) {
        const {checked} = button;
        const {overviewControls} = this;

        if (!Main.overview.visible) {
            this.mainDock.dash.showAppsButton._fromDesktop = true;
            Main.overview.show(OverviewControls.ControlsState.APP_GRID);
        } else if (!checked && this.mainDock.dash.showAppsButton._fromDesktop) {
            Main.overview.hide();
            this.mainDock.dash.showAppsButton._fromDesktop = false;
        } else {
            // TODO: I'm not sure how reliable this is, we might need to move the
            // _onShowAppsButtonToggled logic into the extension.
            if (!checked)
                this.mainDock.dash.showAppsButton._fromDesktop = false;


            // Instead of "syncing" the stock button, let's call its callback directly.
            overviewControls._onShowAppsButtonToggled();
        }

        // Because we "disconnected" from the search controller, we have to manage its state.
        this.searchController._setSearchActive(false);
    }

    _overrideAppMenus() {
        this._methodInjections.add(AppMenu.AppMenu.prototype,
            '_updateFavoriteItem', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                originalFunction.call(this, ...args);
                if (!this._toggleFavoriteItem.visible)
                    return;

                const {id} = this._app;
                this._toggleFavoriteItem.label.text = this._appFavorites.isFavorite(id)
                    ? _('Unpin') : _('Pin to Dock');
                /* eslint-enable no-invalid-this */
            });
    }

    destroy() {
        this.emit('destroy');
        if (this._toggleLater) {
            Utils.laterRemove(this._toggleLater);
            delete this._toggleLater;
        }
        this._restoreDash();
        this._deleteDocks();
        this._revertPanelCorners();
        if (this._oldSelectorMargin)
            this.searchController.margin_bottom = this._oldSelectorMargin;
        if (this._fm1Client) {
            this._fm1Client.destroy();
            this._fm1Client = null;
        }
        this._notificationsMonitor.destroy();
        this._appSpread.destroy();
        this._trash?.destroy();
        this._trash = null;
        Locations.unWrapFileManagerApp();
        this._removables?.destroy();
        this._removables = null;
        this._iconTheme = null;
        this._remoteModel?.destroy();
        this._appIconsDecorator?.destroy();
        this._settings = null;
        this._appSwitcherSettings = null;
        this._oldDash = null;

        this._desktopIconsUsableArea?.destroy();
        this._desktopIconsUsableArea = null;
        this._extension = null;
        DockManager._singleton = null;
    }

    /**
     * Adjust Panel corners, remove this when 41 won't be supported anymore
     */
    _adjustPanelCorners() {
        if (!this._hasPanelCorners())
            return;

        const position = Utils.getPosition();
        const isHorizontal = (position === St.Side.TOP) || (position === St.Side.BOTTOM);
        const dockOnPrimary  = this._settings.multiMonitor ||
                             this._preferredMonitorIndex === Main.layoutManager.primaryIndex;

        if (!isHorizontal && dockOnPrimary && this.settings.dockExtended && this.settings.dockFixed) {
            Main.panel._rightCorner.hide();
            Main.panel._leftCorner.hide();
        } else {
            this._revertPanelCorners();
        }
    }

    _revertPanelCorners() {
        if (!this._hasPanelCorners())
            return;

        Main.panel._leftCorner.show();
        Main.panel._rightCorner.show();
    }

    _hasPanelCorners() {
        return !!Main.panel?._rightCorner && !!Main.panel?._leftCorner;
    }
}
Signals.addSignalMethods(DockManager.prototype);

// This class drives long-running icon animations, to keep them running in sync
// with each other, and to save CPU by pausing them when the dock is hidden.
export class IconAnimator {
    constructor(actor) {
        this._count = 0;
        this._started = false;
        this._animations = {
            wiggle: [],
        };
        this._timeline = new Clutter.Timeline({
            duration: AnimationUtils.adjustAnimationTime(ICON_ANIMATOR_DURATION) || 1,
            repeat_count: -1,
            actor,
        });

        this._updateSettings();
        this._settingsChangedId = St.Settings.get().connect('notify',
            () => this._updateSettings());

        this._timeline.connect('new-frame', () => {
            const progress = this._timeline.get_progress();
            const wiggleRotation = progress < 1 / 6 ? 15 * Math.sin(progress * 24 * Math.PI) : 0;
            const wigglers = this._animations.wiggle;
            for (let i = 0, iMax = wigglers.length; i < iMax; i++)
                wigglers[i].target.rotation_angle_z = wiggleRotation;
        });
    }

    _updateSettings() {
        this._timeline.set_duration(
            AnimationUtils.adjustAnimationTime(ICON_ANIMATOR_DURATION) || 1);
    }

    destroy() {
        St.Settings.get().disconnect(this._settingsChangedId);
        this._timeline.stop();
        this._timeline = null;
        for (const pairs of Object.values(this._animations)) {
            for (let i = 0, iMax = pairs.length; i < iMax; i++) {
                const pair = pairs[i];
                pair.target.disconnect(pair.targetDestroyId);
            }
        }
        this._animations = null;
    }

    pause() {
        if (this._started && this._count > 0)
            this._timeline.stop();

        this._started = false;
    }

    start() {
        if (!this._started && this._count > 0)
            this._timeline.start();

        this._started = true;
    }

    addAnimation(target, name) {
        const targetDestroyId = target.connect('destroy',
            () => this.removeAnimation(target, name));
        this._animations[name].push({target, targetDestroyId});
        if (this._started && this._count === 0)
            this._timeline.start();

        this._count++;
    }

    removeAnimation(target, name) {
        const pairs = this._animations[name];
        for (let i = 0, iMax = pairs.length; i < iMax; i++) {
            const pair = pairs[i];
            if (pair.target === target) {
                target.disconnect(pair.targetDestroyId);
                pairs.splice(i, 1);
                this._count--;
                if (this._started && this._count === 0)
                    this._timeline.stop();

                return;
            }
        }
    }
}
