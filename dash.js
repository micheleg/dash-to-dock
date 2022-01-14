// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Dash = imports.ui.dash;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const Workspace = imports.ui.workspace;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;
const Utils = Me.imports.utils;
const AppIcons = Me.imports.appIcons;
const Locations = Me.imports.locations;

const DASH_ANIMATION_TIME = Dash.DASH_ANIMATION_TIME;
const DASH_ITEM_LABEL_HIDE_TIME = Dash.DASH_ITEM_LABEL_HIDE_TIME;
const DASH_ITEM_HOVER_TIMEOUT = Dash.DASH_ITEM_HOVER_TIMEOUT;
const DASH_VISIBILITY_TIMEOUT = 3;

/**
 * Extend DashItemContainer
 *
 * - set label position based on dash orientation
 *
 */
var DockDashItemContainer = GObject.registerClass(
class DockDashItemContainer extends Dash.DashItemContainer {

    showLabel() {
        return AppIcons.itemShowLabel.call(this);
    }
});

const DockDashIconsVerticalLayout = GObject.registerClass(
    class DockDashIconsVerticalLayout extends Clutter.BoxLayout {
        _init() {
            super._init({
                orientation: Clutter.Orientation.VERTICAL,
            });
        }

        vfunc_get_preferred_height(container, forWidth) {
            const [natHeight] = super.vfunc_get_preferred_height(container, forWidth);
            return [natHeight, 0];
        }
});


const baseIconSizes = [16, 22, 24, 32, 48, 64, 96, 128];

/**
 * This class is a fork of the upstream dash class (ui.dash.js)
 *
 * Summary of changes:
 * - disconnect global signals adding a destroy method;
 * - play animations even when not in overview mode
 * - set a maximum icon size
 * - show running and/or favorite applications
 * - hide showApps label when the custom menu is shown.
 * - add scrollview
 *   ensure actor is visible on keyfocus inseid the scrollview
 * - add 128px icon size, might be useful for hidpi display
 * - sync minimization application target position.
 * - keep running apps ordered.
 */
var DockDash = GObject.registerClass({
    Properties: {
        'requires-visibility': GObject.ParamSpec.boolean(
            'requires-visibility', 'requires-visibility', 'requires-visibility',
            GObject.ParamFlags.READWRITE,
            false),
    },
    Signals: {
        'menu-closed': {},
        'icon-size-changed': {},
    }
}, class DockDash extends St.Widget {

    _init(monitorIndex) {
        // Initialize icon variables and size
        this._maxWidth = -1;
        this._maxHeight = -1;
        this.iconSize = Docking.DockManager.settings.get_int('dash-max-icon-size');
        this._availableIconSizes = baseIconSizes;
        this._shownInitially = false;
        this._initializeIconSize(this.iconSize);

        this._separator = null;

        this._monitorIndex = monitorIndex;
        this._position = Utils.getPosition();
        this._isHorizontal = ((this._position == St.Side.TOP) ||
                               (this._position == St.Side.BOTTOM));

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;
        this._showLabelTimeoutId = 0;
        this._resetHoverTimeoutId = 0;
        this._labelShowing = false;

        super._init({
            name: 'dash',
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            layout_manager: new Clutter.BinLayout()
        });

        this._dashContainer = new St.BoxLayout({
            name: "dashtodockDashContainer",
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            vertical: !this._isHorizontal,
            y_expand: this._isHorizontal,
            x_expand: !this._isHorizontal,
        });

        this._scrollView = new St.ScrollView({
            name: 'dashtodockDashScrollview',
            hscrollbar_policy: this._isHorizontal ? St.PolicyType.EXTERNAL : St.PolicyType.NEVER,
            vscrollbar_policy: this._isHorizontal ?  St.PolicyType.NEVER : St.PolicyType.EXTERNAL,
            x_expand: this._isHorizontal,
            y_expand: !this._isHorizontal,
            enable_mouse_scrolling: false
        });

        if (Docking.DockManager.settings.dockExtended) {
            if (!this._isHorizontal) {
                this._scrollView.y_align = Clutter.ActorAlign.START;
            } else {
                this._scrollView.x_align = Clutter.ActorAlign.START;
            }
        }

        this._scrollView.connect('scroll-event', this._onScrollEvent.bind(this));

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;
        this._box = new St.BoxLayout({
            vertical: !this._isHorizontal,
            clip_to_allocation: false,
            ...(!this._isHorizontal ? { layout_manager: new DockDashIconsVerticalLayout() } : {}),
            x_align: rtl ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
            y_align: this._isHorizontal ? Clutter.ActorAlign.CENTER: Clutter.ActorAlign.START,
            y_expand: !this._isHorizontal,
            x_expand: this._isHorizontal
        });
        this._box._delegate = this;
        this._dashContainer.add_actor(this._scrollView);
        this._scrollView.add_actor(this._box);

        this._showAppsIcon = new AppIcons.DockShowAppsIcon();
        this._showAppsIcon.show(false);
        this._showAppsIcon.icon.setIconSize(this.iconSize);
        this._showAppsIcon.x_expand = false;
        this._showAppsIcon.y_expand = false;
        if (!this._isHorizontal)
            this._showAppsIcon.y_align = Clutter.ActorAlign.START;
        this._hookUpLabel(this._showAppsIcon);
        this._showAppsIcon.connect('menu-state-changed', (_icon, opened) => {
            this._itemMenuStateChanged(this._showAppsIcon, opened);
        });

        if (Docking.DockManager.settings.get_boolean('show-apps-at-top')) {
            this._dashContainer.insert_child_below(this._showAppsIcon, null);
        } else {
            this._dashContainer.insert_child_above(this._showAppsIcon, null);
        }

        this._background = new St.Widget({
            style_class: 'dash-background',
            y_expand: this._isHorizontal,
            x_expand: !this._isHorizontal,
        });

        const sizerBox = new Clutter.Actor();
        sizerBox.add_constraint(new Clutter.BindConstraint({
            source: this._isHorizontal ? this._showAppsIcon.icon : this._dashContainer,
            coordinate: Clutter.BindCoordinate.HEIGHT,
        }));
        sizerBox.add_constraint(new Clutter.BindConstraint({
            source: this._isHorizontal ? this._dashContainer : this._showAppsIcon.icon,
            coordinate: Clutter.BindCoordinate.WIDTH,
        }));
        this._background.add_child(sizerBox);

        this.add_child(this._background);
        this.add_child(this._dashContainer);

        this._workId = Main.initializeDeferredWork(this._box, this._redisplay.bind(this));

        this._shellSettings = new Gio.Settings({
            schema_id: 'org.gnome.shell'
        });

        this._appSystem = Shell.AppSystem.get_default();

        this.iconAnimator = new Docking.IconAnimator(this);

        this._signalsHandler = new Utils.GlobalSignalsHandler(this);
        this._signalsHandler.add([
            this._appSystem,
            'installed-changed',
            () => {
                AppFavorites.getAppFavorites().reload();
                this._queueRedisplay();
            }
        ], [
            AppFavorites.getAppFavorites(),
            'changed',
            this._queueRedisplay.bind(this)
        ], [
            this._appSystem,
            'app-state-changed',
            this._queueRedisplay.bind(this)
        ], [
            Main.overview,
            'item-drag-begin',
            this._onItemDragBegin.bind(this)
        ], [
            Main.overview,
            'item-drag-end',
            this._onItemDragEnd.bind(this)
        ], [
            Main.overview,
            'item-drag-cancelled',
            this._onItemDragCancelled.bind(this)
        ], [
            Main.overview,
            'window-drag-begin',
            this._onWindowDragBegin.bind(this)
        ], [
            Main.overview,
            'window-drag-cancelled',
            this._onWindowDragEnd.bind(this)
        ], [
            Main.overview,
            'window-drag-end',
            this._onWindowDragEnd.bind(this)
        ]);

        this.connect('destroy', this._onDestroy.bind(this));
    }

    vfunc_get_preferred_height(forWidth) {
        let [minHeight, natHeight] = super.vfunc_get_preferred_height.call(this, forWidth);
        if (!this._isHorizontal && this._maxHeight !== -1 && natHeight > this._maxHeight)
            return [minHeight, this._maxHeight]
        else
            return [minHeight, natHeight]
    }

    vfunc_get_preferred_width(forHeight) {
        let [minWidth, natWidth] = super.vfunc_get_preferred_width.call(this, forHeight);
        if (this._isHorizontal && this._maxWidth !== -1 && natWidth > this._maxWidth)
            return [minWidth, this._maxWidth]
        else
            return [minWidth, natWidth]
    }

    get _container() {
        return this._dashContainer;
    }

    _onDestroy() {
        this.iconAnimator.destroy();

        if (this._requiresVisibilityTimeout)
            GLib.source_remove(this._requiresVisibilityTimeout);
    }


    _onItemDragBegin() {
        return Dash.Dash.prototype._onItemDragBegin.call(this, ...arguments);
    }

    _onItemDragCancelled() {
        return Dash.Dash.prototype._onItemDragCancelled.call(this, ...arguments);
    }

    _onItemDragEnd() {
        return Dash.Dash.prototype._onItemDragEnd.call(this, ...arguments);
    }

    _endItemDrag() {
        return Dash.Dash.prototype._endItemDrag.call(this, ...arguments);
    }

    _onItemDragMotion() {
        return Dash.Dash.prototype._onItemDragMotion.call(this, ...arguments);
    }

    _appIdListToHash() {
        return Dash.Dash.prototype._appIdListToHash.call(this, ...arguments);
    }

    _queueRedisplay() {
        return Dash.Dash.prototype._queueRedisplay.call(this, ...arguments);
    }

    _hookUpLabel() {
        return Dash.Dash.prototype._hookUpLabel.call(this, ...arguments);
    }

    _syncLabel() {
        return Dash.Dash.prototype._syncLabel.call(this, ...arguments);
    }

    _clearDragPlaceholder() {
        return Dash.Dash.prototype._clearDragPlaceholder.call(this, ...arguments);
    }

    _clearEmptyDropTarget() {
        return Dash.Dash.prototype._clearEmptyDropTarget.call(this, ...arguments);
    }

    handleDragOver(source, actor, x, y, time) {
        let ret;
        if (this._isHorizontal) {
            ret = Dash.Dash.prototype.handleDragOver.call(this, source, actor, x, y, time);

            if (ret == DND.DragMotionResult.CONTINUE)
                return ret;
        } else {
            const propertyInjections = new Utils.PropertyInjectionsHandler();
            propertyInjections.add(this._box, 'width', {
                get: () => this._box.get_children().reduce((a, c) => a + c.height, 0),
            });

            if (this._dragPlaceholder) {
                propertyInjections.add(this._dragPlaceholder, 'width', {
                    get: () => this._dragPlaceholder.height,
                });
            }

            ret = Dash.Dash.prototype.handleDragOver.call(this, source, actor, y, x, time);
            propertyInjections.destroy();

            if (ret == DND.DragMotionResult.CONTINUE)
                return ret;

            if (this._dragPlaceholder) {
                this._dragPlaceholder.child.set_width(this.iconSize / 2);
                this._dragPlaceholder.child.set_height(this.iconSize);

                let pos = this._dragPlaceholderPos;
                if (this._isHorizontal && (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL))
                    pos = this._box.get_children() - 1 - pos;

                if (pos != this._dragPlaceholderPos) {
                    this._dragPlaceholderPos = pos;
                    this._box.set_child_at_index(this._dragPlaceholder,
                        this._dragPlaceholderPos)
                }
            }
        }

        if (this._dragPlaceholder) {
            // Ensure the next and previous icon are visible when moving the placeholder
            // (I assume there's room for both of them)
            const children = this._box.get_children();
            if (this._dragPlaceholderPos > 0)
                ensureActorVisibleInScrollView(this._scrollView,
                    children[this._dragPlaceholderPos - 1]);

            if (this._dragPlaceholderPos >= -1 &&
                this._dragPlaceholderPos < children.length - 1)
                ensureActorVisibleInScrollView(this._scrollView,
                    children[this._dragPlaceholderPos + 1]);
        }

        return ret;
    }

    acceptDrop() {
        return Dash.Dash.prototype.acceptDrop.call(this, ...arguments);
    }

    _onWindowDragBegin() {
        return Dash.Dash.prototype._onWindowDragBegin.call(this, ...arguments);
    }

    _onWindowDragEnd() {
        return Dash.Dash.prototype._onWindowDragEnd.call(this, ...arguments);
    }

    _onScrollEvent(actor, event) {
        // If scroll is not used because the icon is resized, let the scroll event propagate.
        if (!Docking.DockManager.settings.get_boolean('icon-size-fixed'))
            return Clutter.EVENT_PROPAGATE;

        // reset timeout to avid conflicts with the mousehover event
        if (this._ensureAppIconVisibilityTimeoutId > 0) {
            GLib.source_remove(this._ensureAppIconVisibilityTimeoutId);
            this._ensureAppIconVisibilityTimeoutId = 0;
        }

        // Skip to avoid double events mouse
        // TODO: Horizontal events are emulated, potentially due to a conflict
        // with the workspace switching gesture.
        if (!this._isHorizontal && event.is_pointer_emulated()) {
            return Clutter.EVENT_STOP;
        }

        let adjustment, delta = 0;

        if (this._isHorizontal)
            adjustment = this._scrollView.get_hscroll_bar().get_adjustment();
        else
            adjustment = this._scrollView.get_vscroll_bar().get_adjustment();

        let increment = adjustment.step_increment;

        if (this._isHorizontal) {
            switch (event.get_scroll_direction()) {
                case Clutter.ScrollDirection.LEFT:
                    delta = -increment;
                    break;
                case Clutter.ScrollDirection.RIGHT:
                    delta = +increment;
                    break;
                case Clutter.ScrollDirection.SMOOTH:
                    let [dx, dy] = event.get_scroll_delta();
                    // TODO: Handle y
                    //delta = dy * increment;
                    // Also consider horizontal component, for instance touchpad
                    delta = dx * increment;
                    break;
            }
        } else {
            switch (event.get_scroll_direction()) {
                case Clutter.ScrollDirection.UP:
                    delta = -increment;
                    break;
                case Clutter.ScrollDirection.DOWN:
                    delta = +increment;
                    break;
                case Clutter.ScrollDirection.SMOOTH:
                    let [, dy] = event.get_scroll_delta();
                    delta = dy * increment;
                    break;
            }
        }

        const value = adjustment.get_value();

        // TODO: Remove this if possible.
        if (Number.isNaN(value)) {
            adjustment.set_value(delta);
        } else {
            adjustment.set_value(value + delta);
        }

        return Clutter.EVENT_STOP;
    }

    _createAppItem(app) {
        const appIcon = new AppIcons.makeAppIcon(app, this._monitorIndex, this.iconAnimator);

        if (appIcon._draggable) {
            appIcon._draggable.connect('drag-begin', () => {
                appIcon.opacity = 50;
            });
            appIcon._draggable.connect('drag-end', () => {
                appIcon.opacity = 255;
            });
        }

        appIcon.connect('menu-state-changed', (appIcon, opened) => {
            this._itemMenuStateChanged(item, opened);
        });

        const item = new DockDashItemContainer();
        item.setChild(appIcon);

        appIcon.connect('notify::hover', () => {
            if (appIcon.hover) {
                this._ensureAppIconVisibilityTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT, 100, () => {
                    ensureActorVisibleInScrollView(this._scrollView, appIcon);
                    this._ensureAppIconVisibilityTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                });
            }
            else {
                if (this._ensureAppIconVisibilityTimeoutId > 0) {
                    GLib.source_remove(this._ensureAppIconVisibilityTimeoutId);
                    this._ensureAppIconVisibilityTimeoutId = 0;
                }
            }
        });

        appIcon.connect('clicked', (actor) => {
            ensureActorVisibleInScrollView(this._scrollView, actor);
        });

        appIcon.connect('key-focus-in', (actor) => {
            let [x_shift, y_shift] = ensureActorVisibleInScrollView(this._scrollView, actor);

            // This signal is triggered also by mouse click. The popup menu is opened at the original
            // coordinates. Thus correct for the shift which is going to be applied to the scrollview.
            if (appIcon._menu) {
                appIcon._menu._boxPointer.xOffset = -x_shift;
                appIcon._menu._boxPointer.yOffset = -y_shift;
            }
        });

        appIcon.connect('notify::focused', () => {
            const { settings } = Docking.DockManager;
            if (appIcon.focused && settings.get_boolean('scroll-to-focused-application'))
                ensureActorVisibleInScrollView(this._scrollView, item);
        });

        appIcon.connect('notify::urgent', () => {
            if (appIcon.urgent) {
                ensureActorVisibleInScrollView(this._scrollView, item);
                this._requireVisibility();
            }
        });

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    }

    _requireVisibility() {
        this.requiresVisibility = true;

        if (this._requiresVisibilityTimeout)
            GLib.source_remove(this._requiresVisibilityTimeout);

        this._requiresVisibilityTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            DASH_VISIBILITY_TIMEOUT, () => {
                this._requiresVisibilityTimeout = 0;
                this.requiresVisibility = false;
            });
    }

    /**
     * Return an array with the "proper" appIcons currently in the dash
     */
     getAppIcons() {
        // Only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   !!actor.child.icon &&
                   !actor.animatingOut;
        });

        let appIcons = iconChildren.map(function(actor) {
            return actor.child;
        });

      return appIcons;
    }

    _updateAppsIconGeometry() {
        let appIcons = this.getAppIcons();
        appIcons.forEach(function(icon) {
            icon.updateIconGeometry();
        });
    }

    _itemMenuStateChanged(item, opened) {
        Dash.Dash.prototype._itemMenuStateChanged.call(this, item, opened);

        if (!opened) {
            // I want to listen from outside when a menu is closed. I used to
            // add a custom signal to the appIcon, since gnome 3.8 the signal
            // calling this callback was added upstream.
            this.emit('menu-closed');
        }
    }

    _adjustIconSize() {
        // For the icon size, we only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(actor => {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.icon &&
                   !actor.animatingOut;
        });

        iconChildren.push(this._showAppsIcon);

        if (this._maxWidth === -1 && this._maxHeight === -1)
            return;

        // Check if the container is present in the stage. This avoids critical
        // errors when unlocking the screen
        if (!this._container.get_stage())
            return;

        const themeNode = this._dashContainer.get_theme_node();
        const maxAllocation = new Clutter.ActorBox({
            x1: 0,
            y1: 0,
            x2: this._isHorizontal ? this._maxWidth : 42 /* whatever */,
            y2: this._isHorizontal ? 42 : this._maxHeight
        });
        let maxContent = themeNode.get_content_box(maxAllocation);
        let availSpace;
        if (this._isHorizontal)
            availSpace = maxContent.get_width();
        else
            availSpace = maxContent.get_height();

        let spacing = themeNode.get_length('spacing');

        const [{ child: firstButton }] = iconChildren;
        const { child: firstIcon } = firstButton.icon;

        // if no icons there's nothing to adjust
        if (!firstIcon)
            return;

        // Enforce valid spacings during the size request
        firstIcon.ensure_style();
        const [, , iconWidth, iconHeight] = firstIcon.get_preferred_size();
        const [, , buttonWidth, buttonHeight] = firstButton.get_preferred_size();

        if (this._isHorizontal) {
            // Subtract icon padding and box spacing from the available width
            availSpace -= iconChildren.length * (buttonWidth - iconWidth) +
                           (iconChildren.length - 1) * spacing;

            if (this._separator) {
                const [, , separatorWidth] = this._separator.get_preferred_size();
                availSpace -= separatorWidth + spacing;
            }
        } else {
            // Subtract icon padding and box spacing from the available height
            availSpace -= iconChildren.length * (buttonHeight - iconHeight) +
                           (iconChildren.length - 1) * spacing;

            if (this._separator) {
                const [, , , separatorHeight] = this._separator.get_preferred_size();
                availSpace -= separatorHeight + spacing;
            }
        }

        const maxIconSize = availSpace / iconChildren.length;
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let iconSizes = this._availableIconSizes.map(s => s * scaleFactor);

        let newIconSize = this._availableIconSizes[0];
        for (let i = 0; i < iconSizes.length; i++) {
            if (iconSizes[i] <= maxIconSize)
                newIconSize = this._availableIconSizes[i];
        }

        if (newIconSize == this.iconSize)
            return;

        let oldIconSize = this.iconSize;
        this.iconSize = newIconSize;
        this.emit('icon-size-changed');

        let scale = oldIconSize / newIconSize;
        for (let i = 0; i < iconChildren.length; i++) {
            let icon = iconChildren[i].child._delegate.icon;

            // Set the new size immediately, to keep the icons' sizes
            // in sync with this.iconSize
            icon.setIconSize(this.iconSize);

            // Don't animate the icon size change when the overview
            // is transitioning, not visible or when initially filling
            // the dash
            if (!Main.overview.visible || Main.overview.animationInProgress ||
                !this._shownInitially)
                continue;

            let [targetWidth, targetHeight] = icon.icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            icon.icon.set_size(icon.icon.width * scale,
                               icon.icon.height * scale);

            icon.icon.ease({
                width: targetWidth,
                height: targetHeight,
                duration: DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (this._separator) {
            const animateProperties = this._isHorizontal ?
                { height: this.iconSize } : { width: this.iconSize };

            this._separator.ease({
                ...animateProperties,
                duration: DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _redisplay() {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();
        const dockManager = Docking.DockManager.getDefault();
        const { settings } = dockManager;

        if (settings.get_boolean('isolate-workspaces') ||
            settings.get_boolean('isolate-monitors')) {
            // When using isolation, we filter out apps that have no windows in
            // the current workspace
            let monitorIndex = this._monitorIndex;
            running = running.filter(app =>
                AppIcons.getInterestingWindows(app.get_windows(), monitorIndex).length);
        }

        let children = this._box.get_children().filter(actor => {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.app;
        });
        // Apps currently in the dash
        let oldApps = children.map(actor => actor.child._delegate.app);
        // Apps supposed to be in the dash
        let newApps = [];

        const showFavorites = settings.get_boolean('show-favorites');
        if (showFavorites) {
            for (let id in favorites)
                newApps.push(favorites[id]);
        }

        if (settings.get_boolean('show-running')) {
            // We reorder the running apps so that they don't change position on the
            // dash with every redisplay() call

            // First: add the apps from the oldApps list that are still running
            oldApps.forEach(oldApp => {
                const index = running.indexOf(oldApp);
                if (index > -1) {
                    const [app] = running.splice(index, 1);
                    if (!showFavorites || !(app.get_id() in favorites))
                        newApps.push(app);
                }
            });

            // Second: add the new apps
            running.forEach(app => {
                if (!showFavorites || !(app.get_id() in favorites))
                    newApps.push(app);
            });
        }

        this._signalsHandler.removeWithLabel('show-mounts');
        if (dockManager.removables) {
            this._signalsHandler.addWithLabel('show-mounts',
                dockManager.removables, 'changed', this._queueRedisplay.bind(this));
            dockManager.removables.getApps().forEach(removable => {
                if (!newApps.includes(removable))
                    newApps.push(removable);
            });
        } else {
            oldApps = oldApps.filter(app => !app.location || app.isTrash)
        }

        this._signalsHandler.removeWithLabel('show-trash');
        if (dockManager.trash) {
            this._signalsHandler.addWithLabel('show-trash',
                dockManager.trash, 'changed', this._queueRedisplay.bind(this));
            const trashApp = dockManager.trash.getApp();
            if (!newApps.includes(trashApp))
                newApps.push(trashApp);
        } else {
            oldApps = oldApps.filter(app => !app.isTrash)
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.

        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            let oldApp = oldApps.length > oldIndex ? oldApps[oldIndex] : null;
            let newApp = newApps.length > newIndex ? newApps[newIndex] : null;

            // No change at oldIndex/newIndex
            if (oldApp == newApp) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApp && !newApps.includes(oldApp)) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApp && !oldApps.includes(newApp)) {
                addedItems.push({ app: newApp,
                                  item: this._createAppItem(newApp),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let nextApp = newApps.length > newIndex + 1
                ? newApps[newIndex + 1] : null;
            let insertHere = nextApp && nextApp == oldApp;
            let alreadyRemoved = removedActors.reduce((result, actor) => {
                let removedApp = actor.child._delegate.app;
                return result || removedApp == newApp;
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApp);
                addedItems.push({ app: newApp,
                                  item: newItem,
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++) {
            this._box.insert_child_at_index(addedItems[i].item,
                                            addedItems[i].pos);
        }

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];

            // Don't animate item removal when the overview is transitioning
            // or hidden
            if (!Main.overview.animationInProgress)
                item.animateOutAndDestroy();
            else
                item.destroy();
        }

        this._adjustIconSize();

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once

        let animate = this._shownInitially &&
            !Main.overview.animationInProgress;

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++)
            addedItems[i].item.show(animate);

        // Update separator
        const nFavorites = Object.keys(favorites).length;
        const nIcons = children.length + addedItems.length - removedActors.length;
        if (nFavorites > 0 && nFavorites < nIcons) {
            if (!this._separator) {
                this._separator = new St.Widget({
                    style_class: 'dash-separator',
                    x_align: this._isHorizontal ?
                        Clutter.ActorAlign.FILL : Clutter.ActorAlign.CENTER,
                    y_align: this._isHorizontal ?
                        Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL,
                    width: this._isHorizontal ? -1 : this.iconSize,
                    height: this._isHorizontal ? this.iconSize : -1,
                });
                this._box.add_child(this._separator);
            }
            let pos = nFavorites;
            if (this._dragPlaceholder)
                pos++;
            this._box.set_child_at_index(this._separator, pos);
        } else if (this._separator) {
            this._separator.destroy();
            this._separator = null;
        }

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this._box.queue_relayout();
        // TODO
        // This is required for icon reordering when the scrollview is used.
        this._updateAppsIconGeometry();

        // This will update the size, and the corresponding number for each icon
        this._updateNumberOverlay();
    }

    _updateNumberOverlay() {
        let appIcons = this.getAppIcons();
        let counter = 1;
        appIcons.forEach(function(icon) {
            if (counter < 10){
                icon.setNumberOverlay(counter);
                counter++;
            } else if (counter == 10) {
                icon.setNumberOverlay(0);
                counter++;
            } else {
                // No overlay after 10
                icon.setNumberOverlay(-1);
            }
            icon.updateNumberOverlay();
        });

    }

    toggleNumberOverlay(activate) {
        let appIcons = this.getAppIcons();
        appIcons.forEach(function(icon) {
            icon.toggleNumberOverlay(activate);
        });
    }

    _initializeIconSize(max_size) {
        let max_allowed = baseIconSizes[baseIconSizes.length-1];
        max_size = Math.min(max_size, max_allowed);

        if (Docking.DockManager.settings.get_boolean('icon-size-fixed'))
            this._availableIconSizes = [max_size];
        else {
            this._availableIconSizes = baseIconSizes.filter(function(val) {
                return (val<max_size);
            });
            this._availableIconSizes.push(max_size);
        }
    }

    setIconSize(max_size, doNotAnimate) {
        this._initializeIconSize(max_size);

        if (doNotAnimate)
            this._shownInitially = false;

        this._queueRedisplay();
    }

    /**
     * Reset the displayed apps icon to maintain the correct order when changing
     * show favorites/show running settings
     */
    resetAppIcons() {
        let children = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   !!actor.child.icon;
        });
        for (let i = 0; i < children.length; i++) {
            let item = children[i];
            item.destroy();
        }

        // to avoid ugly animations, just suppress them like when dash is first loaded.
        this._shownInitially = false;
        this._redisplay();
    }

    get showAppsButton() {
        return this._showAppsIcon.toggleButton;
    }

    showShowAppsButton() {
        this._showAppsIcon.visible = true;
        this._showAppsIcon.show(true);
    }

    hideShowAppsButton() {
        this._showAppsIcon.visible = false;
    }

    setMaxSize(maxWidth, maxHeight) {
        if (this._maxWidth === maxWidth &&
            this._maxHeight === maxHeight)
            return;

        this._maxWidth = maxWidth;
        this._maxHeight = maxHeight;
        this._queueRedisplay();
    }

    updateShowAppsButton() {
        const notifiedProperties = [];
        this._signalsHandler.addWithLabel('first-last-child-workaround',
            this._dashContainer, 'notify',
            (_obj, pspec) => notifiedProperties.push(pspec.name));

        if (Docking.DockManager.settings.get_boolean('show-apps-at-top')) {
            this._dashContainer.set_child_below_sibling(this._showAppsIcon, null);
        } else {
            this._dashContainer.set_child_above_sibling(this._showAppsIcon, null);
        }

        this._signalsHandler.removeWithLabel('first-last-child-workaround');

        // This is indeed ugly, but we need to ensure that the last and first
        // visible widgets are re-computed by St, that is buggy because of a
        // mutter issue that is being fixed:
        // https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/2047
        if (!notifiedProperties.includes('first-child'))
            this._dashContainer.notify('first-child');
        if (!notifiedProperties.includes('last-child'))
            this._dashContainer.notify('last-child');
    }
});


/**
 * This is a copy of the same function in utils.js, but also adjust horizontal scrolling
 * and perform few further checks on the current value to avoid changing the values when
 * it would be clamp to the current one in any case.
 * Return the amount of shift applied
 */
function ensureActorVisibleInScrollView(scrollView, actor) {
    const { adjustment: vAdjustment } = scrollView.vscroll;
    const { adjustment: hAdjustment } = scrollView.hscroll;
    const { value: vValue0, pageSize: vPageSize, upper: vUpper } = vAdjustment;
    const { value: hValue0, pageSize: hPageSize, upper: hUpper } = hAdjustment;
    let [hValue, vValue] = [hValue0, vValue0];
    let vOffset = 0;
    let hOffset = 0;
    let fade = scrollView.get_effect('fade');
    if (fade) {
        vOffset = fade.fade_margins.top;
        hOffset = fade.fade_margins.left;
    }

    let box = actor.get_allocation_box();
    let y1 = box.y1, y2 = box.y2, x1 = box.x1, x2 = box.x2;

    let parent = actor.get_parent();
    while (parent != scrollView) {
        if (!parent)
            throw new Error('Actor not in scroll view');

        let box = parent.get_allocation_box();
        y1 += box.y1;
        y2 += box.y1;
        x1 += box.x1;
        x2 += box.x1;
        parent = parent.get_parent();
    }

    if (y1 < vValue + vOffset)
        vValue = Math.max(0, y1 - vOffset);
    else if (vValue < vUpper - vPageSize && y2 > vValue + vPageSize - vOffset)
        vValue = Math.min(vUpper -vPageSize, y2 + vOffset - vPageSize);

    if (x1 < hValue + hOffset)
        hValue = Math.max(0, x1 - hOffset);
    else if (hValue < hUpper - hPageSize && x2 > hValue + hPageSize - hOffset)
        hValue = Math.min(hUpper - hPageSize, x2 + hOffset - hPageSize);

    if (vValue !== vValue0) {
        vAdjustment.ease(vValue, {
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Util.SCROLL_TIME
        });
    }

    if (hValue !== hValue0) {
        hAdjustment.ease(hValue, {
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Util.SCROLL_TIME
        });
    }

    return [hValue - hValue0, vValue - vValue0];
}
