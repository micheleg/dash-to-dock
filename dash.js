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

/**
 * Extend DashItemContainer
 *
 * - set label position based on dash orientation
 *
 */
let MyDashItemContainer = GObject.registerClass(
class DashToDock_MyDashItemContainer extends Dash.DashItemContainer {

    showLabel() {
        return AppIcons.itemShowLabel.call(this);
    }
});

/**
 * This class is a fork of the upstream DashActor class (ui.dash.js)
 *
 * Summary of changes:
 * - modified chldBox calculations for when 'show-apps-at-top' option is checked
 * - handle horizontal dash
 */
var MyDashActor = GObject.registerClass(
class DashToDock_MyDashActor extends St.Widget {

    _init() {
        // a prefix is required to avoid conflicting with the parent class variable
        this._rtl = (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL);

        this._position = Utils.getPosition();
        this._isHorizontal = ((this._position == St.Side.TOP) ||
                               (this._position == St.Side.BOTTOM));

        let layout = new Clutter.BoxLayout({
            orientation: this._isHorizontal ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL
        });

        super._init({
            name: 'dash',
            layout_manager: layout,
            clip_to_allocation: true,
            ...(this._isHorizontal ? {
                x_align: Clutter.ActorAlign.CENTER,
            } : {
                y_align: Clutter.ActorAlign.CENTER,
            })
        });

        // Since we are usually visible but not usually changing, make sure
        // most repaint requests don't actually require us to repaint anything.
        // This saves significant CPU when repainting the screen.
        this.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
    }

    vfunc_allocate(box, flags) {
        let contentBox = this.get_theme_node().get_content_box(box);
        let availWidth = contentBox.x2 - contentBox.x1;
        let availHeight = contentBox.y2 - contentBox.y1;

        this.set_allocation(box, flags);

        let [appIcons, showAppsButton] = this.get_children();
        let [, showAppsNatHeight] = showAppsButton.get_preferred_height(availWidth);
        let [, showAppsNatWidth] = showAppsButton.get_preferred_width(availHeight);

        let offset_x = this._isHorizontal?showAppsNatWidth:0;
        let offset_y = this._isHorizontal?0:showAppsNatHeight;

        let childBox = new Clutter.ActorBox();
        let settings = Docking.DockManager.settings;
        if ((settings.get_boolean('show-apps-at-top') && !this._isHorizontal)
            || (settings.get_boolean('show-apps-at-top') && !this._rtl)
            || (!settings.get_boolean('show-apps-at-top') && this._isHorizontal && this._rtl)) {
            childBox.x1 = contentBox.x1 + offset_x;
            childBox.y1 = contentBox.y1 + offset_y;
            childBox.x2 = contentBox.x2;
            childBox.y2 = contentBox.y2;
            appIcons.allocate(childBox, flags);

            childBox.y1 = contentBox.y1;
            childBox.x1 = contentBox.x1;
            childBox.x2 = contentBox.x1 + showAppsNatWidth;
            childBox.y2 = contentBox.y1 + showAppsNatHeight;
            showAppsButton.allocate(childBox, flags);
        } else {
            childBox.x1 = contentBox.x1;
            childBox.y1 = contentBox.y1;
            childBox.x2 = contentBox.x2 - offset_x;
            childBox.y2 = contentBox.y2 - offset_y;
            appIcons.allocate(childBox, flags);

            childBox.x2 = contentBox.x2;
            childBox.y2 = contentBox.y2;
            childBox.x1 = contentBox.x2 - showAppsNatWidth;
            childBox.y1 = contentBox.y2 - showAppsNatHeight;
            showAppsButton.allocate(childBox, flags);
        }
    }

    vfunc_get_preferred_width(forHeight) {
        // We want to request the natural width of all our children
        // as our natural width, so we chain up to StWidget (which
        // then calls BoxLayout), but we only request the showApps
        // button as the minimum size

        let [, natWidth] = super.vfunc_get_preferred_width(forHeight);

        let themeNode = this.get_theme_node();
        let adjustedForHeight = themeNode.adjust_for_height(forHeight);
        let [, showAppsButton] = this.get_children();
        let [minWidth] = showAppsButton.get_preferred_width(adjustedForHeight);
        [minWidth] = themeNode.adjust_preferred_width(minWidth, natWidth);

        return [minWidth, natWidth];
    }

    vfunc_get_preferred_height(forWidth) {
        return Dash.DashActor.prototype.vfunc_get_preferred_height.call(this, forWidth);
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
 * - add 128px icon size, might be usefull for hidpi display
 * - sync minimization application target position.
 * - keep running apps ordered.
 */
var MyDash = GObject.registerClass({
    Signals: {
        'menu-closed': {},
        'icon-size-changed': {},
    }
}, class DashToDock_MyDash extends St.Bin {

    _init(remoteModel, monitorIndex) {
        // Initialize icon variables and size
        this._maxHeight = -1;
        this.iconSize = Docking.DockManager.settings.get_int('dash-max-icon-size');
        this._availableIconSizes = baseIconSizes;
        this._shownInitially = false;
        this._initializeIconSize(this.iconSize);

        this._remoteModel = remoteModel;
        this._monitorIndex = monitorIndex;
        this._position = Utils.getPosition();
        this._isHorizontal = ((this._position == St.Side.TOP) ||
                               (this._position == St.Side.BOTTOM));
        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;
        this._showLabelTimeoutId = 0;
        this._resetHoverTimeoutId = 0;
        this._ensureAppIconVisibilityTimeoutId = 0;
        this._labelShowing = false;

        this._container = new MyDashActor();
        this._scrollView = new St.ScrollView({
            name: 'dashtodockDashScrollview',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: false
        });

        this._scrollView.connect('scroll-event', this._onScrollEvent.bind(this));

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;
        this._box = new St.BoxLayout({
            vertical: !this._isHorizontal,
            clip_to_allocation: false,
            x_align: rtl ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START
        });
        this._box._delegate = this;
        this._container.add_actor(this._scrollView);
        this._scrollView.add_actor(this._box);

        // Create a wrapper around the real showAppsIcon in order to add a popupMenu.
        this._showAppsIcon = new AppIcons.MyShowAppsIcon();
        this._showAppsIcon.show();
        this._showAppsIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(this._showAppsIcon);
        this._showAppsIcon.connect('menu-state-changed', (_icon, opened) => {
            this._itemMenuStateChanged(this._showAppsIcon, opened);
        });

        this._container.add_actor(this._showAppsIcon);

        super._init({
            child: this._container,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
        });

        // Update minimization animation target position on allocation of the
        // container and on scrollview change.
        this._box.connect('notify::allocation', this._updateAppsIconGeometry.bind(this));
        let scrollViewAdjustment = this._isHorizontal ? this._scrollView.hscroll.adjustment : this._scrollView.vscroll.adjustment;
        scrollViewAdjustment.connect('notify::value', this._updateAppsIconGeometry.bind(this));

        this._workId = Main.initializeDeferredWork(this._box, this._redisplay.bind(this));

        this._shellSettings = new Gio.Settings({
            schema_id: 'org.gnome.shell'
        });

        this._appSystem = Shell.AppSystem.get_default();

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
            this._onDragBegin.bind(this)
        ], [
            Main.overview,
            'item-drag-end',
            this._onDragEnd.bind(this)
        ], [
            Main.overview,
            'item-drag-cancelled',
            this._onDragCancelled.bind(this)
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
        if (this._isHorizontal && this._maxHeight !== -1 && natWidth > this._maxHeight)
            return [minWidth, this._maxHeight]
        else
            return [minWidth, natWidth]
    }

    _onDestroy() {
        this._signalsHandler.destroy();
    }

    _onDragBegin() {
        return Dash.Dash.prototype._onDragBegin.call(this, ...arguments);
    }

    _onDragCancelled() {
        return Dash.Dash.prototype._onDragCancelled.call(this, ...arguments);
    }

    _onDragEnd() {
        return Dash.Dash.prototype._onDragEnd.call(this, ...arguments);
    }

    _endDrag() {
        return Dash.Dash.prototype._endDrag.call(this, ...arguments);
    }

    _onDragMotion() {
        return Dash.Dash.prototype._onDragMotion.call(this, ...arguments);
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

    setMaxHeight(maxHeight) {
        if (this._maxHeight != maxHeight)
            this._queueRedisplay();
        this._maxHeight = maxHeight;
    }

    handleDragOver(source, actor, x, y, time) {
        let ret;
        if (!this._isHorizontal) {
            Object.defineProperty(this._box, 'height', {
                configurable: true,
                get: () => this._box.get_children().reduce((a, c) => a + c.height, 0),
            });

            ret = Dash.Dash.prototype.handleDragOver.call(this, source, actor, x, y, time);

            delete this._box.height;

            if (ret == DND.DragMotionResult.CONTINUE)
                return ret;
        } else {
            Object.defineProperty(this._box, 'height', {
                configurable: true,
                get: () => this._box.get_children().reduce((a, c) => a + c.width, 0),
            });

            let replacedPlaceholderHeight = false;
            if (this._dragPlaceholder) {
                replacedPlaceholderHeight = true;
                Object.defineProperty(this._dragPlaceholder, 'height', {
                    configurable: true,
                    get: () => this._dragPlaceholder.width,
                });
            }

            ret = Dash.Dash.prototype.handleDragOver.call(this, source, actor, y, x, time);

            delete this._box.height;
            if (replacedPlaceholderHeight && this._dragPlaceholder)
                delete this._dragPlaceholder.height;

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
            if (this._dragPlaceholderPos > 0)
                ensureActorVisibleInScrollView(this._scrollView,
                    this._box.get_children()[this._dragPlaceholderPos - 1]);

            if (this._dragPlaceholderPos < this._box.get_children().length - 1)
                ensureActorVisibleInScrollView(this._scrollView,
                    this._box.get_children()[this._dragPlaceholderPos + 1]);
        }

        return ret;
    }

    acceptDrop() {
        return Dash.Dash.prototype.acceptDrop.call(this, ...arguments);
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
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;

        let adjustment, delta;

        if (this._isHorizontal)
            adjustment = this._scrollView.get_hscroll_bar().get_adjustment();
        else
            adjustment = this._scrollView.get_vscroll_bar().get_adjustment();

        let increment = adjustment.step_increment;

        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            delta = -increment;
            break;
        case Clutter.ScrollDirection.DOWN:
            delta = +increment;
            break;
        case Clutter.ScrollDirection.SMOOTH:
            let [dx, dy] = event.get_scroll_delta();
            delta = dy * increment;
            // Also consider horizontal component, for instance touchpad
            if (this._isHorizontal)
                delta += dx * increment;
            break;
        }

        adjustment.set_value(adjustment.get_value() + delta);

        return Clutter.EVENT_STOP;
    }

    _createAppItem(app) {
        let appIcon = new AppIcons.MyAppIcon(this._remoteModel, app,
            this._monitorIndex);

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

        let item = new MyDashItemContainer();
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

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
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
        let iconChildren = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   !!actor.child.icon &&
                   !actor.animatingOut;
        });

        iconChildren.push(this._showAppsIcon);

        if (this._maxHeight == -1)
            return;

        // Check if the container is present in the stage. This avoids critical
        // errors when unlocking the screen
        if (!this._container.get_stage())
            return;

        let themeNode = this._container.get_theme_node();
        let maxAllocation = new Clutter.ActorBox({
            x1: 0,
            y1: 0,
            x2: this._isHorizontal ? this._maxHeight : 42 /* whatever */,
            y2: this._isHorizontal ? 42 : this._maxHeight
        });
        let maxContent = themeNode.get_content_box(maxAllocation);
        let availHeight;
        if (this._isHorizontal)
            availHeight = maxContent.x2 - maxContent.x1;
        else
            availHeight = maxContent.y2 - maxContent.y1;
        let spacing = themeNode.get_length('spacing');

        let firstButton = iconChildren[0].child;
        let firstIcon = firstButton.icon;

        // Enforce the current icon size during the size request
        firstIcon.setIconSize(this.iconSize);
        let [, natHeight] = firstButton.get_preferred_height(-1);
        let [, natWidth] = firstButton.get_preferred_width(-1);

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let iconSizes = this._availableIconSizes.map(s => s * scaleFactor);

        // Subtract icon padding and box spacing from the available height
        if (this._isHorizontal)
            availHeight -= iconChildren.length * (natWidth - this.iconSize * scaleFactor) +
                           (iconChildren.length - 1) * spacing;
        else
            availHeight -= iconChildren.length * (natHeight - this.iconSize * scaleFactor) +
                           (iconChildren.length - 1) * spacing;

        let availSize = availHeight / iconChildren.length;


        let newIconSize = this._availableIconSizes[0];
        for (let i = 0; i < iconSizes.length; i++) {
            if (iconSizes[i] < availSize)
                newIconSize = this._availableIconSizes[i];
        }

        if (newIconSize == this.iconSize)
            return;

        let oldIconSize = this.iconSize;
        this.iconSize = newIconSize;
        this.emit('icon-size-changed');

        let scale = oldIconSize / newIconSize;
        for (let i = 0; i < iconChildren.length; i++) {
            let icon = iconChildren[i].child.icon || iconChildren[i].icon;

            // Set the new size immediately, to keep the icons' sizes
            // in sync with this.iconSize
            icon.setIconSize(this.iconSize);

            // Don't animate the icon size change when the overview
            // is transitioning, or when initially filling
            // the dash
            if (Main.overview.animationInProgress ||
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
                time: DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        }
    }

    _redisplay() {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();
        let settings = Docking.DockManager.settings;

        if (settings.get_boolean('isolate-workspaces') ||
            settings.get_boolean('isolate-monitors')) {
            // When using isolation, we filter out apps that have no windows in
            // the current workspace
            let monitorIndex = this._monitorIndex;
            running = running.filter(function(_app) {
                return AppIcons.getInterestingWindows(_app, monitorIndex).length != 0;
            });
        }

        let children = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   !!actor.child.app;
        });
        // Apps currently in the dash
        let oldApps = children.map(function(actor) {
            return actor.child.app;
        });
        // Apps supposed to be in the dash
        let newApps = [];

        if (settings.get_boolean('show-favorites')) {
            for (let id in favorites)
                newApps.push(favorites[id]);
        }

        // We reorder the running apps so that they don't change position on the
        // dash with every redisplay() call
        if (settings.get_boolean('show-running')) {
            // First: add the apps from the oldApps list that are still running
            for (let i = 0; i < oldApps.length; i++) {
                let index = running.indexOf(oldApps[i]);
                if (index > -1) {
                    let app = running.splice(index, 1)[0];
                    if (settings.get_boolean('show-favorites') && (app.get_id() in favorites))
                        continue;
                    newApps.push(app);
                }
            }
            // Second: add the new apps
            for (let i = 0; i < running.length; i++) {
                let app = running[i];
                if (settings.get_boolean('show-favorites') && (app.get_id() in favorites))
                    continue;
                newApps.push(app);
            }
        }

        if (settings.get_boolean('show-mounts')) {
            if (!this._removables) {
                this._removables = new Locations.Removables();
                this._signalsHandler.addWithLabel('show-mounts',
                    [ this._removables,
                      'changed',
                      this._queueRedisplay.bind(this) ]);
            }
            Array.prototype.push.apply(newApps, this._removables.getApps());
        } else if (this._removables) {
            this._signalsHandler.removeWithLabel('show-mounts');
            this._removables.destroy();
            this._removables = null;
        }

        if (settings.get_boolean('show-trash')) {
            if (!this._trash) {
                this._trash = new Locations.Trash();
                this._signalsHandler.addWithLabel('show-trash',
                    [ this._trash,
                      'changed',
                      this._queueRedisplay.bind(this) ]);
            }
            newApps.push(this._trash.getApp());
        } else if (this._trash) {
            this._signalsHandler.removeWithLabel('show-trash');
            this._trash.destroy();
            this._trash = null;
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
        while ((newIndex < newApps.length) || (oldIndex < oldApps.length)) {
            // No change at oldIndex/newIndex
            if (oldApps[oldIndex] && oldApps[oldIndex] == newApps[newIndex]) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApps[oldIndex] && (newApps.indexOf(oldApps[oldIndex]) == -1)) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApps[newIndex] && (oldApps.indexOf(newApps[newIndex]) == -1)) {
                let newItem = this._createAppItem(newApps[newIndex]);
                addedItems.push({ app: newApps[newIndex],
                                  item: newItem,
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let insertHere = newApps[newIndex + 1] && (newApps[newIndex + 1] == oldApps[oldIndex]);
            let alreadyRemoved = removedActors.reduce(function(result, actor) {
                let removedApp = actor.child.app;
                return result || removedApp == newApps[newIndex];
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApps[newIndex]);
                addedItems.push({
                    app: newApps[newIndex],
                    item: newItem,
                    pos: newIndex + removedActors.length
                });
                newIndex++;
            }
            else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++)
            this._box.insert_child_at_index(addedItems[i].item,
                                            addedItems[i].pos);

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];

            // Don't animate item removal when the overview is transitioning
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

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this._box.queue_relayout();

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
            }
            else if (counter == 10) {
                icon.setNumberOverlay(0);
                counter++;
            }
            else {
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
     * Reset the displayed apps icon to mantain the correct order when changing
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
        this.showAppsButton.visible = true
        this.showAppsButton.set_width(-1)
        this.showAppsButton.set_height(-1)
    }

    hideShowAppsButton() {
        this.showAppsButton.hide()
        this.showAppsButton.set_width(0)
        this.showAppsButton.set_height(0)
    }
});


/**
 * This is a copy of the same function in utils.js, but also adjust horizontal scrolling
 * and perform few further cheks on the current value to avoid changing the values when
 * it would be clamp to the current one in any case.
 * Return the amount of shift applied
 */
function ensureActorVisibleInScrollView(scrollView, actor) {
    let adjust_v = true;
    let adjust_h = true;

    let vadjustment = scrollView.get_vscroll_bar().get_adjustment();
    let hadjustment = scrollView.get_hscroll_bar().get_adjustment();
    let [vvalue, vlower, vupper, vstepIncrement, vpageIncrement, vpageSize] = vadjustment.get_values();
    let [hvalue, hlower, hupper, hstepIncrement, hpageIncrement, hpageSize] = hadjustment.get_values();

    let [hvalue0, vvalue0] = [hvalue, vvalue];

    let voffset = 0;
    let hoffset = 0;
    let fade = scrollView.get_effect('fade');
    if (fade) {
        voffset = fade.vfade_offset;
        hoffset = fade.hfade_offset;
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

    if (y1 < vvalue + voffset)
        vvalue = Math.max(0, y1 - voffset);
    else if (vvalue < vupper - vpageSize && y2 > vvalue + vpageSize - voffset)
        vvalue = Math.min(vupper -vpageSize, y2 + voffset - vpageSize);

    if (x1 < hvalue + hoffset)
        hvalue = Math.max(0, x1 - hoffset);
    else if (hvalue < hupper - hpageSize && x2 > hvalue + hpageSize - hoffset)
        hvalue = Math.min(hupper - hpageSize, x2 + hoffset - hpageSize);

    if (vvalue !== vvalue0) {
        vadjustment.ease(vvalue, {
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Util.SCROLL_TIME
        });
    }

    if (hvalue !== hvalue0) {
        hadjustment.ease(hvalue, {
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Util.SCROLL_TIME
        });
    }

    return [hvalue- hvalue0, vvalue - vvalue0];
}
