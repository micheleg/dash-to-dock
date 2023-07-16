'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var General = GObject.registerClass({
    GTypeName: 'General',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'general.ui'])}`,
    InternalChildren: [
        'presetUnity',
        'presetGnome',
        'dockPosition', //dock-position
        'showAllScreens', //multi-monitor (b)
        'disableOverviewOnStartup' //disable-overview-on-startup (b)
    ]
}, class General extends Adw.PreferencesPage {
    constructor(settings) {
        super({});

        // Presets
        this._presetUnity.connect('clicked', () => {
            settings.set_enum('dock-position', 3);
            settings.set_boolean('extend-height', true);
            settings.set_boolean('always-center-icons', false);
            settings.set_boolean('show-apps-always-in-the-edge', true);
        });
        this._presetGnome.connect('clicked', () => {
            settings.set_enum('dock-position', 2);
            settings.set_boolean('extend-height', false);
            settings.set_boolean('always-center-icons', false);
            settings.set_boolean('show-apps-always-in-the-edge', false);
        });

        // Postition
        this._dockPosition.selected = settings.get_enum('dock-position');
        this._dockPosition.connect('notify::selected', widget => {
            settings.set_enum('dock-position', widget.selected);
        });
        
        // Multi monitor toggle
        settings.bind(
            'multi-monitor', this._showAllScreens, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        // Disable overvie toggle
        settings.bind(
            'disable-overview-on-startup', this._disableOverviewOnStartup, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

    }
});