// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;

const St = imports.gi.St;

const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

/**
 * Manage theme customization and custom theme support
 */
const ThemeManager = new Lang.Class({
    Name: 'DashToDock.ThemeManager',

    _init: function(settings, actor, dash) {
        this._dtdSettings = settings;
        this._bindSettingsChanges();
        this._actor = actor;
        this._dash = dash;

        // initialize colors with generic values
        this._defaultBackground = {red: 0, green: 0, blue: 0, alpha: 0};
        this._defaultBackgroundColor = {red: 0, green: 0, blue: 0, alpha: 0};
        this._customizedBackground = {red: 0, green: 0, blue: 0, alpha: 0};

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

    _updateBackgroundOpacity: function() {
        let newAlpha = this._dtdSettings.get_double('background-opacity');

        this._defaultBackground = 'rgba(' +
            this._defaultBackgroundColor.red + ',' +
            this._defaultBackgroundColor.green + ',' +
            this._defaultBackgroundColor.blue + ',' +
            Math.round(this._defaultBackgroundColor.alpha/2.55)/100 + ')';

        this._customizedBackground = 'rgba(' +
            this._defaultBackgroundColor.red + ',' +
            this._defaultBackgroundColor.green + ',' +
            this._defaultBackgroundColor.blue + ',' +
            newAlpha + ')';
    },

    _getBackgroundColor: function() {
        // Prevent shell crash if the actor is not on the stage.
        // It happens enabling/disabling repeatedly the extension
        if (!this._dash._container.get_stage())
            return;

        // Remove custom style
        let oldStyle = this._dash._container.get_style();
        this._dash._container.set_style(null);

        let themeNode = this._dash._container.get_theme_node();
        this._dash._container.set_style(oldStyle);

        this._defaultBackgroundColor = themeNode.get_background_color();
    },

    _updateCustomStyleClasses: function() {
        if (this._dtdSettings.get_boolean('apply-custom-theme'))
            this._actor.add_style_class_name('dashtodock');
        else
            this._actor.remove_style_class_name('dashtodock');

        if (this._dtdSettings.get_boolean('custom-theme-shrink'))
            this._actor.add_style_class_name('shrink');
        else
            this._actor.remove_style_class_name('shrink');
    },

    updateCustomTheme: function() {
        this._updateCustomStyleClasses();
        this._getBackgroundColor();
        this._updateBackgroundOpacity();
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
        if (this._dtdSettings.get_boolean('apply-custom-theme'))
            return;

        let newStyle = '';
        let position = Convenience.getPosition(this._dtdSettings);

        if (!this._dtdSettings.get_boolean('custom-theme-shrink')) {
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
        if (this._dtdSettings.get_boolean('opaque-background')) {
            newStyle = newStyle + 'background-color:'+ this._customizedBackground + '; ' +
                       'transition-delay: 0s; transition-duration: 0.250s;';
            this._dash._container.set_style(newStyle);
        }
    },

    _bindSettingsChanges: function() {
        let keys = ['opaque-background',
                    'background-opacity',
                    'apply-custom-theme',
                    'custom-theme-shrink',
                    'extend-height'];

        keys.forEach(function(key) {
            this._dtdSettings.connect('changed::' + key, Lang.bind(this, this.updateCustomTheme));
        }, this);
    }
});
