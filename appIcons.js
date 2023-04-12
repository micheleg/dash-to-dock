// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/* exported DockShowAppsIcon, makeAppIcon, itemShowLabel, getInterestingWindows */

const {
    Clutter,
    Gio,
    GLib,
    GObject,
    Meta,
    Shell,
    St,
} = imports.gi;

// Use __ () and N__() for the extension gettext domain, and reuse
// the shell domain with the default _() and N_()
const Gettext = imports.gettext.domain('dashtodock');
const __ = Gettext.gettext;
const N__ = e => e;

const Config = imports.misc.config;

const {
    appDisplay: AppDisplay,
    appFavorites: AppFavorites,
    boxpointer: BoxPointer,
    dash: Dash,
    main: Main,
    popupMenu: PopupMenu,
} = imports.ui;

const {
    parentalControlsManager: ParentalControlsManager,
} = imports.misc;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const {
    appIconIndicators: AppIconIndicators,
    dbusmenuUtils: DbusmenuUtils,
    docking: Docking,
    locations: Locations,
    theming: Theming,
    utils: Utils,
    windowPreview: WindowPreview,
} = Me.imports;

const tracker = Shell.WindowTracker.get_default();

const Labels = Object.freeze({
    ISOLATE_MONITORS: Symbol('isolate-monitors'),
    ISOLATE_WORKSPACES: Symbol('isolate-workspaces'),
    URGENT_WINDOWS: Symbol('urgent-windows'),
});

const clickAction = Object.freeze({
    SKIP: 0,
    MINIMIZE: 1,
    LAUNCH: 2,
    CYCLE_WINDOWS: 3,
    MINIMIZE_OR_OVERVIEW: 4,
    PREVIEWS: 5,
    MINIMIZE_OR_PREVIEWS: 6,
    FOCUS_OR_PREVIEWS: 7,
    FOCUS_OR_APP_SPREAD: 8,
    FOCUS_MINIMIZE_OR_PREVIEWS: 9,
    FOCUS_MINIMIZE_OR_APP_SPREAD: 10,
    QUIT: 11,
});

const scrollAction = Object.freeze({
    DO_NOTHING: 0,
    CYCLE_WINDOWS: 1,
    SWITCH_WORKSPACE: 2,
});

let recentlyClickedAppLoopId = 0;
let recentlyClickedApp = null;
let recentlyClickedAppWindows = null;
let recentlyClickedAppIndex = 0;
let recentlyClickedAppMonitor = -1;

/**
 * Extend AppIcon
 *
 * - Apply a css class based on the number of windows of each application (#N);
 * - Customized indicators for running applications in place of the default "dot" style which is hidden (#N);
 *   a class of the form "running#N" is applied to the AppWellIcon actor.
 *   like the original .running one.
 * - Add a .focused style to the focused app
 * - Customize click actions.
 * - Update minimization animation target
 * - Update menu if open on windows change
 */
var DockAbstractAppIcon = GObject.registerClass({
    GTypeFlags: GObject.TypeFlags.ABSTRACT,
    Properties: {
        'focused': GObject.ParamSpec.boolean(
            'focused', 'focused', 'focused',
            GObject.ParamFlags.READWRITE,
            false),
        'running': GObject.ParamSpec.boolean(
            'running', 'running', 'running',
            GObject.ParamFlags.READWRITE,
            false),
        'urgent': GObject.ParamSpec.boolean(
            'urgent', 'urgent', 'urgent',
            GObject.ParamFlags.READWRITE,
            false),
        'windows-count': GObject.ParamSpec.uint(
            'windows-count', 'windows-count', 'windows-count',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXUINT32, 0),
    },
}, class DockAbstractAppIcon extends Dash.DashIcon {
    // settings are required inside.
    _init(app, monitorIndex, iconAnimator) {
        super._init(app);

        // a prefix is required to avoid conflicting with the parent class variable
        this.monitorIndex = monitorIndex;
        this._signalsHandler = new Utils.GlobalSignalsHandler(this);
        this.iconAnimator = iconAnimator;
        this._indicator = new AppIconIndicators.AppIconIndicator(this);

        // Monitor windows-changes instead of app state.
        // Keep using the same Id and function callback (that is extended)
        if (this._stateChangedId > 0) {
            this.app.disconnect(this._stateChangedId);
            this._stateChangedId = 0;
        }

        this._signalsHandler.add(this.app, 'windows-changed', () => this._updateWindows());
        this._signalsHandler.add(this.app, 'notify::state', () => this._updateRunningState());
        this._signalsHandler.add(global.display, 'window-demands-attention', (_dpy, window) =>
            this._onWindowDemandsAttention(window));
        this._signalsHandler.add(global.display, 'window-marked-urgent', (_dpy, window) =>
            this._onWindowDemandsAttention(window));

        // In Wayland sessions, this signal is needed to track the state of windows dragged
        // from one monitor to another. As this is triggered quite often (whenever a new winow
        // of any application opened or moved to a different desktop),
        // we restrict this signal to  the case when 'isolate-monitors' is true,
        // and if there are at least 2 monitors.
        if (Docking.DockManager.settings.isolateMonitors &&
            Main.layoutManager.monitors.length > 1) {
            this._signalsHandler.addWithLabel(Labels.ISOLATE_MONITORS,
                global.display,
                'window-entered-monitor',
                this._onWindowEntered.bind(this));
        }

        this.connect('notify::running', () => {
            if (this.running)
                this.add_style_class_name('running');
            else
                this.remove_style_class_name('running');
        });

        this.connect('notify::focused', () => {
            if (this.focused)
                this.add_style_class_name('focused');
            else
                this.remove_style_class_name('focused');
        });

        const { notificationsMonitor } = Docking.DockManager.getDefault();

        this.connect('notify::urgent', () => {
            const icon = this.icon._iconBin;
            this._signalsHandler.removeWithLabel(Labels.URGENT_WINDOWS);
            if (this.urgent) {
                if (Docking.DockManager.settings.danceUrgentApplications &&
                    notificationsMonitor.enabled) {
                    icon.set_pivot_point(0.5, 0.5);
                    this.iconAnimator.addAnimation(icon, 'wiggle');
                }
                if (this.running && !this._urgentWindows.size) {
                    const urgentWindows = this.getInterestingWindows();
                    urgentWindows.forEach(w => (w._manualUrgency = true));
                    this._updateUrgentWindows(urgentWindows);
                }
            } else {
                this.iconAnimator.removeAnimation(icon, 'wiggle');
                icon.rotation_angle_z = 0;
                this._urgentWindows.forEach(w => delete w._manualUrgency);
                this._updateUrgentWindows();
            }
        });

        this._urgentWindows = new Set();
        this._progressOverlayArea = null;
        this._progress = 0;

        [
            'apply-custom-theme',
            'running-indicator-style',
            'show-icons-emblems',
            'show-icons-notifications-counter',
            'application-counter-overrides-notifications',
        ].forEach(key => {
            this._signalsHandler.add(
                Docking.DockManager.settings,
                `changed::${key}`, () => {
                    this._indicator.destroy();
                    this._indicator = new AppIconIndicators.AppIconIndicator(this);
                }
            );
        });

        this._signalsHandler.add(notificationsMonitor, 'state-changed', () => {
            this._indicator.destroy();
            this._indicator = new AppIconIndicators.AppIconIndicator(this);
        });

        this._updateState();
        this._numberOverlay();

        this._previewMenuManager = null;
        this._previewMenu = null;
    }

    _onDestroy() {
        super._onDestroy();

        // This is necessary due to an upstream bug
        // https://bugzilla.gnome.org/show_bug.cgi?id=757556
        // It can be safely removed once it get solved upstrea.
        if (this._menu)
            this._menu.close(false);
    }

    ownsWindow(window) {
        return this.app === tracker.get_window_app(window);
    }

    _onWindowEntered(metaScreen, monitorIndex, metaWin) {
        if (this.ownsWindow(metaWin))
            this._updateWindows();
    }

    vfunc_scroll_event(scrollEvent) {
        const { settings } = Docking.DockManager;
        const isEnabled = settings.scrollAction === scrollAction.CYCLE_WINDOWS;
        if (!isEnabled)
            return Clutter.EVENT_PROPAGATE;

        // We only activate windows of running applications, i.e. we never open new windows
        // We check if the app is running, and that the # of windows is > 0 in
        // case we use workspace isolation,
        if (!this.running)
            return Clutter.EVENT_PROPAGATE;

        if (this._optionalScrollCycleWindowsDeadTimeId) {
            return Clutter.EVENT_PROPAGATE;
        } else {
            this._optionalScrollCycleWindowsDeadTimeId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 250, () => {
                    this._optionalScrollCycleWindowsDeadTimeId = 0;
                });
        }

        let direction = null;

        switch (scrollEvent.direction) {
        case Clutter.ScrollDirection.UP:
            direction = Meta.MotionDirection.UP;
            break;
        case Clutter.ScrollDirection.DOWN:
            direction = Meta.MotionDirection.DOWN;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [, dy] = Clutter.get_current_event().get_scroll_delta();
            if (dy < 0)
                direction = Meta.MotionDirection.UP;
            else if (dy > 0)
                direction = Meta.MotionDirection.DOWN;
        }
            break;
        }

        if (!Main.overview.visible) {
            const reversed = direction === Meta.MotionDirection.UP;
            if (this.focused && !this._urgentWindows.size) {
                this._cycleThroughWindows(reversed);
            } else {
                // Activate the first window
                const windows = this.getInterestingWindows();
                if (windows.length > 0) {
                    const [w] = windows;
                    Main.activateWindow(w);
                }
            }
        } else {
            this.app.activate();
        }
        return Clutter.EVENT_STOP;
    }

    _updateWindows() {
        if (this._menu && this._menu.isOpen)
            this._menu.update();

        this._updateState();
        this.updateIconGeometry();
    }

    _updateState() {
        this._urgentWindows.clear();
        const interestingWindows = this.getInterestingWindows();
        this.windowsCount = interestingWindows.length;
        this._updateRunningState();
        this._updateFocusState();
        this._updateUrgentWindows(interestingWindows);

        if (Docking.DockManager.settings.isolateWorkspaces) {
            this._signalsHandler.removeWithLabel(Labels.ISOLATE_WORKSPACES);
            interestingWindows.forEach(window =>
                this._signalsHandler.addWithLabel(Labels.ISOLATE_WORKSPACES,
                    window, 'workspace-changed', () => this._updateWindows()));
        }
    }

    _updateRunningState() {
        this.running = (this.app.state === Shell.AppState.RUNNING) && this.windowsCount;
    }

    _updateFocusState() {
        this.focused = tracker.focus_app === this.app && this.running;
    }

    _updateUrgentWindows(interestingWindows) {
        this._signalsHandler.removeWithLabel(Labels.URGENT_WINDOWS);
        this._urgentWindows.clear();
        if (interestingWindows === undefined)
            interestingWindows = this.getInterestingWindows();
        interestingWindows.filter(isWindowUrgent).forEach(win => this._addUrgentWindow(win));
        this.urgent = !!this._urgentWindows.size;
    }

    _onWindowDemandsAttention(window) {
        if (this.ownsWindow(window) && isWindowUrgent(window))
            this._addUrgentWindow(window);
    }

    _addUrgentWindow(window) {
        if (this._urgentWindows.has(window))
            return;

        if (window._manualUrgency && window.has_focus()) {
            delete window._manualUrgency;
            return;
        }

        this._urgentWindows.add(window);
        this.urgent = true;

        const onDemandsAttentionChanged = () => {
            if (!isWindowUrgent(window))
                this._updateUrgentWindows();
        };

        if (window.demandsAttention) {
            this._signalsHandler.addWithLabel(Labels.URGENT_WINDOWS, window,
                'notify::demands-attention', () => onDemandsAttentionChanged());
        }
        if (window.urgent) {
            this._signalsHandler.addWithLabel(Labels.URGENT_WINDOWS, window,
                'notify::urgent', () => onDemandsAttentionChanged());
        }
        if (window._manualUrgency) {
            this._signalsHandler.addWithLabel(Labels.URGENT_WINDOWS, window,
                'focus', () => {
                    delete window._manualUrgency;
                    onDemandsAttentionChanged();
                });
        }
    }

    /**
     * Update taraget for minimization animation
     */
    updateIconGeometry() {
        // If (for unknown reason) the actor is not on the stage the reported size
        // and position are random values, which might exceeds the integer range
        // resulting in an error when assigned to the a rect. This is a more like
        // a workaround to prevent flooding the system with errors.
        if (!this.get_stage())
            return;

        const rect = new Meta.Rectangle();

        [rect.x, rect.y] = this.get_transformed_position();
        [rect.width, rect.height] = this.get_transformed_size();

        let windows = this.getWindows();
        if (Docking.DockManager.settings.multiMonitor) {
            const { monitorIndex } = this;
            windows = windows.filter(w => w.get_monitor() === monitorIndex);
        }
        windows.forEach(w => w.set_icon_geometry(rect));
    }

    _updateRunningStyle() {
        // The logic originally in this function has been moved to
        // AppIconIndicatorBase._updateDefaultDot(). However it cannot be removed as
        // it called by the parent constructor.
    }

    popupMenu() {
        this._removeMenuTimeout();
        this.fake_release();
        this._draggable.fakeRelease();

        if (!this._menu) {
            this._menu = new DockAppIconMenu(this);
            this._menu.connect('activate-window', (menu, window) => {
                if (window) {
                    Main.activateWindow(window);
                } else {
                    Main.overview.hide();
                    Main.panel.closeCalendar();
                }
            });
            this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp) {
                    this._onMenuPoppedDown();
                } else {
                    // Setting the max-height is s useful if part of the menu is
                    // scrollable so the minimum height is smaller than the natural height.
                    const monitorIndex = Main.layoutManager.findIndexForActor(this);
                    const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
                    const position = Utils.getPosition();
                    const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
                    const isHorizontal = position === St.Side.TOP || position === St.Side.BOTTOM;
                    // If horizontal also remove the height of the dash
                    const { dockFixed: fixedDock } = Docking.DockManager.settings;
                    const additionalMargin = isHorizontal && !fixedDock ? Main.overview.dash.height : 0;
                    const verticalMargins = this._menu.actor.margin_top + this._menu.actor.margin_bottom;
                    const maxMenuHeight = workArea.height - additionalMargin - verticalMargins;
                    // Also set a max width to the menu, so long labels (long windows title) get truncated
                    this._menu.actor.style = 'max-width: 400px; ' +
                        `max-height: ${Math.round(maxMenuHeight / scaleFactor)}px;`;
                }
            });
            const id = Main.overview.connect('hiding', () => {
                this._menu.close();
            });
            this._menu.actor.connect('destroy', () => {
                Main.overview.disconnect(id);
            });

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    }

    activate(button) {
        const event = Clutter.get_current_event();
        let modifiers = event ? event.get_state() : 0;

        // Only consider SHIFT and CONTROL as modifiers (exclude SUPER, CAPS-LOCK, etc.)
        modifiers &= Clutter.ModifierType.SHIFT_MASK | Clutter.ModifierType.CONTROL_MASK;

        // We don't change the CTRL-click behaviour: in such case we just chain
        // up the parent method and return.
        if (modifiers & Clutter.ModifierType.CONTROL_MASK) {
            // Keep default behaviour: launch new window
            // By calling the parent method I make it compatible
            // with other extensions tweaking ctrl + click
            super.activate(button);
            return;
        }

        // We check what type of click we have and if the modifier SHIFT is
        // being used. We then define what buttonAction should be for this
        // event.
        let buttonAction = 0;
        const { settings } = Docking.DockManager;
        if (button && button === 2) {
            if (modifiers & Clutter.ModifierType.SHIFT_MASK)
                buttonAction = settings.shiftMiddleClickAction;
            else
                buttonAction = settings.middleClickAction;
        } else if (button && button === 1) {
            if (modifiers & Clutter.ModifierType.SHIFT_MASK)
                buttonAction = settings.shiftClickAction;
            else
                buttonAction = settings.clickAction;
        }

        switch (buttonAction) {
        case clickAction.FOCUS_OR_APP_SPREAD:
            if (!Docking.DockManager.getDefault().appSpread.supported)
                buttonAction = clickAction.FOCUS_OR_PREVIEWS;
            break;

        case clickAction.FOCUS_MINIMIZE_OR_APP_SPREAD:
            if (!Docking.DockManager.getDefault().appSpread.supported)
                buttonAction = clickAction.FOCUS_MINIMIZE_OR_PREVIEWS;
            break;
        }

        // We check if the app is running, and that the # of windows is > 0 in
        // case we use workspace isolation.
        const windows = this.getInterestingWindows();

        // Some action modes (e.g. MINIMIZE_OR_OVERVIEW) require overview to remain open
        // This variable keeps track of this
        let shouldHideOverview = true;

        // We customize the action only when the application is already running
        if (this.running) {
            const hasUrgentWindows = !!this._urgentWindows.size;
            const singleOrUrgentWindows = windows.length === 1 || hasUrgentWindows;
            switch (buttonAction) {
            case clickAction.MINIMIZE:
                // In overview just activate the app, unless the acion is explicitely
                // requested with a keyboard modifier
                if (!Main.overview.visible || modifiers) {
                    // If we have button=2 or a modifier, allow minimization even if
                    // the app is not focused
                    if (this.focused && !hasUrgentWindows || button === 2 ||
                        modifiers & Clutter.ModifierType.SHIFT_MASK) {
                        // minimize all windows on double click and always in
                        // the case of primary click without additional modifiers
                        let clickCount = 0;
                        if (Clutter.EventType.CLUTTER_BUTTON_PRESS)
                            clickCount = event.get_click_count();
                        const allWindows = (button === 1 && !modifiers) || clickCount > 1;
                        this._minimizeWindow(allWindows);
                    } else {
                        this._activateAllWindows();
                    }
                } else {
                    const [w] = windows;
                    Main.activateWindow(w);
                }
                break;

            case clickAction.MINIMIZE_OR_OVERVIEW:
                // When a single window is present, toggle minimization
                // If only one windows is present toggle minimization, but
                // only when triggered with the simple click action
                // (no modifiers, no middle click).
                if (singleOrUrgentWindows && !modifiers && button === 1) {
                    const [w] = windows;
                    if (this.focused) {
                        if (buttonAction !== clickAction.FOCUS_OR_APP_SPREAD) {
                            // Window is raised, minimize it
                            this._minimizeWindow(w);
                        }
                    } else {
                        // Window is minimized, raise it
                        Main.activateWindow(w);
                    }
                    // Launch overview when multiple windows are present
                    // TODO: only show current app windows when gnome shell API will allow it
                } else {
                    shouldHideOverview = false;
                    Main.overview.toggle();
                }
                break;

            case clickAction.CYCLE_WINDOWS:
                if (!Main.overview.visible) {
                    if (this.focused && !hasUrgentWindows) {
                        this._cycleThroughWindows();
                    } else {
                        // Activate the first window
                        const [w] = windows;
                        Main.activateWindow(w);
                    }
                } else {
                    this.app.activate();
                }
                break;

            case clickAction.FOCUS_OR_PREVIEWS:
                if (this.focused && !hasUrgentWindows &&
                    (windows.length > 1 || modifiers || button !== 1)) {
                    this._windowPreviews();
                } else {
                    // Activate the first window
                    const [w] = windows;
                    Main.activateWindow(w);
                }
                break;

            case clickAction.FOCUS_MINIMIZE_OR_PREVIEWS:
                if (this.focused && !hasUrgentWindows) {
                    if (windows.length > 1 || modifiers || button !== 1)
                        this._windowPreviews();
                    else if (!Main.overview.visible)
                        this._minimizeWindow();
                } else {
                    // Activate the first window
                    const [w] = windows;
                    Main.activateWindow(w);
                }
                break;

            case clickAction.LAUNCH:
                this.launchNewWindow();
                break;

            case clickAction.PREVIEWS:
                if (!Main.overview.visible) {
                    // If only one windows is present just switch to it,
                    // but only when trigggered with the simple click action
                    // (no modifiers, no middle click).
                    if (singleOrUrgentWindows && !modifiers && button === 1) {
                        const [w] = windows;
                        Main.activateWindow(w);
                    } else {
                        this._windowPreviews();
                    }
                } else {
                    this.app.activate();
                }
                break;

            case clickAction.MINIMIZE_OR_PREVIEWS:
                // When a single window is present, toggle minimization
                // If only one windows is present toggle minimization, but only
                // when trigggered with the imple click action (no modifiers,
                // no middle click).
                if (!Main.overview.visible) {
                    if (singleOrUrgentWindows && !modifiers && button === 1) {
                        const [w] = windows;
                        if (this.focused) {
                            // Window is raised, minimize it
                            this._minimizeWindow(w);
                        } else {
                            // Window is minimized, raise it
                            Main.activateWindow(w);
                        }
                    } else {
                        // Launch previews when multiple windows are present
                        this._windowPreviews();
                    }
                } else {
                    this.app.activate();
                }
                break;

            case clickAction.FOCUS_OR_APP_SPREAD:
                if (this.focused && !singleOrUrgentWindows && !modifiers && button === 1) {
                    shouldHideOverview = false;
                    Docking.DockManager.getDefault().appSpread.toggle(this.app);
                } else {
                    // Activate the first window
                    Main.activateWindow(windows[0]);
                }
                break;

            case clickAction.FOCUS_MINIMIZE_OR_APP_SPREAD:
                if (this.focused && !singleOrUrgentWindows && !modifiers && button === 1) {
                    shouldHideOverview = false;
                    Docking.DockManager.getDefault().appSpread.toggle(this.app);
                } else if (!this.focused) {
                    // Activate the first window
                    Main.activateWindow(windows[0]);
                } else {
                    this._minimizeWindow();
                }
                break;

            case clickAction.QUIT:
                this.closeAllWindows();
                break;

            case clickAction.SKIP:
                Main.activateWindow(windows[0]);
                break;
            }
        } else {
            this.launchNewWindow();
        }

        // Hide overview except when action mode requires it
        if (shouldHideOverview)
            Main.overview.hide();
    }

    shouldShowTooltip() {
        return this.hover && (!this._menu || !this._menu.isOpen) &&
                            (!this._previewMenu || !this._previewMenu.isOpen) &&
                            !Docking.DockManager.settings.hideTooltip;
    }

    _windowPreviews() {
        if (!this._previewMenu) {
            this._previewMenuManager = new PopupMenu.PopupMenuManager(this);

            this._previewMenu = new WindowPreview.WindowPreviewMenu(this);

            this._previewMenuManager.addMenu(this._previewMenu);

            this._previewMenu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            const id = Main.overview.connect('hiding', () => {
                this._previewMenu.close();
            });
            this._previewMenu.actor.connect('destroy', () => {
                Main.overview.disconnect(id);
            });
        }

        this.emit('menu-state-changed', !this._previewMenu.isOpen);

        if (this._previewMenu.isOpen)
            this._previewMenu.close();
        else
            this._previewMenu.popup();

        return false;
    }

    // Try to do the right thing when attempting to launch a new window of an app. In
    // particular, if the application doens't allow to launch a new window, activate
    // the existing window instead.
    launchNewWindow() {
        if (this.app.state === Shell.AppState.RUNNING &&
            this.app.can_open_new_window()) {
            this.animateLaunch();
            this.app.open_new_window(-1);
        } else {
            // Try to manually activate the first window. Otherwise, when the
            // app is activated by switching to a different workspace, a launch
            // spinning icon is shown and disappers only after a timeout.
            const windows = this.getWindows();
            if (windows.length > 0) {
                Main.activateWindow(windows[0]);
            } else {
                this.app.activate();
                this.animateLaunch();
            }
        }
    }

    _numberOverlay() {
        // Add label for a Hot-Key visual aid
        this._numberOverlayLabel = new St.Label();
        this._numberOverlayBin = new St.Bin({
            child: this._numberOverlayLabel,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            x_expand: true, y_expand: true,
        });
        this._numberOverlayLabel.add_style_class_name('number-overlay');
        this._numberOverlayOrder = -1;
        this._numberOverlayBin.hide();

        this._iconContainer.add_child(this._numberOverlayBin);
    }

    updateNumberOverlay() {
        // We apply an overall scale factor that might come from a HiDPI monitor.
        // Clutter dimensions are in physical pixels, but CSS measures are in logical
        // pixels, so make sure to consider the scale.
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // Set the font size to something smaller than the whole icon so it is
        // still visible. The border radius is large to make the shape circular
        const [minWidth_, natWidth] = this._iconContainer.get_preferred_width(-1);
        const fontSize = Math.round(Math.max(12, 0.3 * natWidth) / scaleFactor);
        const size = Math.round(fontSize * 1.2);
        this._numberOverlayLabel.set_style(
            `font-size: ${fontSize}px;` +
           `border-radius: ${this.icon.iconSize}px;` +
           `width: ${size}px; height: ${size}px;`
        );
    }

    setNumberOverlay(number) {
        this._numberOverlayOrder = number;
        this._numberOverlayLabel.set_text(number.toString());
    }

    toggleNumberOverlay(activate) {
        if (activate && this._numberOverlayOrder > -1) {
            this.updateNumberOverlay();
            this._numberOverlayBin.show();
        } else {
            this._numberOverlayBin.hide();
        }
    }

    _minimizeWindow(param) {
        // Param true make all app windows minimize
        const windows = this.getInterestingWindows();
        const currentWorkspace = global.workspace_manager.get_active_workspace();
        for (let i = 0; i < windows.length; i++) {
            const w = windows[i];
            if (w.get_workspace() === currentWorkspace && w.showing_on_its_workspace()) {
                w.minimize();
                // Just minimize one window. By specification it should be the
                // focused window on the current workspace.
                if (!param)
                    break;
            }
        }
    }

    // By default only non minimized windows are activated.
    // This activates all windows in the current workspace.
    _activateAllWindows() {
        // First activate first window so workspace is switched if needed.
        // We don't do this if isolation is on!
        if (!Docking.DockManager.settings.isolateWorkspaces &&
            !Docking.DockManager.settings.isolateMonitors) {
            if (!this.running)
                this.animateLaunch();
            this.app.activate();
        }

        // then activate all other app windows in the current workspace
        const windows = this.getInterestingWindows();
        const activeWorkspace = global.workspace_manager.get_active_workspace_index();

        if (windows.length <= 0)
            return;

        for (let i = windows.length - 1; i >= 0; i--) {
            if (windows[i].get_workspace()?.index() === activeWorkspace)
                Main.activateWindow(windows[i]);
        }
    }

    // This closes all windows of the app.
    closeAllWindows() {
        const windows = this.getInterestingWindows();
        const time = global.get_current_time();
        windows.forEach(w => w.delete(time));
    }

    _cycleThroughWindows(reversed) {
        // Store for a little amount of time last clicked app and its windows
        // since the order changes upon window interaction
        const MEMORY_TIME = 3000;

        const appWindows = this.getInterestingWindows();

        if (appWindows.length < 1)
            return;

        if (recentlyClickedAppLoopId > 0)
            GLib.source_remove(recentlyClickedAppLoopId);
        recentlyClickedAppLoopId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, MEMORY_TIME, this._resetRecentlyClickedApp);

        // If there isn't already a list of windows for the current app,
        // or the stored list is outdated, use the current windows list.
        const monitorIsolation = Docking.DockManager.settings.isolateMonitors;
        if (!recentlyClickedApp ||
            recentlyClickedApp.get_id() !== this.app.get_id() ||
            recentlyClickedAppWindows.length !== appWindows.length ||
            (recentlyClickedAppMonitor !== this.monitorIndex && monitorIsolation)) {
            recentlyClickedApp = this.app;
            recentlyClickedAppWindows = appWindows;
            recentlyClickedAppMonitor = this.monitorIndex;
            recentlyClickedAppIndex = 0;
        }

        if (reversed) {
            recentlyClickedAppIndex--;
            if (recentlyClickedAppIndex < 0)
                recentlyClickedAppIndex = recentlyClickedAppWindows.length - 1;
        } else {
            recentlyClickedAppIndex++;
        }
        const index = recentlyClickedAppIndex % recentlyClickedAppWindows.length;
        const window = recentlyClickedAppWindows[index];

        Main.activateWindow(window);
    }

    _resetRecentlyClickedApp() {
        if (recentlyClickedAppLoopId > 0)
            GLib.source_remove(recentlyClickedAppLoopId);
        recentlyClickedAppLoopId = 0;
        recentlyClickedApp = null;
        recentlyClickedAppWindows = null;
        recentlyClickedAppIndex = 0;
        recentlyClickedAppMonitor = -1;

        return false;
    }

    getWindows() {
        return this.app.get_windows();
    }

    // Filter out unnecessary windows, for instance
    // nautilus desktop window.
    getInterestingWindows() {
        const interestingWindows = getInterestingWindows(this.getWindows(),
            this.monitorIndex);

        if (!this._urgentWindows.size)
            return interestingWindows;

        return [...new Set([...this._urgentWindows, ...interestingWindows])];
    }
});

var DockAppIcon = GObject.registerClass({
}, class DockAppIcon extends DockAbstractAppIcon {
    _init(app, monitorIndex, iconAnimator) {
        super._init(app, monitorIndex, iconAnimator);

        this._signalsHandler.add(tracker, 'notify::focus-app', () => this._updateFocusState());
    }
});

var DockLocationAppIcon = GObject.registerClass({
}, class DockLocationAppIcon extends DockAbstractAppIcon {
    _init(app, monitorIndex, iconAnimator) {
        if (!(app.appInfo instanceof Locations.LocationAppInfo))
            throw new Error('Provided application %s is not a Location'.format(app));

        super._init(app, monitorIndex, iconAnimator);

        if (Docking.DockManager.settings.isolateLocations) {
            this._signalsHandler.add(tracker, 'notify::focus-app', () => this._updateFocusState());
        } else {
            this._signalsHandler.add(global.display, 'notify::focus-window',
                () => this._updateFocusState());
        }

        this._signalsHandler.add(this.app, 'notify::icon', () => this.icon.update());
    }

    get location() {
        return this.app.location;
    }

    _updateFocusState() {
        if (Docking.DockManager.settings.isolateLocations) {
            super._updateFocusState();
            return;
        }

        this.focused = this.app.isFocused && this.running;
    }
});

/**
 * @param app
 * @param monitorIndex
 * @param iconAnimator
 */
function makeAppIcon(app, monitorIndex, iconAnimator) {
    if (app.appInfo instanceof Locations.LocationAppInfo)
        return new DockLocationAppIcon(app, monitorIndex, iconAnimator);

    return new DockAppIcon(app, monitorIndex, iconAnimator);
}

/**
 * DockAppIconMenu
 *
 * - set popup arrow side based on dash orientation
 * - Add close windows option based on quitfromdash extension
 *   (https://github.com/deuill/shell-extension-quitfromdash)
 * - Add open windows thumbnails instead of list
 * - update menu when application windows change
 */
const DockAppIconMenu = class DockAppIconMenu extends PopupMenu.PopupMenu {
    constructor(source) {
        super(source, 0.5, Utils.getPosition());

        this._signalsHandler = new Utils.GlobalSignalsHandler(this);

        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this._source = source;
        this._parentalControlsManager = ParentalControlsManager.getDefault();

        this.actor.add_style_class_name('app-menu');
        this.actor.add_style_class_name('dock-app-menu');

        // Chain our visibility and lifecycle to that of the source
        this._signalsHandler.add(source, 'notify::mapped', () => {
            if (!source.mapped)
                this.close();
        });
        source.connect('destroy', () => this.destroy());

        Main.uiGroup.add_actor(this.actor);

        const { remoteModel } = Docking.DockManager.getDefault();
        const remoteModelApp = remoteModel?.lookupById(this._source?.app?.id);
        if (remoteModelApp && DbusmenuUtils.haveDBusMenu()) {
            const [onQuicklist, onDynamicSection] = Utils.splitHandler((sender,
                { quicklist }, dynamicSection) => {
                dynamicSection.removeAll();
                if (quicklist) {
                    quicklist.get_children().forEach(remoteItem =>
                        dynamicSection.addMenuItem(
                            DbusmenuUtils.makePopupMenuItem(remoteItem, false)));
                }
            });

            this._signalsHandler.add([
                remoteModelApp,
                'quicklist-changed',
                onQuicklist,
            ], [
                this,
                'dynamic-section-changed',
                onDynamicSection,
            ]);
        }
    }

    _appendSeparator() {
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _appendMenuItem(labelText) {
        const item = new PopupMenu.PopupMenuItem(labelText);
        this.addMenuItem(item);
        return item;
    }

    popup(_activatingButton) {
        this._rebuildMenu();
        this.open(BoxPointer.PopupAnimation.FULL);
    }

    _rebuildMenu() {
        this.removeAll();

        if (Docking.DockManager.settings.showWindowsPreview) {
            // Display the app windows menu items and the separator between windows
            // of the current desktop and other windows.
            const windows = this._source.getInterestingWindows();

            this._allWindowsMenuItem = new PopupMenu.PopupSubMenuMenuItem(__('All Windows'), false);
            if (this._allWindowsMenuItem.menu?.actor)
                this._allWindowsMenuItem.menu.actor.overlayScrollbars = true;
            this._allWindowsMenuItem.hide();
            if (windows.length > 0)
                this.addMenuItem(this._allWindowsMenuItem);
        } else {
            const windows = this._source.getInterestingWindows();

            if (windows.length > 0) {
                this.addMenuItem(
                    /* Translators: This is the heading of a list of open windows */
                    new PopupMenu.PopupSeparatorMenuItem(_('Open Windows')));
            }

            windows.forEach(window => {
                const title = window.title
                    ? window.title : this._source.app.get_name();
                const item = this._appendMenuItem(title);
                item.connect('activate', () => {
                    this.emit('activate-window', window);
                });
            });
        }

        if (!this._source.app.is_window_backed()) {
            this._appendSeparator();

            const appInfo = this._source.app.get_app_info();
            const actions = appInfo.list_actions();
            if (this._source.app.can_open_new_window() &&
                actions.indexOf('new-window') === -1) {
                this._newWindowMenuItem = this._appendMenuItem(_('New Window'));
                this._newWindowMenuItem.connect('activate', () => {
                    if (this._source.app.state === Shell.AppState.STOPPED)
                        this._source.animateLaunch();

                    this._source.app.open_new_window(-1);
                    this.emit('activate-window', null);
                });
                this._appendSeparator();
            }

            if (Docking.DockManager.getDefault().discreteGpuAvailable &&
                this._source.app.state === Shell.AppState.STOPPED) {
                const appPrefersNonDefaultGPU = appInfo.get_boolean('PrefersNonDefaultGPU');
                const gpuPref = appPrefersNonDefaultGPU
                    ? Shell.AppLaunchGpu.DEFAULT
                    : Shell.AppLaunchGpu.DISCRETE;
                this._onGpuMenuItem = this._appendMenuItem(appPrefersNonDefaultGPU
                    ? _('Launch using Integrated Graphics Card')
                    : _('Launch using Discrete Graphics Card'));
                this._onGpuMenuItem.connect('activate', () => {
                    this._source.animateLaunch();
                    this._source.app.launch(0, -1, gpuPref);
                    this.emit('activate-window', null);
                });
            }

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                const item = this._appendMenuItem(appInfo.get_action_name(action));
                item.sensitive = !appInfo.busy;
                item.connect('activate', (emitter, event) => {
                    this._source.app.launch_action(action, event.get_time(), -1);
                    this.emit('activate-window', null);
                });
            }

            const canFavorite = global.settings.is_writable('favorite-apps') &&
                (this._source instanceof DockAppIcon) &&
                this._parentalControlsManager.shouldShowApp(this._source.app.app_info);

            if (canFavorite) {
                this._appendSeparator();

                const isFavorite = AppFavorites.getAppFavorites().isFavorite(this._source.app.get_id());
                const [majorVersion] = Config.PACKAGE_VERSION.split('.');

                if (isFavorite) {
                    const label = majorVersion >= 42 ? _('Unpin')
                        : _('Remove from Favorites');
                    const item = this._appendMenuItem(label);
                    item.connect('activate', () => {
                        const favs = AppFavorites.getAppFavorites();
                        favs.removeFavorite(this._source.app.get_id());
                    });
                } else {
                    const label = majorVersion >= 42 ? _('Pin to Dash')
                        : _('Add to Favorites');
                    const item = this._appendMenuItem(label);
                    item.connect('activate', () => {
                        const favs = AppFavorites.getAppFavorites();
                        favs.addFavorite(this._source.app.get_id());
                    });
                }
            }

            if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop') &&
                (this._source instanceof DockAppIcon)) {
                this._appendSeparator();
                const item = this._appendMenuItem(_('Show Details'));
                item.connect('activate', () => {
                    const id = this._source.app.get_id();
                    const args = GLib.Variant.new('(ss)', [id, '']);
                    Gio.DBus.get(Gio.BusType.SESSION, null,
                        (o, res) => {
                            const bus = Gio.DBus.get_finish(res);
                            bus.call('org.gnome.Software',
                                '/org/gnome/Software',
                                'org.gtk.Actions', 'Activate',
                                GLib.Variant.new('(sava{sv})',
                                    ['details', [args], null]),
                                null, 0, -1, null, null);
                            Main.overview.hide();
                        });
                });
            }
        }

        // dynamic menu
        const items = this._getMenuItems();
        let i = items.length;
        if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop'))
            i -= 2;

        if (global.settings.is_writable('favorite-apps'))
            i -= 2;

        if (i < 0)
            i = 0;

        const dynamicSection = new PopupMenu.PopupMenuSection();
        this.addMenuItem(dynamicSection, i);
        this.emit('dynamic-section-changed', dynamicSection);

        // quit menu
        this._appendSeparator();
        this._quitMenuItem = this._appendMenuItem(_('Quit'));
        this._quitMenuItem.connect('activate', () => this._source.closeAllWindows());

        this.update();
    }

    // update menu content when application windows change. This is desirable as actions
    // acting on windows (closing) are performed while the menu is shown.
    update() {
        // update, show or hide the quit menu
        if (this._source.windowsCount > 0) {
            if (this._source.windowsCount === 1) {
                this._quitMenuItem.label.set_text(_('Quit'));
            } else {
                this._quitMenuItem.label.set_text(__('Quit %d Windows').format(
                    this._source.windowsCount));
            }

            this._quitMenuItem.actor.show();
        } else {
            this._quitMenuItem.actor.hide();
        }

        if (Docking.DockManager.settings.showWindowsPreview) {
            const windows = this._source.getInterestingWindows();

            // update, show, or hide the allWindows menu
            // Check if there are new windows not already displayed. In such case,
            // repopulate the allWindows menu. Windows removal is already handled
            // by each preview being connected to the destroy signal
            const oldWindows = this._allWindowsMenuItem.menu._getMenuItems().map(item => {
                return item._window;
            });

            const newWindows = windows.filter(w =>
                oldWindows.indexOf(w) < 0);
            if (newWindows.length > 0) {
                this._populateAllWindowMenu(windows);

                // Try to set the width to that of the submenu.
                // TODO: can't get the actual size, getting a bit less.
                // Temporary workaround: add 15px to compensate
                this._allWindowsMenuItem.width =  this._allWindowsMenuItem.menu.actor.width + 15;
            }

            // The menu is created hidden and never hidded after being shown.
            // Instead, a signal connected to its items destroy will set is
            // insensitive if no more windows preview are shown.
            if (windows.length > 0) {
                this._allWindowsMenuItem.show();
                this._allWindowsMenuItem.setSensitive(true);

                if (Docking.DockManager.settings.defaultWindowsPreviewToOpen)
                    this._allWindowsMenuItem.menu.open();
            }
        }

        // Update separators
        this._getMenuItems().forEach(item => {
            if ('label' in item)
                this._updateSeparatorVisibility(item);
        });
    }

    _populateAllWindowMenu(windows) {
        this._allWindowsMenuItem.menu.removeAll();

        if (windows.length > 0) {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            let separatorShown =  windows[0].get_workspace() !== activeWorkspace;

            for (let i = 0; i < windows.length; i++) {
                const window = windows[i];
                if (!separatorShown && window.get_workspace() !== activeWorkspace) {
                    this._allWindowsMenuItem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    separatorShown = true;
                }

                const item = new WindowPreview.WindowPreviewMenuItem(window,
                    St.Side.LEFT);
                this._allWindowsMenuItem.menu.addMenuItem(item);
                item.connect('activate', () => {
                    this.emit('activate-window', window);
                });

                // This is to achieve a more gracefull transition when the last windows is closed.
                item.connect('destroy', () => {
                    // It's still counting the item just going to be destroyed
                    if (this._allWindowsMenuItem.menu._getMenuItems().length === 1)
                        this._allWindowsMenuItem.setSensitive(false);
                });
            }
        }
    }
};

/**
 * @param w
 */
function isWindowUrgent(w) {
    return w.urgent || w.demandsAttention || w._manualUrgency;
}

/**
 * Filter out unnecessary windows, for instance
 * nautilus desktop window.
 *
 * @param windows
 * @param monitorIndex
 */
function getInterestingWindows(windows, monitorIndex) {
    const { settings } = Docking.DockManager;

    // When using workspace isolation, we filter out windows
    // that are neither in the current workspace nor marked urgent
    if (settings.isolateWorkspaces) {
        const showUrgent = settings.workspaceAgnosticUrgentWindows;
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        windows = windows.filter(w => {
            const inWorkspace = w.get_workspace() === activeWorkspace;
            return inWorkspace || (showUrgent && isWindowUrgent(w));
        });
    }

    if (settings.isolateMonitors && monitorIndex >= 0) {
        windows = windows.filter(w => {
            return w.get_monitor() === monitorIndex;
        });
    }

    return windows.filter(w => !w.skipTaskbar);
}

/**
 * A ShowAppsIcon improved class.
 *
 * - set label position based on dash orientation
 *   Note: we are am reusing most machinery of the appIcon class.
 * - implement a popupMenu based on the AppIcon code
 *   Note: we are reusing most machinery of the appIcon class)
 *
 */

var DockShowAppsIcon = GObject.registerClass({
    Signals: {
        'menu-state-changed': { param_types: [GObject.TYPE_BOOLEAN] },
        'sync-tooltip': {},
    },
}
, class DockShowAppsIcon extends Dash.ShowAppsIcon {
    _init(position) {
        super._init();

        // Re-use appIcon methods
        const { prototype: appIconPrototype } = AppDisplay.AppIcon;
        this.toggleButton.y_expand = false;
        this.toggleButton.connect('popup-menu', () =>
            appIconPrototype._onKeyboardPopupMenu.call(this));
        this.toggleButton.connect('clicked', () =>
            this._removeMenuTimeout());

        this.reactive = true;
        this.toggleButton.popupMenu = (...args) =>
            this.popupMenu(...args);
        this.toggleButton._setPopupTimeout = (...args) =>
            this._setPopupTimeout(...args);
        this.toggleButton._removeMenuTimeout = (...args) =>
            this._removeMenuTimeout(...args);

        this.label?.add_style_class_name(Theming.PositionStyleClass[position]);
        if (Docking.DockManager.settings.customThemeShrink)
            this.label?.add_style_class_name('shrink');

        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuTimeoutId = 0;
    }

    vfunc_leave_event(...args) {
        return AppDisplay.AppIcon.prototype.vfunc_leave_event.call(
            this.toggleButton, ...args);
    }

    vfunc_button_press_event(...args) {
        return AppDisplay.AppIcon.prototype.vfunc_button_press_event.call(
            this.toggleButton, ...args);
    }

    vfunc_touch_event(...args) {
        return AppDisplay.AppIcon.prototype.vfunc_touch_event.call(
            this.toggleButton, ...args);
    }

    showLabel(...args) {
        itemShowLabel.call(this, ...args);
    }

    setForcedHighlight(...args) {
        AppDisplay.AppIcon.prototype.setForcedHighlight.call(this, ...args);
    }

    _onMenuPoppedDown(...args) {
        AppDisplay.AppIcon.prototype._onMenuPoppedDown.call(this, ...args);
    }

    _setPopupTimeout(...args) {
        AppDisplay.AppIcon.prototype._setPopupTimeout.call(this, ...args);
    }

    _removeMenuTimeout(...args) {
        AppDisplay.AppIcon.prototype._removeMenuTimeout.call(this, ...args);
    }

    popupMenu() {
        this._removeMenuTimeout();
        this.toggleButton.fake_release();

        if (!this._menu) {
            this._menu = new DockShowAppsIconMenu(this);
            this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            const id = Main.overview.connect('hiding', () => {
                this._menu.close();
            });
            this._menu.actor.connect('destroy', () => {
                Main.overview.disconnect(id);
            });
            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this.toggleButton.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    }
});


/**
 * A menu for the showAppsIcon
 */
class DockShowAppsIconMenu extends DockAppIconMenu {
    _rebuildMenu() {
        this.removeAll();

        /* Translators: %s is "Settings", which is automatically translated. You
           can also translate the full message if this fits better your language. */
        const name = __('Dash to Dock %s').format(_('Settings'));
        const item = this._appendMenuItem(name);

        item.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
    }
}

/**
 * This function is used for both DockShowAppsIcon and DockDashItemContainer
 */
function itemShowLabel()  {
    // Check if the label is still present at all. When switching workpaces, the
    // item might have been destroyed in between.
    if (!this._labelText || !this.label.get_stage())
        return;

    this.label.set_text(this._labelText);
    this.label.opacity = 0;
    this.label.show();

    const [stageX, stageY] = this.get_transformed_position();
    const node = this.label.get_theme_node();

    const itemWidth  = this.allocation.x2 - this.allocation.x1;
    const itemHeight = this.allocation.y2 - this.allocation.y1;

    const labelWidth = this.label.get_width();
    const labelHeight = this.label.get_height();

    let x, y, xOffset, yOffset;

    const position = Utils.getPosition();
    const labelOffset = node.get_length('-x-offset');

    switch (position) {
    case St.Side.LEFT:
        yOffset = Math.floor((itemHeight - labelHeight) / 2);
        y = stageY + yOffset;
        xOffset = labelOffset;
        x = stageX + this.get_width() + xOffset;
        break;
    case St.Side.RIGHT:
        yOffset = Math.floor((itemHeight - labelHeight) / 2);
        y = stageY + yOffset;
        xOffset = labelOffset;
        x = Math.round(stageX) - labelWidth - xOffset;
        break;
    case St.Side.TOP:
        y = stageY + labelOffset + itemHeight;
        xOffset = Math.floor((itemWidth - labelWidth) / 2);
        x = stageX + xOffset;
        break;
    case St.Side.BOTTOM:
        yOffset = labelOffset;
        y = stageY - labelHeight - yOffset;
        xOffset = Math.floor((itemWidth - labelWidth) / 2);
        x = stageX + xOffset;
        break;
    }

    // keep the label inside the screen border
    // Only needed fot the x coordinate.

    // Leave a few pixel gap
    const gap = 5;
    const monitor = Main.layoutManager.findMonitorForActor(this);
    if (x - monitor.x < gap)
        x += monitor.x - x + labelOffset;
    else if (x + labelWidth > monitor.x + monitor.width - gap)
        x -= x + labelWidth - (monitor.x + monitor.width) + gap;

    this.label.remove_all_transitions();
    this.label.set_position(x, y);
    this.label.ease({
        opacity: 255,
        duration: Dash.DASH_ITEM_LABEL_SHOW_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
}
