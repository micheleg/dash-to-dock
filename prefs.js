// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;


const Gettext = imports.gettext.domain('dashtodock');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SCALE_UPDATE_TIMEOUT = 500;
const DEFAULT_ICONS_SIZES = [ 128, 96, 64, 48, 32, 24, 16 ];

const Settings = new Lang.Class({
    Name: 'DashToDockSettings',


    _init: function() {

        this._settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');

        this._builder = new Gtk.Builder();
        this._builder.add_from_file(Me.path + '/Settings.ui');

        this.widget = this._builder.get_object('settings_notebook');

        // Timeout to delay the update of the settings
        this._dock_size_timeout = 0;
        this._icon_size_timeout = 0;
        this._opacity_timeout = 0;

        this._bindSettings();

        this._builder.connect_signals_full(Lang.bind(this, this._connector));

    },

    // Connect signals
    _connector: function(builder, object, signal, handler) {
        object.connect(signal, Lang.bind(this, this._SignalHandler[handler]));
    },

    _bindSettings: function() {

        /* Position and size panel */

        // Monitor options

        this._monitors = [];
        // Build options based on the number of monitors and the current settings.
        let n_monitors = Gdk.Screen.get_default().get_n_monitors();
        let primary_monitor = Gdk.Screen.get_default().get_primary_monitor();

        let monitor = this._settings.get_int('preferred-monitor');

        // Add primary monitor with index 0, because in GNOME Shell the primary monitor is always 0
        this._builder.get_object('dock_monitor_combo').append_text(_("Primary monitor"));
        this._monitors.push(0);

        // Add connected monitors
        let ctr = 0;
        for (let i = 0; i < n_monitors; i++) {
            if (i !== primary_monitor){
                ctr++;
                this._monitors.push(ctr);
                this._builder.get_object('dock_monitor_combo').append_text(_("Secondary monitor ") + ctr);
            }
        }

        // If one of the external monitor is set as preferred, show it even if not attached
        if ( monitor >= n_monitors && monitor !== primary_monitor) {
            this._monitors.push(monitor)
            this._builder.get_object('dock_monitor_combo').append_text(_("Secondary monitor ") + ++ctr);
        }

        this._builder.get_object('dock_monitor_combo').set_active(this._monitors.indexOf(monitor));

        // Position option
        let position = this._settings.get_enum('dock-position');

        switch (position) {
            case 0:
                this._builder.get_object('position_top_button').set_active(true);
                break;
            case 1:
                this._builder.get_object('position_right_button').set_active(true);
                break;
            case 2:
                this._builder.get_object('position_bottom_button').set_active(true);
                break;
            case 3:
                this._builder.get_object('position_left_button').set_active(true);
                break;
        }

        // Intelligent autohide options
        this._settings.bind('dock-fixed',
                            this._builder.get_object('intelligent_autohide_switch'),
                            'active',
                            Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this._settings.bind('dock-fixed',
                            this._builder.get_object('intelligent_autohide_button'),
                            'sensitive',
                            Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this._settings.bind('autohide',
                            this._builder.get_object('autohide_switch'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('require-pressure-to-show',
                            this._builder.get_object('require_pressure_checkbutton'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('intellihide',
                            this._builder.get_object('intellihide_switch'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('intellihide-perapp',
                            this._builder.get_object('per_app_intellihide_checkbutton'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('animation-time',
                            this._builder.get_object('animation_duration_spinbutton'),
                            'value',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('hide-delay',
                            this._builder.get_object('hide_timeout_spinbutton'),
                            'value',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-delay',
                            this._builder.get_object('show_timeout_spinbutton'),
                            'value',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('pressure-threshold',
                            this._builder.get_object('pressure_threshold_spinbutton'),
                            'value',
                            Gio.SettingsBindFlags.DEFAULT);

        //this._builder.get_object('animation_duration_spinbutton').set_value(this._settings.get_double('animation-time'));

        // Create dialog for intelligent autohide advanced settings
        this._builder.get_object('intelligent_autohide_button').connect('clicked', Lang.bind(this, function() {

            let dialog = new Gtk.Dialog({ title: _("Intelligent autohide customization"),
                                          transient_for: this.widget.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });

            // GTK+ leaves positive values for application-defined response ids.
            // Use +1 for the reset action 
            dialog.add_button(_("Reset to defaults"), 1);

            let box = this._builder.get_object('intelligent_autohide_advanced_settings_box');
            dialog.get_content_area().add(box);

            this._settings.bind('intellihide',
                            this._builder.get_object('per_app_intellihide_checkbutton'),
                            'sensitive',
                            Gio.SettingsBindFlags.GET);

            this._settings.bind('autohide',
                            this._builder.get_object('require_pressure_checkbutton'),
                            'sensitive',
                            Gio.SettingsBindFlags.GET);

            dialog.connect('response', Lang.bind(this, function(dialog, id) {
                if (id == 1) {
                    // restore default settings for the relevant keys
                    let keys = ['intellihide', 'autohide', 'intellihide-perapp', 'require-pressure-to-show',
                                'animation-time', 'show-delay', 'hide-delay'];
                    keys.forEach(function(val){
                        this._settings.set_value(val, this._settings.get_default_value(val));
                    }, this);
                } else {
                    // remove the settings box so it doesn't get destroyed;
                    dialog.get_content_area().remove(box);
                    dialog.destroy();
                }
                return;
            }));

            dialog.show_all();

        }));

        // size options
        this._builder.get_object('dock_size_scale').set_value(this._settings.get_double('height-fraction'));
        this._builder.get_object('dock_size_scale').add_mark(0.9, Gtk.PositionType.TOP, null);
        let icon_size_scale = this._builder.get_object('icon_size_scale');
        icon_size_scale.set_range(DEFAULT_ICONS_SIZES[DEFAULT_ICONS_SIZES.length -1], DEFAULT_ICONS_SIZES[0]);
        icon_size_scale.set_value(this._settings.get_int('dash-max-icon-size'));
        DEFAULT_ICONS_SIZES.forEach(function(val){
                icon_size_scale.add_mark(val, Gtk.PositionType.TOP, val.toString());
        });
        this._settings.bind('icon-size-fixed', this._builder.get_object('icon_size_fixed_checkbutton'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('extend-height', this._builder.get_object('dock_size_extend_checkbutton'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('extend-height', this._builder.get_object('dock_size_scale'), 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);


        /* Behavior panel */

        this._settings.bind('show-favorites',
                            this._builder.get_object('show_running_switch'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-running',
                            this._builder.get_object('show_favorite_switch'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-apps-at-top',
                            this._builder.get_object('application_button_first_switch'),
                            'active',
                            Gio.SettingsBindFlags.DEFAULT);

        this._builder.get_object('click_action_combo').set_active(this._settings.get_enum('click-action'));
        this._builder.get_object('click_action_combo').connect('changed', Lang.bind (this, function(widget) {
                this._settings.set_enum('click-action', widget.get_active());
        }));

        this._builder.get_object('shift_click_action_combo').set_active(this._settings.get_boolean('minimize-shift')?0:1);

        this._builder.get_object('shift_click_action_combo').connect('changed', Lang.bind (this, function(widget) {
                this._settings.set_boolean('minimize-shift', widget.get_active()==1);
        }));

        this._settings.bind('scroll-switch-workspace', this._builder.get_object('switch_workspace_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);

        /* Appearance Panel */

        this._settings.bind('apply-custom-theme', this._builder.get_object('customize_theme'), 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN | Gio.SettingsBindFlags.GET);
        this._settings.bind('apply-custom-theme', this._builder.get_object('builtin_theme_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('custom-theme-shrink', this._builder.get_object('shrink_dash_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('custom-theme-running-dots', this._builder.get_object('running_dots_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('opaque-background', this._builder.get_object('customize_opacity_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._builder.get_object('custom_opacity_scale').set_value(this._settings.get_double('background-opacity'));
        this._settings.bind('opaque-background', this._builder.get_object('custom_opacity'), 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        /* About Panel */

        this._builder.get_object('extension_version').set_label(Me.metadata.version.toString());

    },


    // Object containing all signals defined in the glade file
    _SignalHandler: {

            dock_display_combo_changed_cb: function (combo) {
                this._settings.set_int('preferred-monitor', this._monitors[combo.get_active()]);
            },

            position_top_button_toggled_cb: function (button){
                if (button.get_active()) 
                    this._settings.set_enum('dock-position', 0);
            },

            position_right_button_toggled_cb: function (button) {
                if (button.get_active()) 
                    this._settings.set_enum('dock-position', 1);
            },

            position_bottom_button_toggled_cb: function (button) {
                if (button.get_active()) 
                    this._settings.set_enum('dock-position', 2);
            },

            position_left_button_toggled_cb: function (button) {
                if (button.get_active()) 
                    this._settings.set_enum('dock-position', 3);
            },

            icon_size_combo_changed_cb: function(combo) {
                this._settings.set_int('dash-max-icon-size', this._allIconSizes[combo.get_active()]);
            },

            dock_size_scale_format_value_cb: function(scale, value) {
                return Math.round(value*100)+ ' %';
            },

            dock_size_scale_value_changed_cb: function(scale){
                // Avoid settings the size consinuosly
                if (this._dock_size_timeout >0)
                    Mainloop.source_remove(this._dock_size_timeout);

                this._dock_size_timeout = Mainloop.timeout_add(SCALE_UPDATE_TIMEOUT, Lang.bind(this, function(){
                    this._settings.set_double('height-fraction', scale.get_value());
                    this._dock_size_timeout = 0;
                    return GLib.SOURCE_REMOVE;
                }));       
            },

            icon_size_scale_format_value_cb: function(scale, value) {
                return value+ ' px';
            },

            icon_size_scale_value_changed_cb: function(scale){
                // Avoid settings the size consinuosly
                if (this._icon_size_timeout >0)
                    Mainloop.source_remove(this._icon_size_timeout);

                this._icon_size_timeout = Mainloop.timeout_add(SCALE_UPDATE_TIMEOUT, Lang.bind(this, function(){
                    this._settings.set_int('dash-max-icon-size', scale.get_value());
                    this._icon_size_timeout = 0;
                    return GLib.SOURCE_REMOVE;
                }));       
            },

            custom_opacity_scale_value_changed_cb: function(scale){
                // Avoid settings the opacity consinuosly as it's change is animated
                if (this._opacity_timeout >0)
                    Mainloop.source_remove(this._opacity_timeout);

                this._opacity_timeout = Mainloop.timeout_add(SCALE_UPDATE_TIMEOUT, Lang.bind(this, function(){
                    this._settings.set_double('background-opacity', scale.get_value());
                    this._opacity_timeout = 0;
                    return GLib.SOURCE_REMOVE;
                }));
            },

            custom_opacity_scale_format_value_cb: function(scale, value) {
                return Math.round(value*100) + ' %';
            }
    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let settings = new Settings();
    let widget = settings.widget;
    widget.show_all();
    return widget;
}

