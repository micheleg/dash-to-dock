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
const GdkPixbuf = imports.gi.GdkPixbuf

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
const Utils = Me.imports.utils;

const IndicatorStyle = {
    DEFAULT: 0,
    RUNNING_DOTS: 1
};


const AppIconIndicatorBase = new Lang.Class({

    Name: 'DashToDock.AppIconIndicatorBase',

    _init: function(settings, appIcon) {
        // ? RENAME appIcon to SOURCE?
        this._settings = settings;
        this._appIcon = appIcon;

        this._signalsHandler = new Utils.GlobalSignalsHandler();

        this._nWindows = 0;
    },

    update:function() {
        this._updateCounterClass();
    },

    _updateCounterClass: function() {
        let maxN = 4;
        this._nWindows = Math.min(this._appIcon.getInterestingWindows().length, maxN);

        for (let i = 1; i <= maxN; i++) {
            let className = 'running' + i;
            if (i != this._nWindows)
                this._appIcon.actor.remove_style_class_name(className);
            else
                this._appIcon.actor.add_style_class_name(className);
        }

    },

    _hideDefaultDot: function() {
        // I use opacity to hide the default dot because the show/hide function
        // are used by the parent class.
        this._appIcon._dot.opacity = 0;
    },

    _restoreDefaultDot: function() {
        this._appIcon._dot.opacity = 255;
    },

    destroy: function() {
        this._signalsHandler.destroy();
        this._restoreDefaultDot();
    }
});

const RunningDotsIndicator = new Lang.Class({

    Name: 'DashToDock.RunningDotsIndicator',
    Extends: AppIconIndicatorBase,

    _init: function(settings, appIcon) {

        this.parent(settings, appIcon)

        this._hideDefaultDot();

        this._dots = new St.DrawingArea({x_expand: true, y_expand: true});
        this._dots.connect('repaint', Lang.bind(this, this._drawCircles));
        this._appIcon._iconContainer.add_child(this._dots);

        let keys = ['custom-theme-running-dots-color',
                   'custom-theme-running-dots-border-color',
                   'custom-theme-running-dots-border-width'];

        keys.forEach(function(key) {
            this._signalsHandler.add([
                this._settings,
                'changed::' + key,
                Lang.bind(this, this._drawCircles)
            ]);
        }, this);
    },

    _drawCircles: function() {

        let area = this._dots;
        let side =  Utils.getPosition(this._settings);
        let borderColor, borderWidth, bodyColor;

        if (!this._settings.get_boolean('apply-custom-theme')
            && this._settings.get_boolean('custom-theme-running-dots')
            && this._settings.get_boolean('custom-theme-customize-running-dots')) {
            borderColor = Clutter.color_from_string(this._settings.get_string('custom-theme-running-dots-border-color'))[1];
            borderWidth = this._settings.get_int('custom-theme-running-dots-border-width');
            bodyColor =  Clutter.color_from_string(this._settings.get_string('custom-theme-running-dots-color'))[1];
        }
        else {
            // Re-use the style - background color, and border width and color -
            // of the default dot
            let themeNode = this._appIcon._dot.get_theme_node();
            borderColor = themeNode.get_border_color(side);
            borderWidth = themeNode.get_border_width(side);
            bodyColor = themeNode.get_background_color();
        }

        let [width, height] = area.get_surface_size();
        let cr = area.get_context();

        // Draw the required numbers of dots
        // Define the radius as an arbitrary size, but keep large enough to account
        // for the drawing of the border.
        let radius = Math.max(width/22, borderWidth/2);
        let padding = 0; // distance from the margin
        let spacing = radius + borderWidth; // separation between the dots

        //TODO. Get n in this class? check on n!==0 ?
        //let n = this._appIcon._nWindows;
        let n = this._nWindows;

        cr.setLineWidth(borderWidth);
        Clutter.cairo_set_source_color(cr, borderColor);

        switch (side) {
        case St.Side.TOP:
            cr.translate((width - (2*n)*radius - (n-1)*spacing)/2, padding);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc((2*i+1)*radius + i*spacing, radius + borderWidth/2, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.BOTTOM:
            cr.translate((width - (2*n)*radius - (n-1)*spacing)/2, height - padding);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc((2*i+1)*radius + i*spacing, -radius - borderWidth/2, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.LEFT:
            cr.translate(padding, (height - (2*n)*radius - (n-1)*spacing)/2);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc(radius + borderWidth/2, (2*i+1)*radius + i*spacing, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.RIGHT:
            cr.translate(width - padding , (height - (2*n)*radius - (n-1)*spacing)/2);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc(-radius - borderWidth/2, (2*i+1)*radius + i*spacing, radius, 0, 2*Math.PI);
            }
            break;
        }

        cr.strokePreserve();

        Clutter.cairo_set_source_color(cr, bodyColor);
        cr.fill();
        cr.$dispose();
    },

    destroy: function() {
        this.parent();
        this._dots.destroy();
    }

});
