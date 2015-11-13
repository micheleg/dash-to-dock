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

let DASH_ANIMATION_TIME = Dash.DASH_ANIMATION_TIME;
let DASH_ITEM_LABEL_SHOW_TIME = Dash.DASH_ITEM_LABEL_SHOW_TIME;
let DASH_ITEM_LABEL_HIDE_TIME = Dash.DASH_ITEM_LABEL_HIDE_TIME;
let DASH_ITEM_HOVER_TIMEOUT = Dash.DASH_ITEM_HOVER_TIMEOUT;

/* Return the actual position reverseing left and right in rtl */
function getPosition(settings) {
    let position = settings.get_enum('dock-position');
    if(Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        if (position == St.Side.LEFT)
            position = St.Side.RIGHT;
        else if (position == St.Side.RIGHT)
            position = St.Side.LEFT;
    }
    return position;
}

/**
 * Extend AppIconMenu
 *
 * - Pass settings to the constructor
 * - set popup arrow side based on dash orientation
 * - Add close windows option based on quitfromdash extension
 *   (https://github.com/deuill/shell-extension-quitfromdash)
 */

const myAppIconMenu = new Lang.Class({
    Name: 'myAppIconMenu',
    Extends: AppDisplay.AppIconMenu,

    _init: function(source, settings) {

        let side = getPosition(settings);

        // Damm it, there has to be a proper way of doing this...
        // As I can't call the parent parent constructor (?) passing the side
        // parameter, I overwite what I need later
        this.parent(source);

        // Change the initialized side where required.
        this._arrowSide = side;
        this._boxPointer._arrowSide = side;
        this._boxPointer._userArrowSide = side;
    },

    // helper function for the quit windows abilities
    _closeWindowInstance: function(metaWindow) {
        metaWindow.delete(global.get_current_time());
    },

    _redisplay: function() {

        this.parent();

        // quit menu
        let app = this._source.app;
        let count = getAppInterestingWindows(app).length;
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
                let windows = app.get_windows();
                for (let i = 0; i < windows.length; i++) {
                    this._closeWindowInstance(windows[i])
                }
            }));
        }
    }
});

/**
 * Extend DashItemContainer
 *
 * - Pass settings to the constructor
 * - set label position based on dash orientation
 *
 *  I can't subclass the original object because of this: https://bugzilla.gnome.org/show_bug.cgi?id=688973.
 *  thus use this ugly pattern.
 */

// define first this function to use it in both extendShowAppsIcon and extendDashItemContainer
function ItemShowLabel()  {
    if (!this._labelText) {
      return;
    }

    this.label.set_text(this._labelText);
    this.label.opacity = 0;
    this.label.show();

    let [stageX, stageY] = this.get_transformed_position();
    let node = this.label.get_theme_node();

    let itemWidth  = this.allocation.x2 - this.allocation.x1;
    let itemHeight = this.allocation.y2 - this.allocation.y1;


    let labelWidth = this.label.get_width();
    let labelHeight = this.label.get_height();

    let x, y, xOffset, yOffset;

    let position = getPosition(this._dtdSettings);
      this._isHorizontal = ( position == St.Side.TOP ||
                             position == St.Side.BOTTOM);
    let labelOffset = node.get_length('-x-offset');

    switch(position) {
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
    let gap = 5;
    let monitor = Main.layoutManager.findMonitorForActor(this);
    if ( x - monitor.x<gap)
        x+= monitor.x - x + labelOffset;
    else if ( x + labelWidth > monitor.x + monitor.width - gap)
        x-= x + labelWidth -( monitor.x + monitor.width) + gap;

    this.label.set_position(x, y);
    Tweener.addTween(this.label,
      { opacity: 255,
        time: DASH_ITEM_LABEL_SHOW_TIME,
        transition: 'easeOutQuad',
      });
};

function extendDashItemContainer(dashItemContainer, settings) {

    dashItemContainer._dtdSettings = settings;
    dashItemContainer.showLabel = ItemShowLabel;
};

/*
 * A menu for the showAppsIcon
*/
const myShowAppsIconMenu = new Lang.Class({

    Name: 'dashToDockShowAppsIconMenu',
    Extends: myAppIconMenu,

    _redisplay: function() {
        this.removeAll();

        let item = this._appendMenuItem("Dash to Dock " + _("Settings"));

        item.connect('activate', function () {
            Util.spawn(["gnome-shell-extension-prefs", Me.metadata.uuid]);
        });
    }

});

/**
 * Extend ShowAppsIcon
 *
 * - Pass settings to the constructor
 * - set label position based on dash orientation
 * - implement a popupMenu based on the AppIcon code
 *
 *  I can't subclass the original object because of this: https://bugzilla.gnome.org/show_bug.cgi?id=688973.
 *  thus use this ugly pattern.
 */

function extendShowAppsIcon(showAppsIcon, settings){


      showAppsIcon._dtdSettings = settings;
      /* the variable equivalent to toggleButton has a different name in the appIcon class
       (actor): duplicate reference to easily reuse appIcon methods */
      showAppsIcon.actor =  showAppsIcon.toggleButton;

      // Re-use appIcon methods
      showAppsIcon._removeMenuTimeout = AppDisplay.AppIcon.prototype._removeMenuTimeout;
      showAppsIcon._setPopupTimeout = AppDisplay.AppIcon.prototype._setPopupTimeout;
      showAppsIcon._onButtonPress = AppDisplay.AppIcon.prototype._onButtonPress;
      showAppsIcon._onKeyboardPopupMenu = AppDisplay.AppIcon.prototype._onKeyboardPopupMenu;
      showAppsIcon._onLeaveEvent = AppDisplay.AppIcon.prototype._onLeaveEvent;
      showAppsIcon._onTouchEvent = AppDisplay.AppIcon.prototype._onTouchEvent;
      showAppsIcon._onMenuPoppedDown = AppDisplay.AppIcon.prototype._onMenuPoppedDown;


      // No action on clicked (showing of the appsview is controlled elsewhere)
      showAppsIcon._onClicked = function(actor, button) {
          showAppsIcon._removeMenuTimeout();
      };


      showAppsIcon.actor.connect('leave-event', Lang.bind( showAppsIcon, showAppsIcon._onLeaveEvent));
      showAppsIcon.actor.connect('button-press-event', Lang.bind( showAppsIcon, showAppsIcon._onButtonPress));
      showAppsIcon.actor.connect('touch-event', Lang.bind( showAppsIcon,  showAppsIcon._onTouchEvent));
      showAppsIcon.actor.connect('clicked', Lang.bind( showAppsIcon, showAppsIcon._onClicked));
      showAppsIcon.actor.connect('popup-menu', Lang.bind( showAppsIcon, showAppsIcon._onKeyboardPopupMenu));

      showAppsIcon._menu = null;
      showAppsIcon._menuManager = new PopupMenu.PopupMenuManager(showAppsIcon);
      showAppsIcon._menuTimeoutId = 0;

  
      showAppsIcon.showLabel = ItemShowLabel;


      showAppsIcon.popupMenu =  function() {

          showAppsIcon._removeMenuTimeout();
          showAppsIcon.actor.fake_release();

          if (!showAppsIcon._menu) {
              showAppsIcon._menu = new myShowAppsIconMenu(showAppsIcon, showAppsIcon._dtdSettings);
              showAppsIcon._menu.connect('open-state-changed', Lang.bind(showAppsIcon, function (menu, isPoppedUp) {
              if (!isPoppedUp)
                  showAppsIcon._onMenuPoppedDown();
              }));
              let id = Main.overview.connect('hiding', Lang.bind(showAppsIcon, function () { showAppsIcon._menu.close(); }));
              showAppsIcon._menu.actor.connect('destroy', function() {
                  Main.overview.disconnect(id);
              });
              showAppsIcon._menuManager.addMenu(showAppsIcon._menu);
          }

          showAppsIcon.emit('menu-state-changed', true);

          showAppsIcon.actor.set_hover(true);
          showAppsIcon._menu.popup();
          showAppsIcon._menuManager.ignoreRelease();
          showAppsIcon.emit('sync-tooltip');

          return false;
      };

      Signals.addSignalMethods(showAppsIcon);
}

/* This class is a fork of the upstream DashActor class (ui.dash.js)
 *
 * Summary of changes:
 * - passed settings to class as parameter
 * - modified chldBox calculations for when 'show-apps-at-top' option is checked
 * - handle horizontal dash
 */
const myDashActor = new Lang.Class({
    Name: 'DashToDockmyDashActor',

    _init: function(settings) {
        this._dtdSettings = settings;
        this._rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        this._position = getPosition(settings);
        this._isHorizontal = ( this._position == St.Side.TOP ||
                               this._position == St.Side.BOTTOM );

        let layout = new Clutter.BoxLayout({ orientation:
          this._isHorizontal?Clutter.Orientation.HORIZONTAL:Clutter.Orientation.VERTICAL });

        this.actor = new Shell.GenericContainer({ name: 'dash',
                      layout_manager: layout,
                      clip_to_allocation: true });
        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));

        this.actor._delegate = this;

    },

    _allocate: function(actor, box, flags) {
        let contentBox = box;
        let availWidth = contentBox.x2 - contentBox.x1;
        let availHeight = contentBox.y2 - contentBox.y1;

        let [appIcons, showAppsButton] = actor.get_children();
        let [showAppsMinHeight, showAppsNatHeight] = showAppsButton.get_preferred_height(availWidth);
        let [showAppsMinWidth, showAppsNatWidth] = showAppsButton.get_preferred_width(availHeight);

        let offset_x = this._isHorizontal?showAppsNatWidth:0;
        let offset_y = this._isHorizontal?0:showAppsNatHeight;

        let childBox = new Clutter.ActorBox();
        if( (this._dtdSettings.get_boolean('show-apps-at-top') && !this._isHorizontal)
            || (this._dtdSettings.get_boolean('show-apps-at-top') && !this._rtl)
            || (!this._dtdSettings.get_boolean('show-apps-at-top') && this._isHorizontal && this._rtl)
          ) {
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
    },

    _getPreferredWidth: function(actor, forHeight, alloc) {
        // We want to request the natural height of all our children
        // as our natural height, so we chain up to StWidget (which
        // then calls BoxLayout), but we only request the showApps
        // button as the minimum size

        let [, natWidth] = this.actor.layout_manager.get_preferred_width(this.actor, forHeight);

        let themeNode = this.actor.get_theme_node();
        let [, showAppsButton] = this.actor.get_children();
        let [minWidth, ] = showAppsButton.get_preferred_height(forHeight);

        alloc.min_size = minWidth;
        alloc.natural_size = natWidth;

    },

    _getPreferredHeight: function(actor, forWidth, alloc) {
        // We want to request the natural height of all our children
        // as our natural height, so we chain up to StWidget (which
        // then calls BoxLayout), but we only request the showApps
        // button as the minimum size

        let [, natHeight] = this.actor.layout_manager.get_preferred_height(this.actor, forWidth);

        let themeNode = this.actor.get_theme_node();
        let [, showAppsButton] = this.actor.get_children();
        let [minHeight, ] = showAppsButton.get_preferred_height(forWidth);

        alloc.min_size = minHeight;
        alloc.natural_size = natHeight;
    }
});

/* This class is a fork of the upstream dash class (ui.dash.js)
 *
 * Summary of changes:
 * - disconnect global signals adding a destroy method;
 * - play animations even when not in overview mode
 * - set a maximum icon size
 * - show running and/or favorite applications
 * - emit a custom signal when an app icon is added
 * - hide showApps label when the custom menu is shown.
 * - Add scrollview
 *   Ensure actor is visible on keyfocus inseid the scrollview
 * - add 128px icon size, might be usefull for hidpi display
 * - Sync minimization application target position.
 */

const baseIconSizes = [ 16, 22, 24, 32, 48, 64, 96, 128 ];

const myDash = new Lang.Class({
    Name: 'dashToDock.myDash',

    _init : function(settings) {
        this._maxHeight = -1;
        this.iconSize = 64;
        this._availableIconSizes = baseIconSizes;
        this._shownInitially = false;

        this._dtdSettings = settings;
        this._position = getPosition(settings);
        this._isHorizontal = ( this._position == St.Side.TOP ||
                               this._position == St.Side.BOTTOM );
        this._signalsHandler = new Convenience.GlobalSignalsHandler();

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;
        this._showLabelTimeoutId = 0;
        this._resetHoverTimeoutId = 0;
        this._ensureAppIconVisibilityTimeoutId = 0;
        this._labelShowing = false;

        this._containerObject = new myDashActor(settings);
        this._container = this._containerObject.actor;
        this._scrollView = new St.ScrollView({ name: 'dashtodockDashScrollview',
                                               hscrollbar_policy: Gtk.PolicyType.NEVER,
                                               vscrollbar_policy: Gtk.PolicyType.NEVER,
                                               enable_mouse_scrolling: false });

        this._scrollView.connect('scroll-event', Lang.bind(this, this._onScrollEvent ));

        this._box = new St.BoxLayout({ vertical: !this._isHorizontal,
                                       clip_to_allocation: false,
                                       x_align: Clutter.ActorAlign.START,
                                       y_align: Clutter.ActorAlign.START });
        this._box._delegate = this;
        this._container.add_actor(this._scrollView);
        this._scrollView.add_actor(this._box);

        this._showAppsIcon = new Dash.ShowAppsIcon();
        extendShowAppsIcon(this._showAppsIcon, this._dtdSettings);
        this._showAppsIcon.childScale = 1;
        this._showAppsIcon.childOpacity = 255;
        this._showAppsIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(this._showAppsIcon);


        let appsIcon = this._showAppsIcon;
        appsIcon.connect('menu-state-changed',
            Lang.bind(this, function(appsIcon, opened) {
                this._itemMenuStateChanged(appsIcon, opened);
            }));

        this.showAppsButton = this._showAppsIcon.toggleButton;

        this._container.add_actor(this._showAppsIcon);

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;
        this.actor = new St.Bin({ child: this._container,
            y_align: St.Align.START, x_align:rtl?St.Align.END:St.Align.START
        });

        if(this._isHorizontal) {
            this.actor.connect('notify::width', Lang.bind(this,
                function() {
                    if (this._maxHeight != this.actor.width)
                        this._queueRedisplay();
                    this._maxHeight = this.actor.width;
                }));
        } else {
            this.actor.connect('notify::height', Lang.bind(this,
                function() {
                    if (this._maxHeight != this.actor.height)
                        this._queueRedisplay();
                    this._maxHeight = this.actor.height;
                }));
        }

        // Update minimization animation target position on allocation of the
        // container and on scrollview change.
        this._box.connect('notify::allocation', Lang.bind(this, this._updateAppIconsGeometry));
        let scrollViewAdjustment = this._isHorizontal?this._scrollView.hscroll.adjustment:this._scrollView.vscroll.adjustment;
        scrollViewAdjustment.connect('notify::value', Lang.bind(this, this._updateAppIconsGeometry));

        this._workId = Main.initializeDeferredWork(this._box, Lang.bind(this, this._redisplay));

        this._settings = new Gio.Settings({ schema_id: 'org.gnome.shell' });

        this._appSystem = Shell.AppSystem.get_default();

        this._signalsHandler.add(
            [
                this._appSystem,
                'installed-changed',
                Lang.bind(this, function() {
                    AppFavorites.getAppFavorites().reload();
                    this._queueRedisplay();
                })
            ],
            [
                AppFavorites.getAppFavorites(),
                'changed',
                Lang.bind(this, this._queueRedisplay)
            ],
            [
                this._appSystem,
                'app-state-changed',
                Lang.bind(this, this._queueRedisplay)
            ],
            [
                Main.overview,
                'item-drag-begin',
                Lang.bind(this, this._onDragBegin)
            ],
            [
                Main.overview,
                'item-drag-end',
                Lang.bind(this, this._onDragEnd)
            ],
            [
                Main.overview,
                'item-drag-cancelled',
                Lang.bind(this, this._onDragCancelled)
            ]
        );

    },

    destroy: function() {
        this._signalsHandler.destroy();
    },

    _onScrollEvent: function(actor, event) {

        // If scroll is not used because the icon is resized, let the scroll event propagate.
        if (!this._dtdSettings.get_boolean('icon-size-fixed'))
          return Clutter.EVENT_PROPAGATE;

        // Event coordinates are relative to the stage but can be transformed
        // as the actor will only receive events within his bounds.
        let stage_x, stage_y, ok, event_x, event_y, actor_w, actor_h;
        [stage_x, stage_y] = event.get_coords();
        [ok, event_x, event_y] = actor.transform_stage_point(stage_x, stage_y);
        [actor_w, actor_h] = actor.get_size();

        // If the scroll event is within a 1px margin from
        // the relevant edge of the actor, let the event propagate.
        if ((this._position == St.Side.LEFT && event_x <= 1)
            || (this._position == St.Side.RIGHT && event_x >= actor_w - 2)
            || (this._position == St.Side.TOP && event_y <= 1)
            || (this._position == St.Side.BOTTOM && event_y >= actor_h - 2))
            return Clutter.EVENT_PROPAGATE;
            
        // reset timeout to avid conflicts with the mousehover event
        if (this._ensureAppIconVisibilityTimeoutId>0) {
            Mainloop.source_remove(this._ensureAppIconVisibilityTimeoutId);
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

        switch ( event.get_scroll_direction() ) {
        case Clutter.ScrollDirection.UP:
            delta = -increment;
            break;
        case Clutter.ScrollDirection.DOWN:
            delta = +increment;
            break;
        case Clutter.ScrollDirection.SMOOTH:
            let [dx, dy] = event.get_scroll_delta();
            delta = dy*increment;
            // Also consider horizontal component, for instance touchpad
            if (this._isHorizontal)
                delta += dx*increment;
            break;

        }

        adjustment.set_value(adjustment.get_value() + delta);

        return Clutter.EVENT_STOP;

    },

    _onDragBegin: function() {
        this._dragCancelled = false;
        this._dragMonitor = {
            dragMotion: Lang.bind(this, this._onDragMotion)
        };
        DND.addDragMonitor(this._dragMonitor);

        if (this._box.get_n_children() == 0) {
            this._emptyDropTarget = new Dash.EmptyDropTargetItem();
            this._box.insert_child_at_index(this._emptyDropTarget, 0);
            this._emptyDropTarget.show(true);
        }
    },

    _onDragCancelled: function() {
        this._dragCancelled = true;
        this._endDrag();
    },

    _onDragEnd: function() {
        if (this._dragCancelled)
            return;

        this._endDrag();
    },

    _endDrag: function() {
        this._clearDragPlaceholder();
        this._clearEmptyDropTarget();
        this._showAppsIcon.setDragApp(null);
        DND.removeDragMonitor(this._dragMonitor);
    },

    _onDragMotion: function(dragEvent) {
        let app = Dash.getAppFromSource(dragEvent.source);
        if (app == null)
            return DND.DragMotionResult.CONTINUE;

        let showAppsHovered =
                this._showAppsIcon.contains(dragEvent.targetActor);

        if (!this._box.contains(dragEvent.targetActor) || showAppsHovered)
            this._clearDragPlaceholder();

        if (showAppsHovered)
            this._showAppsIcon.setDragApp(app);
        else
            this._showAppsIcon.setDragApp(null);

        return DND.DragMotionResult.CONTINUE;
    },

    _appIdListToHash: function(apps) {
        let ids = {};
        for (let i = 0; i < apps.length; i++)
            ids[apps[i].get_id()] = apps[i];
        return ids;
    },

    _queueRedisplay: function () {
        Main.queueDeferredWork(this._workId);
    },

    _hookUpLabel: function(item, appIcon) {
        item.child.connect('notify::hover', Lang.bind(this, function() {
            this._syncLabel(item, appIcon);
        }));

        let id = Main.overview.connect('hiding', Lang.bind(this, function() {
            this._labelShowing = false;
            item.hideLabel();
        }));
        item.child.connect('destroy', function() {
            Main.overview.disconnect(id);
        });

        if (appIcon) {
            appIcon.connect('sync-tooltip', Lang.bind(this, function() {
                this._syncLabel(item, appIcon);
            }));
        }
    },

    _createAppItem: function(app) {
        let appIcon = new myAppIcon(this._dtdSettings, app,
                                             { setSizeManually: true,
                                               showLabel: false });
        if (appIcon._draggable) {
            appIcon._draggable.connect('drag-begin',
                                       Lang.bind(this, function() {
                                           appIcon.actor.opacity = 50;
                                       }));
            appIcon._draggable.connect('drag-end',
                                       Lang.bind(this, function() {
                                           appIcon.actor.opacity = 255;
                                       }));
        }

        appIcon.connect('menu-state-changed',
                        Lang.bind(this, function(appIcon, opened) {
                            this._itemMenuStateChanged(item, opened);
                        }));

        let item = new Dash.DashItemContainer();

        extendDashItemContainer(item, this._dtdSettings);
        item.setChild(appIcon.actor);


        item.setChild(appIcon.actor);
        appIcon.actor.connect('notify::hover', Lang.bind(this, function() {
            if (appIcon.actor.hover){
                this._ensureAppIconVisibilityTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, function(){
                    ensureActorVisibleInScrollView(this._scrollView, appIcon.actor);
                    this._ensureAppIconVisibilityTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }));
            } else {
                if (this._ensureAppIconVisibilityTimeoutId>0) {
                    Mainloop.source_remove(this._ensureAppIconVisibilityTimeoutId);
                    this._ensureAppIconVisibilityTimeoutId = 0;
                }
            }
        }));

        appIcon.actor.connect('clicked',
            Lang.bind(this, function(actor) {
                ensureActorVisibleInScrollView(this._scrollView, actor);
        }));

        appIcon.actor.connect('key-focus-in',
            Lang.bind(this, function(actor) {

                let [x_shift, y_shift] = ensureActorVisibleInScrollView(this._scrollView, actor);

                // This signal is triggered also by mouse click. The popup menu is opened at the original
                // coordinates. Thus correct for the shift which is going to be applied to the scrollview.
                if (appIcon._menu) {
                    appIcon._menu._boxPointer.xOffset = -x_shift;
                    appIcon._menu._boxPointer.yOffset = -y_shift;
                }
        }));

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.actor.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    },

    // Return an array with the "proper" appIcons currently in the dash
    _getAppIcons: function() {
        // Only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.icon &&
                   !actor.animatingOut;
        });

        let appIcons = iconChildren.map(function(actor){
            return actor.child._delegate;
        });

      return appIcons;
    },

    _updateAppIconsGeometry: function() {
        let appIcons = this._getAppIcons();
        appIcons.forEach(function(icon){
            icon.updateIconGeometry();
        });
    },

    _itemMenuStateChanged: function(item, opened) {
        // When the menu closes, it calls sync_hover, which means
        // that the notify::hover handler does everything we need to.
        if (opened) {
            if (this._showLabelTimeoutId > 0) {
                Mainloop.source_remove(this._showLabelTimeoutId);
                this._showLabelTimeoutId = 0;
            }

            item.hideLabel();
        } else {
            // I want to listen from outside when a menu is closed. I used to
            // add a custom signal to the appIcon, since gnome 3.8 the signal
            // calling this callback was added upstream.
            this.emit('menu-closed');
        }
    },

    _syncLabel: function (item, appIcon) {
        let shouldShow = appIcon ? appIcon.shouldShowTooltip() : item.child.get_hover();

        if (shouldShow) {
            if (this._showLabelTimeoutId == 0) {
                let timeout = this._labelShowing ? 0 : DASH_ITEM_HOVER_TIMEOUT;
                this._showLabelTimeoutId = Mainloop.timeout_add(timeout,
                    Lang.bind(this, function() {
                        this._labelShowing = true;
                        item.showLabel();
                        this._showLabelTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }));
                GLib.Source.set_name_by_id(this._showLabelTimeoutId, '[gnome-shell] item.showLabel');
                if (this._resetHoverTimeoutId > 0) {
                    Mainloop.source_remove(this._resetHoverTimeoutId);
                    this._resetHoverTimeoutId = 0;
                }
            }
        } else {
            if (this._showLabelTimeoutId > 0)
                Mainloop.source_remove(this._showLabelTimeoutId);
            this._showLabelTimeoutId = 0;
            item.hideLabel();
            if (this._labelShowing) {
                this._resetHoverTimeoutId = Mainloop.timeout_add(DASH_ITEM_HOVER_TIMEOUT,
                    Lang.bind(this, function() {
                        this._labelShowing = false;
                        this._resetHoverTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }));
                GLib.Source.set_name_by_id(this._resetHoverTimeoutId, '[gnome-shell] this._labelShowing');
            }
        }
    },

    _adjustIconSize: function() {
        // For the icon size, we only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.icon &&
                   !actor.animatingOut;
        });

        iconChildren.push(this._showAppsIcon);

        if (this._maxHeight == -1)
            return;

        let themeNode = this._container.get_theme_node();
        let maxAllocation = new Clutter.ActorBox({ x1: 0, y1: 0,
                                                   x2: this._isHorizontal?this._maxHeight:42 /* whatever */,
                                                   y2: this._isHorizontal?42:this._maxHeight });
        let maxContent = themeNode.get_content_box(maxAllocation);
        let availHeight;
        if (this._isHorizontal)
            availHeight = maxContent.x2 - maxContent.x1;
        else
            availHeight = maxContent.y2 - maxContent.y1;
        let spacing = themeNode.get_length('spacing');

        let firstButton = iconChildren[0].child;
        let firstIcon = firstButton._delegate.icon;

        let minHeight, natHeight, maxWidth, natWidth;

        // Enforce the current icon size during the size request
        firstIcon.setIconSize(this.iconSize);
        [minHeight, natHeight] = firstButton.get_preferred_height(-1);
        [minWidth, natWidth] = firstButton.get_preferred_width(-1);

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let iconSizes = this._availableIconSizes.map(function(s) {
            return s * scaleFactor;
        });

        // Subtract icon padding and box spacing from the available height
        if(this._isHorizontal){
            availHeight -= iconChildren.length * (natWidth - this.iconSize * scaleFactor) +
                           (iconChildren.length - 1) * spacing;
        } else {
            availHeight -= iconChildren.length * (natHeight - this.iconSize * scaleFactor) +
                           (iconChildren.length - 1) * spacing;
        }

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
            let icon = iconChildren[i].child._delegate.icon;

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

            Tweener.addTween(icon.icon,
                             { width: targetWidth,
                               height: targetHeight,
                               time: DASH_ANIMATION_TIME,
                               transition: 'easeOutQuad',
                             });
        }
    },

    _redisplay: function () {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();

        let children = this._box.get_children().filter(function(actor) {
                return actor.child &&
                       actor.child._delegate &&
                       actor.child._delegate.app;
            });
        // Apps currently in the dash
        let oldApps = children.map(function(actor) {
                return actor.child._delegate.app;
            });
        // Apps supposed to be in the dash
        let newApps = [];

        if( this._dtdSettings.get_boolean('show-favorites') ) {
            for (let id in favorites)
                newApps.push(favorites[id]);
        }

        if( this._dtdSettings.get_boolean('show-running') ) {
            for (let i = 0; i < running.length; i++) {
                let app = running[i];
                if (this._dtdSettings.get_boolean('show-favorites') && (app.get_id() in favorites) )
                    continue;
                newApps.push(app);
            }
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
            // No change at oldIndex/newIndex
            if (oldApps[oldIndex] == newApps[newIndex]) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApps[oldIndex] &&
                newApps.indexOf(oldApps[oldIndex]) == -1) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApps[newIndex] &&
                oldApps.indexOf(newApps[newIndex]) == -1) {
                addedItems.push({ app: newApps[newIndex],
                                  item: this._createAppItem(newApps[newIndex]),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let insertHere = newApps[newIndex + 1] &&
                             newApps[newIndex + 1] == oldApps[oldIndex];
            let alreadyRemoved = removedActors.reduce(function(result, actor) {
                let removedApp = actor.child._delegate.app;
                return result || removedApp == newApps[newIndex];
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApps[newIndex]);
                addedItems.push({ app: newApps[newIndex],
                                  item: newItem,
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
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

        for (let i = 0; i < addedItems.length; i++){
            // Emit a custom signal notifying that a new item has been added
            this.emit('item-added', addedItems[i]);
        }

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once

        let animate = this._shownInitially &&
            !Main.overview.animationInProgress;

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++) {
            addedItems[i].item.show(animate);
        }

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this._box.queue_relayout();

        // This is required for icon reordering when the scrollview is used.
        this._updateAppIconsGeometry();
    },

    setIconSize: function (max_size, doNotAnimate) {

        let max_allowed = baseIconSizes[baseIconSizes.length-1];
        max_size = Math.min(max_size, max_allowed);

        if (this._dtdSettings.get_boolean('icon-size-fixed')) {
            this._availableIconSizes = [ max_size ];
        } else {
            this._availableIconSizes = baseIconSizes.filter(
                function(val){
                    return (val<max_size);
                }
            );
            this._availableIconSizes.push(max_size);
        }

        if (doNotAnimate)
            this._shownInitially = false;

        this._queueRedisplay();

    },

    // Reset the displayed apps icon to mantain the correct order when changing
    // show favorites/show running settings
    resetAppIcons : function() {

        let children = this._box.get_children().filter(function(actor) {
            return actor.child &&
                actor.child._delegate &&
                actor.child._delegate.icon;
        });
        for (let i = 0; i < children.length; i++) {
            let item = children[i];
            item.destroy();
        }

        // to avoid ugly animations, just suppress them like when dash is first loaded.
        this._shownInitially = false;
        this._redisplay();

    },

    _clearDragPlaceholder: function() {
        if (this._dragPlaceholder) {
            this._animatingPlaceholdersCount++;
            this._dragPlaceholder.animateOutAndDestroy();
            this._dragPlaceholder.connect('destroy',
                Lang.bind(this, function() {
                    this._animatingPlaceholdersCount--;
                }));
            this._dragPlaceholder = null;
        }
        this._dragPlaceholderPos = -1;
    },

    _clearEmptyDropTarget: function() {
        if (this._emptyDropTarget) {
            this._emptyDropTarget.animateOutAndDestroy();
            this._emptyDropTarget = null;
        }
    },

    handleDragOver : function(source, actor, x, y, time) {

        let app = Dash.getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        if (!this._settings.is_writable('favorite-apps') || !this._dtdSettings.get_boolean('show-favorites'))
            return DND.DragMotionResult.NO_DROP;

        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

        let children = this._box.get_children();
        let numChildren = children.length;
        let boxHeight = 0;
        for (let i = 0; i < numChildren; i++) {
            boxHeight += this._isHorizontal?children[i].width:children[i].height;
        }

        // Keep the placeholder out of the index calculation; assuming that
        // the remove target has the same size as "normal" items, we don't
        // need to do the same adjustment there.
        if (this._dragPlaceholder) {
            boxHeight -= this._isHorizontal?this._dragPlaceholder.width:this._dragPlaceholder.height;
            numChildren--;
        }

        let pos;
        if (!this._emptyDropTarget){
            pos = Math.floor((this._isHorizontal?x:y) * numChildren / boxHeight);
            if (pos >  numChildren)
                pos = numChildren;
        } else
            pos = 0; // always insert at the top when dash is empty

        /* Take into account childredn position in rtl*/
        if (this._isHorizontal &&
          Clutter.get_default_text_direction() == Clutter.TextDirection.RTL
          )
            pos = numChildren - pos;

        if (pos != this._dragPlaceholderPos && pos <= numFavorites && this._animatingPlaceholdersCount == 0) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (favPos != -1 && (pos == favPos || pos == favPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            }

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new Dash.DragPlaceholderItem();
            this._dragPlaceholder.child.set_width (this.iconSize);
            this._dragPlaceholder.child.set_height (this.iconSize / 2);
            this._box.insert_child_at_index(this._dragPlaceholder,
                                            this._dragPlaceholderPos);
            this._dragPlaceholder.show(fadeIn);
            // Ensure the next and previous icon are visible when moving the placeholder
            // (I assume there's room for both of them)
            if (this._dragPlaceholderPos > 1)
                ensureActorVisibleInScrollView(this._scrollView, this._box.get_children()[this._dragPlaceholderPos-1]);
            if (this._dragPlaceholderPos < this._box.get_children().length-1)
                ensureActorVisibleInScrollView(this._scrollView, this._box.get_children()[this._dragPlaceholderPos+1]);
        }

        // Remove the drag placeholder if we are not in the
        // "favorites zone"
        if (pos > numFavorites)
            this._clearDragPlaceholder();

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        let srcIsFavorite = (favPos != -1);

        if (srcIsFavorite)
            return DND.DragMotionResult.MOVE_DROP;

        return DND.DragMotionResult.COPY_DROP;
    },

    // Draggable target interface
    acceptDrop : function(source, actor, x, y, time) {

        let app = Dash.getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed()) {
            return false;
        }

        if (!this._settings.is_writable('favorite-apps') || !this._dtdSettings.get_boolean('show-favorites'))
            return false;

        let id = app.get_id();

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let srcIsFavorite = (id in favorites);

        let favPos = 0;
        let children = this._box.get_children();
        for (let i = 0; i < this._dragPlaceholderPos; i++) {
            if (this._dragPlaceholder &&
                children[i] == this._dragPlaceholder)
                continue;

            let childId = children[i].child._delegate.app.get_id();
            if (childId == id)
                continue;
            if (childId in favorites)
                favPos++;
        }

        // No drag placeholder means we don't wan't to favorite the app
        // and we are dragging it to its original position
        if (!this._dragPlaceholder)
            return true;

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                let appFavorites = AppFavorites.getAppFavorites();
                if (srcIsFavorite)
                    appFavorites.moveFavoriteToPos(id, favPos);
                else
                    appFavorites.addFavoriteAtPos(id, favPos);
                return false;
            }));

        return true;
    },

    showShowAppsButton: function() {
        this.showAppsButton.visible = true
        this.showAppsButton.set_width(-1)
        this.showAppsButton.set_height(-1)
    },

    hideShowAppsButton: function() {
        this.showAppsButton.hide()
        this.showAppsButton.set_width(0)
        this.showAppsButton.set_height(0)
    }

});

Signals.addSignalMethods(myDash.prototype);


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

const myAppIcon = new Lang.Class({
    Name: 'dashToDock.AppIcon',
    Extends: AppDisplay.AppIcon,

    // settings are required inside.
    _init: function(settings, app, iconParams, onActivateOverride) {

        this._dtdSettings = settings;
        this._nWindows = 0;

        this.parent(app, iconParams, onActivateOverride);

        // Monitor windows-changes instead of app state.
        // Keep using the same Id and function callback (that is extended)
        if(this._stateChangedId>0){
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

        keys.forEach(function(key){
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

        [rect.x, rect.y] = this.actor.get_transformed_position();
        [rect.width, rect.height] = this.actor.get_transformed_size();

        let windows = this.app.get_windows();
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
                    this._drawCircles(this._dots, getPosition(this._dtdSettings));
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
            this._menu = new myAppIconMenu(this, this._dtdSettings);
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

        if ( !this._dtdSettings.get_boolean('customize-click') ){
            this.parent(button);
            return;
        }

        let event = Clutter.get_current_event();
        let modifiers = event ? event.get_state() : 0;
        let openNewWindow = modifiers & Clutter.ModifierType.CONTROL_MASK &&
                            this.app.state == Shell.AppState.RUNNING ||
                            button && button == 2;
        let focusedApp = tracker.focus_app;

        if (this.app.state == Shell.AppState.STOPPED || openNewWindow)
            this.animateLaunch();

        if(button && button == 1 && this.app.state == Shell.AppState.RUNNING) {

            if(modifiers & Clutter.ModifierType.CONTROL_MASK){
                // Keep default behaviour: launch new window
                // By calling the parent method I make it compatible
                // with other extensions tweaking ctrl + click
                this.parent(button);
                return;

            } else if (this._dtdSettings.get_boolean('minimize-shift') && modifiers & Clutter.ModifierType.SHIFT_MASK){
                // On double click, minimize all windows in the current workspace
                minimizeWindow(this.app, event.get_click_count() > 1);

            } else if(this.app == focusedApp && !Main.overview._shown){

                if(this._dtdSettings.get_enum('click-action') == clickAction.CYCLE_WINDOWS)
                    cycleThroughWindows(this.app);
                else if(this._dtdSettings.get_enum('click-action') == clickAction.MINIMIZE)
                    minimizeWindow(this.app, true);
                else if(this._dtdSettings.get_enum('click-action') == clickAction.LAUNCH)
                    this.app.open_new_window(-1);

            } else {
                // Activate all window of the app or only le last used
                if (this._dtdSettings.get_enum('click-action') == clickAction.CYCLE_WINDOWS && !Main.overview._shown){
                    // If click cycles through windows I can activate one windows at a time
                    let windows = getAppInterestingWindows(this.app);
                    let w = windows[0];
                    Main.activateWindow(w);
                } else if(this._dtdSettings.get_enum('click-action') == clickAction.LAUNCH)
                    this.app.open_new_window(-1);
                else if(this._dtdSettings.get_enum('click-action') == clickAction.MINIMIZE){
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
        this._nWindows = Math.min(getAppInterestingWindows(this.app).length, maxN);

        for(let i = 1; i<=maxN; i++){
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

function minimizeWindow(app, param){
    // Param true make all app windows minimize
    let windows = getAppInterestingWindows(app);
    let current_workspace = global.screen.get_active_workspace();
    for (let i = 0; i < windows.length; i++) {
        let w = windows[i];
        if (w.get_workspace() == current_workspace && w.showing_on_its_workspace()){
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
function activateAllWindows(app){

    // First activate first window so workspace is switched if needed.
    app.activate();

    // then activate all other app windows in the current workspace
    let windows = getAppInterestingWindows(app);
    let activeWorkspace = global.screen.get_active_workspace_index();

    if( windows.length<=0)
        return;

    let activatedWindows = 0;

    for (let i=windows.length-1; i>=0; i--){
        if(windows[i].get_workspace().index() == activeWorkspace){
            Main.activateWindow(windows[i]);
            activatedWindows++;
        }
    }
}

function cycleThroughWindows(app) {

    // Store for a little amount of time last clicked app and its windows
    // since the order changes upon window interaction
    let MEMORY_TIME=3000;

    let app_windows = getAppInterestingWindows(app);

    if(recentlyClickedAppLoopId>0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId = Mainloop.timeout_add(MEMORY_TIME, resetRecentlyClickedApp);

    // If there isn't already a list of windows for the current app,
    // or the stored list is outdated, use the current windows list.
    if( !recentlyClickedApp ||
        recentlyClickedApp.get_id() != app.get_id() ||
        recentlyClickedAppWindows.length != app_windows.length
      ){

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

function getAppInterestingWindows(app) {
    // Filter out unnecessary windows, for instance
    // nautilus desktop window.
    let windows = app.get_windows().filter(function(w) {
        return !w.skip_taskbar;
    });

    return windows;
}


/*
 * This is a copy of the same function in utils.js, but also adjust horizontal scrolling
 * and perform few further cheks on the current value to avoid changing the values when
 * it would be clamp to the current one in any case.
 * Return the amount of shift applied
*/
function ensureActorVisibleInScrollView(scrollView, actor) {

    let adjust_v = true;
    let adjust_h = true;

    let vadjustment = scrollView.vscroll.adjustment;
    let hadjustment = scrollView.hscroll.adjustment;
    let [vvalue, vlower, vupper, vstepIncrement, vpageIncrement, vpageSize] = vadjustment.get_values();
    let [hvalue, hlower, hupper, hstepIncrement, hpageIncrement, hpageSize] = hadjustment.get_values();

    let [hvalue0, vvalue0] = [hvalue, vvalue];

    let voffset = 0;
    let hoffset = 0;
    let fade = scrollView.get_effect("fade");
    if (fade){
        voffset = fade.vfade_offset;
        hoffset = fade.hfade_offset;
    }

    let box = actor.get_allocation_box();
    let y1 = box.y1, y2 = box.y2, x1 = box.x1, x2 = box.x2;

    let parent = actor.get_parent();
    while (parent != scrollView) {
        if (!parent)
            throw new Error("actor not in scroll view");

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
        Tweener.addTween(vadjustment,
                         { value: vvalue,
                           time: Util.SCROLL_TIME,
                           transition: 'easeOutQuad' });
    }

    if (hvalue !== hvalue0) {
        Tweener.addTween(hadjustment,
                         { value: hvalue,
                           time: Util.SCROLL_TIME,
                           transition: 'easeOutQuad' });
    }

    return [hvalue- hvalue0, vvalue - vvalue0];
}
