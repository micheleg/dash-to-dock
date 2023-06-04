'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var General = GObject.registerClass({
    GTypeName: 'General',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'general.ui'])}`,
    InternalChildren: [
        // 'position', //dock-position
        'showAllScreens', //multi-monitor (b)
        'disableOverviewOnStartup' //disable-overview-on-startup (b)
    ]
}, class General extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        settings.bind(
            'multi-monitor', this._showAllScreens, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        settings.bind(
            'disable-overview-on-startup', this._disableOverviewOnStartup, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
    }
});