const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const Params = imports.misc.params;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const Workspace = imports.ui.workspace;

const PREVIEW_MAX_WIDTH = 250;
const PREVIEW_MAX_HEIGHT = 150;
const WindowPreviewMenuItem = new Lang.Class({
    Name: 'WindowPreviewMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(window, params) {
        this._window = window;
        this._destroyId = 0;
        this._windowAddedId = 0;
        params = Params.parse(params, { style_class: 'app-well-preview-menu-item' });
        this.parent(params);

        this._cloneBin = new St.Bin();
        this._cloneBin.set_size(PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT);

        // TODO: improve the way the closebutton is layout. Just use some padding
        // for the moment.
        this._cloneBin.set_style('padding: 5px');

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

    _animateOutAndDestroy: function() {
        Tweener.addTween(this.actor,
                         { opacity: 0,
                           time: 0.25,
                         });

        Tweener.addTween(this.actor,
                         { height: 0,
                           time: 0.25,
                           delay: 0.25,
                           onCompleteScope: this,
                           onComplete: function() {
                              this.actor.destroy();
                           }
                         });
    },

    _onDestroy: function() {

        this.parent();

        if (this._windowAddedId > 0) {
            this._workspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;
        }

        if (this._destroyId > 0)
            this._mutterWindow.disconnect(this._destroyId);
            this._destroyId = 0;
    }

});

