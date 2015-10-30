const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;

const Params = imports.misc.params;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;

const PREVIEW_MAX_WIDTH = 250;
const PREVIEW_MAX_HEIGHT = 150;
const WindowPreviewMenuItem = new Lang.Class({
    Name: 'WindowPreviewMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(window, params) {
        this._window = window;
        this._destroyId = 0;
        params = Params.parse(params, { style_class: 'app-well-preview-menu-item' });
        this.parent(params);

        this._cloneBin = new St.Bin();
        this._cloneBin.set_size(PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT);

        let label = new St.Label({ text: window.get_title()});
        label.set_style('max-width: '+PREVIEW_MAX_WIDTH +'px');
        let labelBin = new St.Bin({ child: label,
                                    x_align: St.Align.MIDDLE});

        let box = new St.BoxLayout({ vertical: true,
                                     reactive:true,
                                     x_expand:true });
        box.add(this._cloneBin);
        box.add(labelBin);
        this.actor.add_actor(box);

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

        if (this._destroyId > 0)
            this._mutterWindow.disconnect(this._destroyId);
            this._destroyId = 0;
    }

});

