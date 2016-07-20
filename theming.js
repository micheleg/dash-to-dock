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

/**
 * Manage theme customization and custom theme support
 */
const ThemeManager = new Lang.Class({
    Name: 'DashToDock.ThemeManager',

    _init: function(settings, actor, dash) {
        this._settings = settings;
        this._bindSettingsChanges();
        this._actor = actor;
        this._dash = dash;

        // initialize colors with generic values
        this._customizedBackground = {red: 0, green: 0, blue: 0, alpha: 0};
        this._customizedBorder = {red: 0, green: 0, blue: 0, alpha: 0};

        this._signalsHandler = new Convenience.GlobalSignalsHandler();
        this._signalsHandler.add([
            // When theme changes re-obtain default background color
            St.ThemeContext.get_for_stage (global.stage),
            'changed',
            Lang.bind(this, this.updateCustomTheme)
        ], [
            // update :overview pseudoclass
            Main.overview,
            'showing',
            Lang.bind(this, this._onOverviewShowing)
        ], [
            Main.overview,
            'hiding',
            Lang.bind(this, this._onOverviewHiding)
        ]);

        this._updateCustomStyleClasses();

    },

    destroy: function() {
        this._signalsHandler.destroy();
    },

    _onOverviewShowing: function() {
        this._actor.add_style_pseudo_class('overview');
    },

    _onOverviewHiding: function() {
        this._actor.remove_style_pseudo_class('overview');
    },

    _updateDashOpacity: function() {
        let newAlpha = this._settings.get_double('background-opacity');

        let [backgroundColor, borderColor] = this._getDefaultColors();

        if (backgroundColor==null)
            return;

        // Get the background and border alphas. We check the background alpha
        // for a minimum of .001 to prevent division by 0 errors
        let backgroundAlpha = Math.max(Math.round(backgroundColor.alpha/2.55)/100, .001);
        let borderAlpha = Math.round(borderColor.alpha/2.55)/100;

        // The border and background alphas should remain in sync
        // We also limit the borderAlpha to a maximum of 1 (full opacity)
        borderAlpha = Math.min((borderAlpha/backgroundAlpha)*newAlpha, 1);

        this._customizedBackground = 'rgba(' +
            backgroundColor.red + ',' +
            backgroundColor.green + ',' +
            backgroundColor.blue + ',' +
            newAlpha + ')';

        this._customizedBorder = 'rgba(' +
            borderColor.red + ',' +
            borderColor.green + ',' +
            borderColor.blue + ',' +
            borderAlpha + ')';

    },

    _getDefaultColors: function() {
        // Prevent shell crash if the actor is not on the stage.
        // It happens enabling/disabling repeatedly the extension
        if (!this._dash._container.get_stage())
            return [null, null];

        // Remove custom style
        let oldStyle = this._dash._container.get_style();
        this._dash._container.set_style(null);

        let themeNode = this._dash._container.get_theme_node();
        this._dash._container.set_style(oldStyle);

        let backgroundColor = themeNode.get_background_color();

        // Just in case the theme has different border colors ..
        // We want to find the inside border-color of the dock because it is
        // the side most visible to the user. We do this by finding the side
        // opposite the position
        let position = Convenience.getPosition(this._settings);
        let side = position + 2;
        if (side > 3)
            side = Math.abs(side - 4);

        let borderColor = themeNode.get_border_color(side);

        return [backgroundColor, borderColor];
    },

    _updateDashColor: function() {
        if (this._settings.get_boolean('custom-background-color')) {
            let [backgroundColor, borderColor] = this._getDefaultColors();

            if (backgroundColor==null)
              return;

            let newAlpha = Math.round(backgroundColor.alpha/2.55)/100;
            if (this._settings.get_boolean('opaque-background'))
                newAlpha = this._settings.get_double('background-opacity');

            let newColor = Clutter.color_from_string(this._settings.get_string('background-color'))[1];
            this._customizedBackground = 'rgba(' +
                newColor.red + ',' +
                newColor.green + ',' +
                newColor.blue + ',' +
                newAlpha + ')';

            this._customizedBorder = this._customizedBackground;
        }
    },

    _updateCustomStyleClasses: function() {
        if (this._settings.get_boolean('apply-custom-theme'))
            this._actor.add_style_class_name('dashtodock');
        else
            this._actor.remove_style_class_name('dashtodock');

        if (this._settings.get_boolean('custom-theme-shrink'))
            this._actor.add_style_class_name('shrink');
        else
            this._actor.remove_style_class_name('shrink');

        if (this._settings.get_boolean('custom-theme-running-dots'))
            this._actor.add_style_class_name('running-dots');
        else
            this._actor.remove_style_class_name('running-dots');
    },

    updateCustomTheme: function() {
        this._updateCustomStyleClasses();
        this._updateDashOpacity();
        this._updateDashColor();
        this._adjustTheme();
        this._dash._redisplay();
    },

    /**
     * Reimported back and adapted from atomdock
     */
    _adjustTheme: function() {
        // Prevent shell crash if the actor is not on the stage.
        // It happens enabling/disabling repeatedly the extension
        if (!this._dash._container.get_stage())
            return;

        // Remove prior style edits
        this._dash._container.set_style(null);

        // If built-in theme is enabled do nothing else
        if (this._settings.get_boolean('apply-custom-theme'))
            return;

        let newStyle = '';
        let position = Convenience.getPosition(this._settings);

        if (!this._settings.get_boolean('custom-theme-shrink')) {
            // obtain theme border settings
            let themeNode = this._dash._container.get_theme_node();
            let borderColor = themeNode.get_border_color(St.Side.TOP);
            let borderWidth = themeNode.get_border_width(St.Side.TOP);
            let borderRadius = themeNode.get_border_radius(St.Corner.TOPRIGHT);

            // We're copying border and corner styles to left border and top-left
            // corner, also removing bottom border and bottom-right corner styles
            let borderInner = '';
            let borderRadiusValue = '';
            let borderMissingStyle = '';

            if (this._rtl && (position != St.Side.RIGHT))
                borderMissingStyle = 'border-right: ' + borderWidth + 'px solid ' +
                       borderColor.to_string() + ';';
            else if (!this._rtl && (position != St.Side.LEFT))
                borderMissingStyle = 'border-left: ' + borderWidth + 'px solid ' +
                       borderColor.to_string() + ';';

            switch (position) {
            case St.Side.LEFT:
                borderInner = 'border-left';
                borderRadiusValue = '0 ' + borderRadius + 'px ' + borderRadius + 'px 0;';
                break;
            case St.Side.RIGHT:
                borderInner = 'border-right';
                borderRadiusValue = borderRadius + 'px 0 0 ' + borderRadius + 'px;';
                break;
            case St.Side.TOP:
                borderInner = 'border-top';
                borderRadiusValue = '0 0 ' + borderRadius + 'px ' + borderRadius + 'px;';
                break;
            case St.Side.BOTTOM:
                borderInner = 'border-bottom';
                borderRadiusValue = borderRadius + 'px ' + borderRadius + 'px 0 0;';
                break;
            }

            newStyle = borderInner + ': none;' +
                'border-radius: ' + borderRadiusValue +
                borderMissingStyle;

            // I do call set_style possibly twice so that only the background gets the transition.
            // The transition-property css rules seems to be unsupported
            this._dash._container.set_style(newStyle);
        }

        // Customize background
        if (this._settings.get_boolean('opaque-background') || this._settings.get_boolean('custom-background-color')) {
            newStyle = newStyle + 'background-color:'+ this._customizedBackground + '; ' +
                       'border-color:'+ this._customizedBorder + '; ' +
                       'transition-delay: 0s; transition-duration: 0.250s;';
            this._dash._container.set_style(newStyle);
        }
    },

    _bindSettingsChanges: function() {
        let keys = ['opaque-background',
                    'background-opacity',
                    'custom-background-color',
                    'background-color',
                    'apply-custom-theme',
                    'custom-theme-shrink',
                    'custom-theme-running-dots',
                    'extend-height'];

        keys.forEach(function(key) {
            this._settings.connect('changed::' + key, Lang.bind(this, this.updateCustomTheme));
        }, this);
    }
});
