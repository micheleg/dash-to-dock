'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var General = GObject.registerClass({
    GTypeName: 'General',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'general.ui'])}`,
    InternalChildren: [
        'customThemeShrink',
        'disableOverviewOnStartup',
        'applyCustomTheme',
        'customBackgroundColor',
        'backgroundColor',
        'backgroundOpacity'
    ]
}, class General extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        // settings.bind(
        //     'custom-theme-shrink', this._customThemeShrink, 'active',
        //     Gio.SettingsBindFlags.DEFAULT
        // );
        // settings.bind(
        //     'disable-overview-on-startup', this._disableOverviewOnStartup, 'active',
        //     Gio.SettingsBindFlags.DEFAULT
        // );
        // settings.bind(
        //     'apply-custom-theme', this._applyCustomTheme, 'active',
        //     Gio.SettingsBindFlags.DEFAULT
        // );
        // settings.bind(
        //     'custom-background-color', this._customBackgroundColor, 'enable-expansion',
        //     Gio.SettingsBindFlags.DEFAULT
        // );
        // settings.bind(
        //     'background-color', this._backgroundColor, 'rgba',
        //     Gio.SettingsBindFlags.DEFAULT
        // );
        // settings.bind(
        //     'background-opacity', this._backgroundOpacity, 'opacity',
        //     Gio.SettingsBindFlags.DEFAULT
        // );
    }
});