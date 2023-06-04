'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Apparence = GObject.registerClass({
    GTypeName: 'Apparence',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'apparence.ui'])}`,
    InternalChildren: [
        'customThemeShrink',
        'applyCustomTheme',
        'customBackgroundColor',
        'backgroundColor'
    ]
}, class Apparence extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        settings.bind(
            'custom-theme-shrink', this._customThemeShrink, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'apply-custom-theme', this._applyCustomTheme, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'custom-background-color', this._customBackgroundColor, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'background-color', this._backgroundColor, 'rgba',
            Gio.SettingsBindFlags.DEFAULT
        );

    }
});