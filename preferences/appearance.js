'use strict';

const { Adw, Gdk, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

const DEFAULT_ICONS_SIZES = [128, 96, 64, 48, 32, 24, 16];

const TransparencyMode = Object.freeze({
    DEFAULT: 0,
    FIXED: 1,
    DYNAMIC: 3,
});

const RunningIndicatorStyle = Object.freeze({
    DEFAULT: 0,
    DOTS: 1,
    SQUARES: 2,
    DASHES: 3,
    SEGMENTED: 4,
    SOLID: 5,
    CILIORA: 6,
    METRO: 7,
});

var Appearance = GObject.registerClass({
    GTypeName: 'Appearance',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'appearance.ui'])}`,
    InternalChildren: [
        'applyCustomTheme', //apply-custom-theme (b)

        //show window indicators // show-running
        // window indicators

        'enableCustomIndicator', //custom-theme-customize-running-dots (b)
        'IndicatorColor', //custom-theme-running-dots-color (s)
        'IndicatorBorderColor', //custom-theme-running-dots-border-color (s)
        // indicatro border widht //custom-theme-running-dots-border-width (i)
        
        'dockSize',

        'pannelMode', //extend-height (b)
        'centerIcons', //always-center-icons (b)
        'moveStart', //show-apps-at-top (b)
        'moveToEdge', //show-apps-always-in-the-edge (b)

        'customThemeShrink', //custom-theme-shrink (b)

        'customBackgroundColor', //custom-background-color (b)
        'backgroundColor', //background-color (s)

        // bg Mode
        'backgroundOpacity', //background-opacity (d)
        // bg min
        // bg max

        'iconSize', //dash-max-icon-size (i)
        // icon size limit
        'showEmblems', //show-icons-emblems (b)
        'wiggleUrgent' //dance-urgent-applications (b)
    ]
}, class Apparence extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        function setColorBTN(settings,uiElement,gSetting){
            const rgba = new Gdk.RGBA();
            rgba.parse(settings.get_string(gSetting));
            uiElement.set_rgba(rgba);
        
            uiElement.connect('notify::rgba', button => {
                const css = button.rgba.to_string();
                settings.set_string(gSetting, css);
            });
        }

        //applyCustomTheme
        settings.bind(
            'apply-custom-theme', this._applyCustomTheme, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        //enableCustomIndicator
        settings.bind(
            'custom-theme-customize-running-dots', this._enableCustomIndicator, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        //IndicatorColor
        setColorBTN(settings,this._IndicatorColor,'custom-theme-running-dots-color');
        //IndicatorBorderColor
        setColorBTN(settings,this._IndicatorBorderColor,'custom-theme-running-dots-border-color');
               
        //dockSize

        //pannelMode
        settings.bind(
            'extend-height', this._pannelMode, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        //centerIcons
        settings.bind(
            'always-center-icons', this._centerIcons, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        //moveToEdge
        settings.bind(
            'show-apps-always-in-the-edge', this._moveToEdge, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        //moveStart
        settings.bind(
            'show-apps-at-top', this._moveStart, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        //customThemeShrink
        settings.bind(
            'custom-theme-shrink', this._customThemeShrink, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );


        //customBackgroundColor
        settings.bind(
            'custom-background-color', this._customBackgroundColor, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        //backgroundColor
        setColorBTN(settings,this._backgroundColor,'background-color');


        // bg Mode
        //backgroundOpacity
        this._backgroundOpacity.set_value(settings.get_double('background-opacity'));
        this._backgroundOpacity.set_format_value_func((_, value) => {
            return `${Math.round(value * 100)}%`;
        });
        // bg min
        // bg max

        //iconSize
        // icon size limit
        // showEmblems //show-icons-emblems (b)
        settings.bind(
            'show-icons-emblems', this._showEmblems, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        // wiggleUrgent
        settings.bind(
            'dance-urgent-applications', this._wiggleUrgent, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );


        // Builtin Theme check

        if (settings.get_enum('transparency-mode') !== TransparencyMode.FIXED)
            this._backgroundOpacity.set_sensitive(false);

        settings.connect('changed::transparency-mode', () => {
            if (settings.get_enum('transparency-mode') !== TransparencyMode.FIXED)
                this._backgroundOpacity.set_sensitive(false);
            else
                this._backgroundOpacity.set_sensitive(true);
        });

        // if (settings.get_enum('transparency-mode') !== TransparencyMode.DYNAMIC)
        //     this._builder.get_object('dynamic_opacity_button').set_sensitive(false);


        // settings.connect('changed::transparency-mode', () => {
        //     if (settings.get_enum('transparency-mode') !== TransparencyMode.DYNAMIC)
        //         this._builder.get_object('dynamic_opacity_button').set_sensitive(false);

        //     else
        //         this._builder.get_object('dynamic_opacity_button').set_sensitive(true);
        // });
    }
});