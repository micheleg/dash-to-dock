'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Launchers = GObject.registerClass({
    GTypeName: 'Launchers',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'launchers.ui'])}`,
    InternalChildren: [
        'showFavorites', //show-favorites (b)

        'showRunning', //show-running (b)
        'workspaceIsolation', //isolate-workspaces (b)
        'showUrgent', //workspace-agnostic-urgent-windows (b)
        'isolateMonitors', //isolate-monitors (b)

        'showMounts', //show-mounts (b)
        'showMountsOnlyMounted', //show-mounts-only-mounted (b)
        'showMountsNetwork', //show-mounts-network (b)
        'isolateLocations', //isolate-locations (b)

        'showAppsButton', //show-show-apps-button (b)
        'moveStart', //show-apps-at-top (b)
        'animateApps', //animate-show-apps (b)
        'moveToEdge', //show-apps-always-in-the-edge (b)

        'showTrash' //show-trash (b)
    ]
}, class Launchers extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        settings.bind(
            'show-favorites', this._showFavorites, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        settings.bind(
            'show-running', this._showRunning, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'isolate-workspaces', this._workspaceIsolation, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'isolate-monitors', this._isolateMonitors, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );


        settings.bind(
            'show-mounts', this._showMounts, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-mounts-only-mounted', this._showMountsOnlyMounted, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-mounts-network', this._showMountsNetwork, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'isolate-locations', this._isolateLocations, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );


        settings.bind(
            'show-show-apps-button', this._showAppsButton, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-apps-at-top', this._moveStart, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'animate-show-apps', this._animateApps, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'show-apps-always-in-the-edge', this._moveToEdge, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        settings.bind(
            'show-trash', this._showTrash, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
    }
});