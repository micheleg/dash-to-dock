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

        this._clone = clone;
        this._mutterWindow = mutterWindow;
        this._cloneBin.set_child(this._clone);
    }

});

