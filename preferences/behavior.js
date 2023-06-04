'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Behavior = GObject.registerClass({
    GTypeName: 'Behavior',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'behavior.ui'])}`,
    InternalChildren: [
        'showWindowsPreview',
        'isolateWorkspaces',
        'isolateMonitors',
        'disableOverviewOnStartup',
        'showMounts',
        'showMountsOnlyMounted',
        'showMountsNetwork',
        'isolateLocations'
    ]
}, class Behavior extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        settings.bind(
            'show-windows-preview', this._showWindowsPreview, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'isolate-workspaces', this._isolateWorkspaces, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'isolate-monitors', this._isolateMonitors, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'disable-overview-on-startup', this._disableOverviewOnStartup, 'active',
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
    }
});