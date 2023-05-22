'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Launchers = GObject.registerClass({
    GTypeName: 'Launchers',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'launchers.ui'])}`,
    InternalChildren: [
        'showFavorites',
        'showRunning',
        'showShowAppsButton',
        'showTrash'
    ]
}, class Launchers extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        settings.bind(
            'show-favorites', this._showFavorites, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-running', this._showRunning, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-show-apps-button', this._showShowAppsButton, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-trash', this._showTrash, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
    }
});