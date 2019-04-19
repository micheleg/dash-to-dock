/*
 * Credits:
 * This file is based on code from the Dash to Panel extension by Jason DeRose
 * and code from the Taskbar extension by Zorin OS
 * Some code was also adapted from the upstream Gnome Shell source code.
 */
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Gtk = imports.gi.Gtk;

const Params = imports.misc.params;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const Workspace = imports.ui.workspace;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const PREVIEW_MAX_WIDTH = 250;
const PREVIEW_MAX_HEIGHT = 150;

const WindowPreviewMenu = new Lang.Class({
    Name: 'WindowPreviewMenu',
    Extends: PopupMenu.PopupMenu,

    _init: function(source, settings) {
        this._dtdSettings = settings;

        let side = Utils.getPosition(settings);

        this.parent(source.actor, 0.5, side);

        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this._source = source;
        this._app = this._source.app;
        let monitorIndex = this._source.monitorIndex;

        this.actor.add_style_class_name('app-well-menu');
        this.actor.set_style('max-width: '  + (Main.layoutManager.monitors[monitorIndex].width  - 22) + 'px; ' +
                             'max-height: ' + (Main.layoutManager.monitors[monitorIndex].height - 22) + 'px;');
        this.actor.hide();

        // Chain our visibility and lifecycle to that of the source
        this._mappedId = this._source.actor.connect('notify::mapped', Lang.bind(this, function () {
            if (!this._source.actor.mapped)
                this.close();
        }));
        this._destroyId = this._source.actor.connect('destroy', Lang.bind(this, this.destroy));

        Main.uiGroup.add_actor(this.actor);

        // Change the initialized side where required.
        this._arrowSide = side;
        this._boxPointer._arrowSide = side;
        this._boxPointer._userArrowSide = side;
    },

    _redisplay: function() {
        if (this._previewBox)
            this._previewBox.destroy();
        this._previewBox = new WindowPreviewList(this._source, this._dtdSettings);
        this.addMenuItem(this._previewBox);
        this._previewBox._redisplay();
    },

    popup: function() {
        let windows = this._source.getInterestingWindows();
        if (windows.length > 0) {
            this._redisplay();
            this.open();
            this.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
            this._source.emit('sync-tooltip');
        }
    },

    destroy: function () {
        if (this._mappedId)
            this._source.actor.disconnect(this._mappedId);

        if (this._destroyId)
            this._source.actor.disconnect(this._destroyId);

        this.parent();
    }

});

const WindowPreviewList = new Lang.Class({
    Name: 'WindowPreviewMenuSection',
    Extends: PopupMenu.PopupMenuSection,

    _init: function(source, settings) {
        this._dtdSettings = settings;

        this.parent();

        this.actor = new St.ScrollView({ name: 'dashtodockWindowScrollview',
                                               hscrollbar_policy: Gtk.PolicyType.NEVER,
                                               vscrollbar_policy: Gtk.PolicyType.NEVER,
                                               enable_mouse_scrolling: true });

        this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent ));

        let position = Utils.getPosition(this._dtdSettings);
        this.isHorizontal = position == St.Side.BOTTOM || position == St.Side.TOP;
        this.box.set_vertical(!this.isHorizontal);
        this.box.set_name('dashtodockWindowList');
        this.actor.add_actor(this.box);
        this.actor._delegate = this;

        this._shownInitially = false;

        this._source = source;
        this.app = source.app;

        this._redisplayId = Main.initializeDeferredWork(this.actor, Lang.bind(this, this._redisplay));

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        this._stateChangedId = this.app.connect('windows-changed',
                                                Lang.bind(this,
                                                          this._queueRedisplay));
    },

    _queueRedisplay: function () {
        Main.queueDeferredWork(this._redisplayId);
    },

    _onScrollEvent: function(actor, event) {
        // Event coordinates are relative to the stage but can be transformed
        // as the actor will only receive events within his bounds.
        let stage_x, stage_y, ok, event_x, event_y, actor_w, actor_h;
        [stage_x, stage_y] = event.get_coords();
        [ok, event_x, event_y] = actor.transform_stage_point(stage_x, stage_y);
        [actor_w, actor_h] = actor.get_size();

        // If the scroll event is within a 1px margin from
        // the relevant edge of the actor, let the event propagate.
        if (event_y >= actor_h - 2)
            return Clutter.EVENT_PROPAGATE;

        // Skip to avoid double events mouse
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;

        let adjustment, delta;

        if (this.isHorizontal)
            adjustment = this.actor.get_hscroll_bar().get_adjustment();
        else
            adjustment = this.actor.get_vscroll_bar().get_adjustment();

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
            delta += dx*increment;
            break;

        }

        adjustment.set_value(adjustment.get_value() + delta);

        return Clutter.EVENT_STOP;
    },

    _onDestroy: function() {
        this.app.disconnect(this._stateChangedId);
        this._stateChangedId = 0;
    },

    _createPreviewItem: function(window) {
        let preview = new WindowPreviewMenuItem(window);
        return preview;
    },

    _redisplay: function () {
        let children = this._getMenuItems().filter(function(actor) {
                return actor._window;
            });

        // Windows currently on the menu
        let oldWin = children.map(function(actor) {
                return actor._window;
            });

        // All app windows with a static order
        let newWin = this._source.getInterestingWindows().sort(function(a, b) {
            return a.get_stable_sequence() > b.get_stable_sequence();
        });

        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;

        while (newIndex < newWin.length || oldIndex < oldWin.length) {
            // No change at oldIndex/newIndex
            if (oldWin[oldIndex] &&
                oldWin[oldIndex] == newWin[newIndex]) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // Window removed at oldIndex
            if (oldWin[oldIndex] &&
                newWin.indexOf(oldWin[oldIndex]) == -1) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // Window added at newIndex
            if (newWin[newIndex] &&
                oldWin.indexOf(newWin[newIndex]) == -1) {
                addedItems.push({ item: this._createPreviewItem(newWin[newIndex]),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // Window moved
            let insertHere = newWin[newIndex + 1] &&
                             newWin[newIndex + 1] == oldWin[oldIndex];
            let alreadyRemoved = removedActors.reduce(function(result, actor) {
                let removedWin = actor._window;
                return result || removedWin == newWin[newIndex];
            }, false);

            if (insertHere || alreadyRemoved) {
                addedItems.push({ item: this._createPreviewItem(newWin[newIndex]),
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++)
            this.addMenuItem(addedItems[i].item,
                             addedItems[i].pos);

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];
            if (this._shownInitially)
                item._animateOutAndDestroy();
            else
                item.actor.destroy();
        }

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once
        let animate = this._shownInitially;

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++)
            addedItems[i].item.show(animate);

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this.box.queue_relayout();

        if (newWin.length < 1)
            this._getTopMenu().close(~0);

        // As for upstream:
        // St.ScrollView always requests space horizontally for a possible vertical
        // scrollbar if in AUTOMATIC mode. Doing better would require implementation
        // of width-for-height in St.BoxLayout and St.ScrollView. This looks bad
        // when we *don't* need it, so turn off the scrollbar when that's true.
        // Dynamic changes in whether we need it aren't handled properly.
        let needsScrollbar = this._needsScrollbar();
        let scrollbar_policy =  needsScrollbar ? Gtk.PolicyType.AUTOMATIC : Gtk.PolicyType.NEVER;
        if (this.isHorizontal)
            this.actor.hscrollbar_policy =  scrollbar_policy;
        else
            this.actor.vscrollbar_policy =  scrollbar_policy;

        if (needsScrollbar)
            this.actor.add_style_pseudo_class('scrolled');
        else
            this.actor.remove_style_pseudo_class('scrolled');
    },

    _needsScrollbar: function() {
        let topMenu = this._getTopMenu();
        let topThemeNode = topMenu.actor.get_theme_node();
        if (this.isHorizontal) {
            let [topMinWidth, topNaturalWidth] = topMenu.actor.get_preferred_width(-1);
            let topMaxWidth = topThemeNode.get_max_width();
            return topMaxWidth >= 0 && topNaturalWidth >= topMaxWidth;
        } else {
            let [topMinHeight, topNaturalHeight] = topMenu.actor.get_preferred_height(-1);
            let topMaxHeight = topThemeNode.get_max_height();
            return topMaxHeight >= 0 && topNaturalHeight >= topMaxHeight;
        }

    },

    isAnimatingOut: function() {
        return this.actor.get_children().reduce(function(result, actor) {
                   return result || actor.animatingOut;
               }, false);
    }
});

const WindowPreviewMenuItem = new Lang.Class({
    Name: 'WindowPreviewMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(window, params) {
        this._window = window;
        this._destroyId = 0;
        this._windowAddedId = 0;
        this.parent(params);

        // We don't want this: it adds spacing on the left of the item.
        this.actor.remove_child(this._ornamentLabel);
        this.actor.add_style_class_name('dashtodock-app-well-preview-menu-item');

        this._cloneBin = new St.Bin();
        this._cloneBin.set_size(PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT);

        // TODO: improve the way the closebutton is layout. Just use some padding
        // for the moment.
        this._cloneBin.set_style('padding-bottom: 0.5em');

        this.closeButton = new St.Button({ style_class: 'window-close',
                                          x_expand: true,
                                          y_expand: true});
        this.closeButton.set_x_align(Clutter.ActorAlign.END);
        this.closeButton.set_y_align(Clutter.ActorAlign.START);


        this.closeButton.opacity = 0;
        this.closeButton.connect('clicked', Lang.bind(this, this._closeWindow));

        let overlayGroup = new Clutter.Actor({layout_manager: new Clutter.BinLayout() });

        overlayGroup.add_actor(this._cloneBin);
        overlayGroup.add_actor(this.closeButton);

        let label = new St.Label({ text: window.get_title()});
        label.set_style('max-width: '+PREVIEW_MAX_WIDTH +'px');
        let labelBin = new St.Bin({ child: label,
                                    x_align: St.Align.MIDDLE});

        this._windowTitleId = this._window.connect('notify::title', Lang.bind(this, function() {
                                  label.set_text(this._window.get_title());
                              }));

        let box = new St.BoxLayout({ vertical: true,
                                     reactive:true,
                                     x_expand:true });
        box.add(overlayGroup);
        box.add(labelBin);
        this.actor.add_actor(box);

        this.actor.connect('enter-event',
                                  Lang.bind(this, this._onEnter));
        this.actor.connect('leave-event',
                                  Lang.bind(this, this._onLeave));
        this.actor.connect('key-focus-in',
                                  Lang.bind(this, this._onEnter));
        this.actor.connect('key-focus-out',
                                  Lang.bind(this, this._onLeave));

        this._cloneTexture(window);

    },

    _cloneTexture: function(metaWin){

        let mutterWindow = metaWin.get_compositor_private();

        // Newly-created windows are added to a workspace before
        // the compositor finds out about them...
        // Moreover sometimes they return an empty texture, thus as a workarounf also check for it size
        if (!mutterWindow || !mutterWindow.get_texture() || !mutterWindow.get_texture().get_size()[0]) {
            let id = Mainloop.idle_add(Lang.bind(this,
                                            function () {
                                                // Check if there's still a point in getting the texture,
                                                // otherwise this could go on indefinitely
                                                if (this.actor && metaWin.get_workspace())
                                                    this._cloneTexture(metaWin);
                                                return GLib.SOURCE_REMOVE;
                                            }));
            GLib.Source.set_name_by_id(id, '[dash-to-dock] this._cloneTexture');
            return;
        }

        let windowTexture = mutterWindow.get_texture();
        let [width, height] = windowTexture.get_size();

        let scale = Math.min(1.0, PREVIEW_MAX_WIDTH/width, PREVIEW_MAX_HEIGHT/height);

        let clone = new Clutter.Clone ({ source: windowTexture,
                                         reactive: true,
                                         width: width * scale,
                                         height: height * scale });

        // when the source actor is destroyed, i.e. the window closed, first destroy the clone
        // and then destroy the menu item (do this animating out)
        this._destroyId = mutterWindow.connect('destroy', Lang.bind(this, function() {
            clone.destroy();
            this._destroyId = 0; // avoid to try to disconnect this signal from mutterWindow in _onDestroy(),
                                 // as the object was just destroyed
            this._animateOutAndDestroy();
        }));

        this._clone = clone;
        this._mutterWindow = mutterWindow;
        this._cloneBin.set_child(this._clone);
    },

    _windowCanClose: function() {
        return this._window.can_close() &&
               !this._hasAttachedDialogs();
    },

    _closeWindow: function(actor) {
        this._workspace = this._window.get_workspace();

        // This mechanism is copied from the workspace.js upstream code
        // It forces window activation if the windows don't get closed,
        // for instance because asking user confirmation, by monitoring the opening of
        // such additional confirmation window
        this._windowAddedId = this._workspace.connect('window-added',
                                                      Lang.bind(this,
                                                                this._onWindowAdded));

        this.deleteAllWindows();
    },

    deleteAllWindows: function() {
        // Delete all windows, starting from the bottom-most (most-modal) one
        //let windows = this._window.get_compositor_private().get_children();
        let windows = this._clone.get_children();
        for (let i = windows.length - 1; i >= 1; i--) {
            let realWindow = windows[i].source;
            let metaWindow = realWindow.meta_window;

            metaWindow.delete(global.get_current_time());
        }

        this._window.delete(global.get_current_time());
    },

    _onWindowAdded: function(workspace, win) {
        let metaWindow = this._window;

        if (win.get_transient_for() == metaWindow) {
            workspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;

            // use an idle handler to avoid mapping problems -
            // see comment in Workspace._windowAdded
            let id = Mainloop.idle_add(Lang.bind(this,
                                            function() {
                                                this.emit('activate');
                                                return GLib.SOURCE_REMOVE;
                                            }));
            GLib.Source.set_name_by_id(id, '[dash-to-dock] this.emit');
        }
    },

    _hasAttachedDialogs: function() {
        // count trasient windows
        let n=0;
        this._window.foreach_transient(function(){n++;});
        return n>0;
    },

    _onEnter: function() {
        this._showCloseButton();
        return Clutter.EVENT_PROPAGATE;
    },

    _onLeave: function() {
        if (!this._cloneBin.has_pointer &&
            !this.closeButton.has_pointer)
            this._hideCloseButton();

        return Clutter.EVENT_PROPAGATE;
    },

    _idleToggleCloseButton: function() {
        this._idleToggleCloseId = 0;

        if (!this._cloneBin.has_pointer &&
            !this.closeButton.has_pointer)
            this._hideCloseButton();

        return GLib.SOURCE_REMOVE;
    },

    _showCloseButton: function() {

        if (this._windowCanClose()) {
            this.closeButton.show();
            Tweener.addTween(this.closeButton,
                             { opacity: 255,
                               time: Workspace.CLOSE_BUTTON_FADE_TIME,
                               transition: 'easeOutQuad' });
        }
    },

    _hideCloseButton: function() {
        Tweener.addTween(this.closeButton,
                         { opacity: 0,
                           time: Workspace.CLOSE_BUTTON_FADE_TIME,
                           transition: 'easeInQuad' });
    },

    show: function(animate) {
        let fullWidth = this.actor.get_width();

        this.actor.opacity = 0;
        this.actor.set_width(0);

        let time = animate ? 0.25 : 0;
        Tweener.addTween(this.actor,
                         { opacity: 255,
                           width: fullWidth,
                           time: time,
                           transition: 'easeInOutQuad'
                         });
    },

    _animateOutAndDestroy: function() {
        Tweener.addTween(this.actor,
                         { opacity: 0,
                           time: 0.25,
                         });

        Tweener.addTween(this.actor,
                         { height: 0,
                           width: 0,
                           time: 0.25,
                           delay: 0.25,
                           onCompleteScope: this,
                           onComplete: function() {
                              this.actor.destroy();
                           }
                         });
    },

    activate: function() {
        this._getTopMenu().close();
        Main.activateWindow(this._window);
    },

    _onDestroy: function() {

        this.parent();

        if (this._windowAddedId > 0) {
            this._workspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;
        }

        if (this._destroyId > 0) {
            this._mutterWindow.disconnect(this._destroyId);
            this._destroyId = 0;
        }

        if (this._windowTitleId > 0) {
            this._window.disconnect(this._windowTitleId);
            this._windowTitleId = 0;
        }
    }

});

