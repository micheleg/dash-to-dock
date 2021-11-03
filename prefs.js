// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Signals = imports.signals;

// Use __ () and N__() for the extension gettext domain, and reuse
// the shell domain with the default _() and N_()
const Gettext = imports.gettext.domain('dashtodock');
const __ = Gettext.gettext;
const N__ = function (e) { return e };

try {
    imports.misc.extensionUtils;
} catch (e) {
    const resource = Gio.Resource.load(
        '/usr/share/gnome-shell/org.gnome.Extensions.src.gresource');
    resource._register();
    imports.searchPath.push('resource:///org/gnome/Extensions/js');
}

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SCALE_UPDATE_TIMEOUT = 500;
const DEFAULT_ICONS_SIZES = [128, 96, 64, 48, 32, 24, 16];

const TransparencyMode = {
    DEFAULT: 0,
    FIXED: 1,
    DYNAMIC: 3
};

const RunningIndicatorStyle = {
    DEFAULT: 0,
    DOTS: 1,
    SQUARES: 2,
    DASHES: 3,
    SEGMENTED: 4,
    SOLID: 5,
    CILIORA: 6,
    METRO: 7
};

class MonitorsConfig {
    static XML_INTERFACE =
        '<node>\
            <interface name="org.gnome.Mutter.DisplayConfig">\
                <method name="GetCurrentState">\
                <arg name="serial" direction="out" type="u" />\
                <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />\
                <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />\
                <arg name="properties" direction="out" type="a{sv}" />\
                </method>\
                <signal name="MonitorsChanged" />\
            </interface>\
        </node>';

    static ProxyWrapper = Gio.DBusProxy.makeProxyWrapper(MonitorsConfig.XML_INTERFACE);

    constructor() {
        this._monitorsConfigProxy = new MonitorsConfig.ProxyWrapper(
            Gio.DBus.session,
            "org.gnome.Mutter.DisplayConfig",
            "/org/gnome/Mutter/DisplayConfig"
        );

        // Connecting to a D-Bus signal
        this._monitorsConfigProxy.connectSignal("MonitorsChanged",
            () => this._updateResources());

        this._primaryMonitor = null;
        this._monitors = [];
        this._logicalMonitors = [];

        this._updateResources();
    }

    _updateResources() {
        this._monitorsConfigProxy.GetCurrentStateRemote((resources, err) => {
            if (err) {
                logError(err);
                return;
            }

            const [_serial, monitors, logicalMonitors] = resources;
            let index = 0;
            for (const monitor of monitors) {
                const [monitorSpecs, _modes, props] = monitor;
                const [connector, vendor, product, serial] = monitorSpecs;
                this._monitors.push({
                    index: index++,
                    active: false,
                    connector, vendor, product, serial,
                    displayName: props['display-name'].unpack(),
                });
            }

            for (const logicalMonitor of logicalMonitors) {
                const [_x, _y, _scale, _transform, isPrimary, monitorsSpecs] =
                    logicalMonitor;

                // We only care about the first one really
                for (const monitorSpecs of monitorsSpecs) {
                    const [connector, vendor, product, serial] = monitorSpecs;
                    const monitor = this._monitors.find(m =>
                        m.connector === connector && m.vendor === vendor &&
                        m.product === product && m.serial === serial);

                    if (monitor) {
                        monitor.active = true;
                        monitor.isPrimary = isPrimary;
                        if (monitor.isPrimary)
                            this._primaryMonitor = monitor;
                        break;
                    }
                }
            }

            const activeMonitors = this._monitors.filter(m => m.active);
            if (activeMonitors.length > 1 && logicalMonitors.length == 1) {
                // We're in cloning mode, so let's just activate the primary monitor
                this._monitors.forEach(m => (m.active = false));
                this._primaryMonitor.active = true;
            }

            this._updateMonitorsIndexes();
            this.emit('updated');
        });
    }

    _updateMonitorsIndexes() {
        // This function ensures that we follow the old Gdk indexing strategy
        // for monitors, it can be removed when we don't care about breaking
        // old user configurations or external apps configuring this extension
        // such as ubuntu's gnome-control-center.
        const { index: primaryMonitorIndex } = this._primaryMonitor;
        for (const monitor of this._monitors) {
            let { index } = monitor;
            // The The dock uses the Gdk index for monitors, where the primary monitor
            // always has index 0, so let's follow what dash-to-dock does in docking.js
            // (as part of _createDocks), but using inverted math
            index -= primaryMonitorIndex;

            if (index < 0)
                index += this._monitors.length;

            monitor.index = index;
        }
    }

    get primaryMonitor() {
        return this._primaryMonitor;
    }

    get monitors() {
        return this._monitors;
    }
}
Signals.addSignalMethods(MonitorsConfig.prototype);

function setShortcut(settings) {
    const shortcutText = settings.get_string('shortcut-text');
    const [success, key, mods] = Gtk.accelerator_parse(shortcutText);

    if (success && Gtk.accelerator_valid(key, mods)) {
        let shortcut = Gtk.accelerator_name(key, mods);
        settings.set_strv('shortcut', [shortcut]);
    } else {
        settings.set_strv('shortcut', []);
    }
}

var Settings = GObject.registerClass({
    Implements: [Gtk.BuilderScope],
}, class DashToDock_Settings extends GObject.Object {

    _init() {
        super._init();

        if (Me)
            this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dash-to-dock');
        else
            this._settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.dash-to-dock'});

        this._rtl = (Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL);

        this._builder = new Gtk.Builder();
        this._builder.set_scope(this);
        if (Me) {
            this._builder.set_translation_domain(Me.metadata['gettext-domain']);
            this._builder.add_from_file(Me.path + '/Settings.ui');
        } else {
            this._builder.add_from_file('./Settings.ui');
        }

        this.widget = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER });
        this._notebook = this._builder.get_object('settings_notebook');
        this.widget.set_child(this._notebook);

        // Set a reasonable initial window height
        this.widget.connect('realize', () => {
            const window = this.widget.get_root();
            window.set_size_request(-1, 750);
        });

        // Timeout to delay the update of the settings
        this._dock_size_timeout = 0;
        this._icon_size_timeout = 0;
        this._opacity_timeout = 0;
        this._border_radius_timeout = 0;
        this._floating_margin_timeout = 0;


        this._monitorsConfig = new MonitorsConfig();
        this._bindSettings();
    }

    vfunc_create_closure(builder, handlerName, flags, connectObject) {
        if (flags & Gtk.BuilderClosureFlags.SWAPPED)
            throw new Error('Unsupported template signal flag "swapped"');

        if (typeof this[handlerName] === 'undefined')
            throw new Error(`${handlerName} is undefined`);

        return this[handlerName].bind(connectObject || this);
    }

    dock_display_combo_changed_cb(combo) {
        if (!this._monitors?.length)
            return;

        const preferredMonitor = this._monitors[combo.get_active()].index;
        this._settings.set_int('preferred-monitor', preferredMonitor);
    }

    // custom_radius_scale_format_value_cb(scale, value) {
    //     return value + ' px'
    // }

    // custom_margin_scale_format_value_cb(scale, value) {
    //     return value + ' px';
    // }

    custom_radius_scale_value_changed_cb(scale) {
        // Avoid settings the size consinuosly
        if (this._border_radius_timeout > 0)
            GLib.source_remove(this._border_radius_timeout);

        this._border_radius_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
            this._settings.set_int('border-radius', scale.get_value());
            this._border_radius_timeout = 0;
            return GLib.SOURCE_REMOVE;
        });
    }
    
    custom_margin_scale_value_changed_cb(scale) {
        // Avoid settings the size consinuosly
        if (this._floating_margin_timeout > 0)
            GLib.source_remove(this._floating_margin_timeout);

        this._floating_margin_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
            this._settings.set_int('floating-margin', scale.get_value());
            this._floating_margin_timeout = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    custom_opacity_scale_value_changed_cb(scale) {
        // Avoid settings the opacity consinuosly as it's change is animated
        if (this._opacity_timeout > 0)
            GLib.source_remove(this._opacity_timeout);
    }

    position_top_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('dock-position', 0);
    }

    position_right_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('dock-position', 1);
    }

    position_bottom_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('dock-position', 2);
    }

    position_left_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('dock-position', 3);
    }

    icon_size_combo_changed_cb(combo) {
        this._settings.set_int('dash-max-icon-size', this._allIconSizes[combo.get_active()]);
    }

    dock_size_scale_value_changed_cb(scale) {
        // Avoid settings the size continuously
        if (this._dock_size_timeout > 0)
            GLib.source_remove(this._dock_size_timeout);
        const id = this._dock_size_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
                if (id === this._dock_size_timeout) {
                    this._settings.set_double('height-fraction', scale.get_value());
                    this._dock_size_timeout = 0;
                    return GLib.SOURCE_REMOVE;
                }
            });
    }

    custom_opacity_scale_format_value_cb(scale, value) {
        return Math.round(value * 100) + ' %';
    }


    min_opacity_scale_format_value_cb(scale, value) {
        return Math.round(value * 100) + ' %';
    }

    max_opacity_scale_format_value_cb(scale, value) {
        return Math.round(value * 100) + ' %';
    }

    all_windows_radio_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('intellihide-mode', 0);
    }

    focus_application_windows_radio_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('intellihide-mode', 1);
    }

    maximized_windows_radio_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('intellihide-mode', 2);
    }

    icon_size_scale_value_changed_cb(scale) {
        // Avoid settings the size consinuosly
        if (this._icon_size_timeout > 0)
            GLib.source_remove(this._icon_size_timeout);
        this._icon_size_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
                log(scale.get_value());
                this._settings.set_int('dash-max-icon-size', scale.get_value());
                this._icon_size_timeout = 0;
                return GLib.SOURCE_REMOVE;
            });
    }
    preview_size_scale_format_value_cb(scale, value) {
        return value == 0 ? 'auto' : value;
    }
    preview_size_scale_value_changed_cb(scale) {
        this._settings.set_double('preview-size-scale', scale.get_value());
    }
    custom_opacity_scale_value_changed_cb(scale) {
        // Avoid settings the opacity consinuosly as it's change is animated
        if (this._opacity_timeout > 0)
            GLib.source_remove(this._opacity_timeout);
        this._opacity_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
                this._settings.set_double('background-opacity', scale.get_value());
                this._opacity_timeout = 0;
                return GLib.SOURCE_REMOVE;
            });
    }
    min_opacity_scale_value_changed_cb(scale) {
        // Avoid settings the opacity consinuosly as it's change is animated
        if (this._opacity_timeout > 0)
            GLib.source_remove(this._opacity_timeout);
        this._opacity_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
                this._settings.set_double('min-alpha', scale.get_value());
                this._opacity_timeout = 0;
                return GLib.SOURCE_REMOVE;
            });
    }
    max_opacity_scale_value_changed_cb(scale) {
        // Avoid settings the opacity consinuosly as it's change is animated
        if (this._opacity_timeout > 0)
            GLib.source_remove(this._opacity_timeout);
        this._opacity_timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SCALE_UPDATE_TIMEOUT, () => {
                this._settings.set_double('max-alpha', scale.get_value());
                this._opacity_timeout = 0;
                return GLib.SOURCE_REMOVE;
            });
    }

    all_windows_radio_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('intellihide-mode', 0);
    }
    focus_application_windows_radio_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('intellihide-mode', 1);
    }
    maximized_windows_radio_button_toggled_cb(button) {
        if (button.get_active())
            this._settings.set_enum('intellihide-mode', 2);
    }

    _updateMonitorsSettings() {
        // Monitor options
        const preferredMonitor = this._settings.get_int('preferred-monitor');
        const dockMonitorCombo = this._builder.get_object('dock_monitor_combo');

        this._monitors = [];
        dockMonitorCombo.remove_all();

        // Add connected monitors
        for (const monitor of this._monitorsConfig.monitors) {
            if (!monitor.active && monitor.index !== preferredMonitor)
                continue;

            if (monitor.isPrimary) {
                dockMonitorCombo.append_text(
                    /* Translators: This will be followed by Display Name - Connector. */
                    __('Primary monitor: ') + monitor.displayName + ' - ' +
                        monitor.connector);
            } else {
                dockMonitorCombo.append_text(
                    /* Translators: Followed by monitor index, Display Name - Connector. */
                    __('Secondary monitor ') + (monitor.index + 1) + ' - ' +
                        monitor.displayName + ' - ' + monitor.connector);
            }

            this._monitors.push(monitor);

            if (monitor.index === preferredMonitor)
                dockMonitorCombo.set_active(this._monitors.length - 1);
        }
    }

    _bindSettings() {
        // Position and size panel

        this._updateMonitorsSettings();
        this._monitorsConfig.connect('updated', () => this._updateMonitorsSettings());

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

        if (this._rtl) {
            /* Left is Right in rtl as a setting */
            this._builder.get_object('position_left_button').set_label(__('Right'));
            this._builder.get_object('position_right_button').set_label(__('Left'));
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
        this._settings.bind('autohide-in-fullscreen',
            this._builder.get_object('autohide_enable_in_fullscreen_checkbutton'),
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
        this._builder.get_object('intelligent_autohide_button').connect('clicked', () => {

            let dialog = new Gtk.Dialog({
                title: __('Intelligent autohide customization'),
                transient_for: this.widget.get_root(),
                use_header_bar: true,
                modal: true
            });

            // GTK+ leaves positive values for application-defined response ids.
            // Use +1 for the reset action
            dialog.add_button(__('Reset to defaults'), 1);

            let box = this._builder.get_object('intelligent_autohide_advanced_settings_box');
            dialog.get_content_area().append(box);

            this._settings.bind('intellihide',
                this._builder.get_object('intellihide_mode_box'),
                'sensitive',
                Gio.SettingsBindFlags.GET);

            // intellihide mode

            let intellihideModeRadioButtons = [
                this._builder.get_object('all_windows_radio_button'),
                this._builder.get_object('focus_application_windows_radio_button'),
                this._builder.get_object('maximized_windows_radio_button')
            ];

            intellihideModeRadioButtons[this._settings.get_enum('intellihide-mode')].set_active(true);

            this._settings.bind('autohide',
                this._builder.get_object('require_pressure_checkbutton'),
                'sensitive',
                Gio.SettingsBindFlags.GET);

            this._settings.bind('autohide',
                this._builder.get_object('autohide_enable_in_fullscreen_checkbutton'),
                'sensitive',
                Gio.SettingsBindFlags.GET);

            this._settings.bind('require-pressure-to-show',
                this._builder.get_object('show_timeout_spinbutton'),
                'sensitive',
                Gio.SettingsBindFlags.INVERT_BOOLEAN);
            this._settings.bind('require-pressure-to-show',
                this._builder.get_object('show_timeout_label'),
                'sensitive',
                Gio.SettingsBindFlags.INVERT_BOOLEAN);
            this._settings.bind('require-pressure-to-show',
                this._builder.get_object('pressure_threshold_spinbutton'),
                'sensitive',
                Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('require-pressure-to-show',
                this._builder.get_object('pressure_threshold_label'),
                'sensitive',
                Gio.SettingsBindFlags.DEFAULT);

            dialog.connect('response', (dialog, id) => {
                if (id == 1) {
                    // restore default settings for the relevant keys
                    let keys = ['intellihide', 'autohide', 'intellihide-mode', 'autohide-in-fullscreen', 'require-pressure-to-show',
                        'animation-time', 'show-delay', 'hide-delay', 'pressure-threshold'];
                    keys.forEach(function (val) {
                        this._settings.set_value(val, this._settings.get_default_value(val));
                    }, this);
                    intellihideModeRadioButtons[this._settings.get_enum('intellihide-mode')].set_active(true);
                } else {
                    // remove the settings box so it doesn't get destroyed;
                    dialog.get_content_area().remove(box);
                    dialog.destroy();
                }
                return;
            });

            dialog.present();

        });

        // Custom Margin Formatter
        const custom_margin_scale = this._builder.get_object('custom_margin_scale');
        custom_margin_scale.set_format_value_func((_, value) => {
            return value + ' px';
        });
        
        // Custom Border Formatter
        const custom_radius_scale = this._builder.get_object('custom_radius_scale');
        custom_radius_scale.set_format_value_func((_, value) => {
            return value + ' px';
        });

        // size options
        const dock_size_scale = this._builder.get_object('dock_size_scale');
        dock_size_scale.set_value(this._settings.get_double('height-fraction'));
        dock_size_scale.add_mark(0.9, Gtk.PositionType.TOP, null);
        dock_size_scale.set_format_value_func((_, value) => {
            return Math.round(value * 100) + ' %';
        });
        let icon_size_scale = this._builder.get_object('icon_size_scale');
        icon_size_scale.set_range(8, DEFAULT_ICONS_SIZES[0]);
        icon_size_scale.set_value(this._settings.get_int('dash-max-icon-size'));
        DEFAULT_ICONS_SIZES.forEach(function (val) {
            icon_size_scale.add_mark(val, Gtk.PositionType.TOP, val.toString());
        });
        icon_size_scale.set_format_value_func((_, value) => {
            return value + ' px';
        });
        this._builder.get_object('preview_size_scale').set_value(this._settings.get_double('preview-size-scale'));

        this._builder.get_object('')

        // Corrent for rtl languages
        if (this._rtl) {
            // Flip value position: this is not done automatically
            dock_size_scale.set_value_pos(Gtk.PositionType.LEFT);
            icon_size_scale.set_value_pos(Gtk.PositionType.LEFT);
            // I suppose due to a bug, having a more than one mark and one above a value of 100
            // makes the rendering of the marks wrong in rtl. This doesn't happen setting the scale as not flippable
            // and then manually inverting it
            icon_size_scale.set_flippable(false);
            icon_size_scale.set_inverted(true);
        }

        this._settings.bind('icon-size-fixed', this._builder.get_object('icon_size_fixed_checkbutton'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('extend-height', this._builder.get_object('dock_size_extend_checkbutton'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('extend-height', this._builder.get_object('dock_size_scale'), 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

        this._settings.bind('multi-monitor',
            this._builder.get_object('dock_monitor_combo'),
            'sensitive',
            Gio.SettingsBindFlags.INVERT_BOOLEAN);


        // Apps panel

        this._settings.bind('show-running',
            this._builder.get_object('show_running_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('isolate-workspaces',
            this._builder.get_object('application_button_isolation_button'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('isolate-monitors',
            this._builder.get_object('application_button_monitor_isolation_button'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-windows-preview',
            this._builder.get_object('windows_preview_button'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('multi-monitor',
            this._builder.get_object('multi_monitor_button'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-favorites',
            this._builder.get_object('show_favorite_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-trash',
            this._builder.get_object('show_trash_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-mounts',
            this._builder.get_object('show_mounts_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('isolate-locations',
            this._builder.get_object('isolate_locations_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        const isolateLocationsBindings = ['show_trash_switch', 'show_mounts_switch'];
        const updateIsolateLocations = () => {
            this._builder.get_object('isolate_locations_row').sensitive =
                isolateLocationsBindings.some(s => this._builder.get_object(s).active);
        };
        updateIsolateLocations();
        isolateLocationsBindings.forEach(s => this._builder.get_object(s).connect(
            'notify::active', () => updateIsolateLocations()));
        this._settings.bind('show-show-apps-button',
            this._builder.get_object('show_applications_button_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-apps-at-top',
            this._builder.get_object('application_button_first_button'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-show-apps-button',
            this._builder.get_object('application_button_first_button'),
            'sensitive',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('animate-show-apps',
            this._builder.get_object('application_button_animation_button'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-show-apps-button',
            this._builder.get_object('application_button_animation_button'),
            'sensitive',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('scroll-to-focused-application',
            this._builder.get_object('scroll_to_icon_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);


        // Behavior panel

        this._settings.bind('hot-keys',
            this._builder.get_object('hot_keys_switch'),
            'active',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('hot-keys',
            this._builder.get_object('overlay_button'),
            'sensitive',
            Gio.SettingsBindFlags.DEFAULT);

        this._builder.get_object('click_action_combo').set_active(this._settings.get_enum('click-action'));
        this._builder.get_object('click_action_combo').connect('changed', (widget) => {
            this._settings.set_enum('click-action', widget.get_active());
        });

        this._builder.get_object('scroll_action_combo').set_active(this._settings.get_enum('scroll-action'));
        this._builder.get_object('scroll_action_combo').connect('changed', (widget) => {
            this._settings.set_enum('scroll-action', widget.get_active());
        });

        this._builder.get_object('shift_click_action_combo').connect('changed', (widget) => {
            this._settings.set_enum('shift-click-action', widget.get_active());
        });

        this._builder.get_object('middle_click_action_combo').connect('changed', (widget) => {
            this._settings.set_enum('middle-click-action', widget.get_active());
        });
        this._builder.get_object('shift_middle_click_action_combo').connect('changed', (widget) => {
            this._settings.set_enum('shift-middle-click-action', widget.get_active());
        });

        // Create dialog for number overlay options
        this._builder.get_object('overlay_button').connect('clicked', () => {

            let dialog = new Gtk.Dialog({
                title: __('Show dock and application numbers'),
                transient_for: this.widget.get_root(),
                use_header_bar: true,
                modal: true
            });

            // GTK+ leaves positive values for application-defined response ids.
            // Use +1 for the reset action
            dialog.add_button(__('Reset to defaults'), 1);

            let box = this._builder.get_object('box_overlay_shortcut');
            dialog.get_content_area().append(box);

            this._builder.get_object('overlay_switch').set_active(this._settings.get_boolean('hotkeys-overlay'));
            this._builder.get_object('show_dock_switch').set_active(this._settings.get_boolean('hotkeys-show-dock'));

            // We need to update the shortcut 'strv' when the text is modified
            this._settings.connect('changed::shortcut-text', () => setShortcut(this._settings));
            this._settings.bind('shortcut-text',
                this._builder.get_object('shortcut_entry'),
                'text',
                Gio.SettingsBindFlags.DEFAULT);

            this._settings.bind('hotkeys-overlay',
                this._builder.get_object('overlay_switch'),
                'active',
                Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('hotkeys-show-dock',
                this._builder.get_object('show_dock_switch'),
                'active',
                Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('shortcut-timeout',
                this._builder.get_object('timeout_spinbutton'),
                'value',
                Gio.SettingsBindFlags.DEFAULT);

            dialog.connect('response', (dialog, id) => {
                if (id == 1) {
                    // restore default settings for the relevant keys
                    let keys = ['shortcut-text', 'hotkeys-overlay', 'hotkeys-show-dock', 'shortcut-timeout'];
                    keys.forEach(function (val) {
                        this._settings.set_value(val, this._settings.get_default_value(val));
                    }, this);
                } else {
                    // remove the settings box so it doesn't get destroyed;
                    dialog.get_content_area().remove(box);
                    dialog.destroy();
                }
                return;
            });

            dialog.present();
        });

        // Create dialog for middle-click options
        this._builder.get_object('middle_click_options_button').connect('clicked', () => {

            let dialog = new Gtk.Dialog({
                title: __('Customize middle-click behavior'),
                transient_for: this.widget.get_root(),
                use_header_bar: true,
                modal: true
            });

            // GTK+ leaves positive values for application-defined response ids.
            // Use +1 for the reset action
            dialog.add_button(__('Reset to defaults'), 1);

            let box = this._builder.get_object('box_middle_click_options');
            dialog.get_content_area().append(box);

            this._builder.get_object('shift_click_action_combo').set_active(this._settings.get_enum('shift-click-action'));

            this._builder.get_object('middle_click_action_combo').set_active(this._settings.get_enum('middle-click-action'));

            this._builder.get_object('shift_middle_click_action_combo').set_active(this._settings.get_enum('shift-middle-click-action'));

            this._settings.bind('shift-click-action',
                this._builder.get_object('shift_click_action_combo'),
                'active-id',
                Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('middle-click-action',
                this._builder.get_object('middle_click_action_combo'),
                'active-id',
                Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('shift-middle-click-action',
                this._builder.get_object('shift_middle_click_action_combo'),
                'active-id',
                Gio.SettingsBindFlags.DEFAULT);

            dialog.connect('response', (dialog, id) => {
                if (id == 1) {
                    // restore default settings for the relevant keys
                    let keys = ['shift-click-action', 'middle-click-action', 'shift-middle-click-action'];
                    keys.forEach(function (val) {
                        this._settings.set_value(val, this._settings.get_default_value(val));
                    }, this);
                    this._builder.get_object('shift_click_action_combo').set_active(this._settings.get_enum('shift-click-action'));
                    this._builder.get_object('middle_click_action_combo').set_active(this._settings.get_enum('middle-click-action'));
                    this._builder.get_object('shift_middle_click_action_combo').set_active(this._settings.get_enum('shift-middle-click-action'));
                } else {
                    // remove the settings box so it doesn't get destroyed;
                    dialog.get_content_area().remove(box);
                    dialog.destroy();
                }
                return;
            });

            dialog.present();

        });

        // Appearance Panel

        this._settings.bind('apply-custom-theme', this._builder.get_object('customize_theme'), 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN | Gio.SettingsBindFlags.GET);
        this._settings.bind('apply-custom-theme', this._builder.get_object('builtin_theme_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('custom-theme-shrink', this._builder.get_object('shrink_dash_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);

        // Running indicators
        this._builder.get_object('running_indicators_combo').set_active(
            this._settings.get_enum('running-indicator-style')
        );
        this._builder.get_object('running_indicators_combo').connect(
            'changed',
            (widget) => {
                this._settings.set_enum('running-indicator-style', widget.get_active());
            }
        );

        if (this._settings.get_enum('running-indicator-style') == RunningIndicatorStyle.DEFAULT)
            this._builder.get_object('running_indicators_advance_settings_button').set_sensitive(false);

        this._settings.connect('changed::running-indicator-style', () => {
            if (this._settings.get_enum('running-indicator-style') == RunningIndicatorStyle.DEFAULT)
                this._builder.get_object('running_indicators_advance_settings_button').set_sensitive(false);
            else
                this._builder.get_object('running_indicators_advance_settings_button').set_sensitive(true);
        });

        // Create dialog for running indicators advanced settings
        this._builder.get_object('running_indicators_advance_settings_button').connect('clicked', () => {

            let dialog = new Gtk.Dialog({
                title: __('Customize running indicators'),
                transient_for: this.widget.get_root(),
                use_header_bar: true,
                modal: true
            });

            let box = this._builder.get_object('running_dots_advance_settings_box');
            dialog.get_content_area().append(box);

            this._settings.bind('running-indicator-dominant-color',
                this._builder.get_object('dominant_color_switch'),
                'active',
                Gio.SettingsBindFlags.DEFAULT);

            this._settings.bind('custom-theme-customize-running-dots',
                this._builder.get_object('dot_style_switch'),
                'active',
                Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('custom-theme-customize-running-dots',
                this._builder.get_object('dot_style_settings_box'),
                'sensitive', Gio.SettingsBindFlags.DEFAULT);

            let rgba = new Gdk.RGBA();
            rgba.parse(this._settings.get_string('custom-theme-running-dots-color'));
            this._builder.get_object('dot_color_colorbutton').set_rgba(rgba);

            this._builder.get_object('dot_color_colorbutton').connect('notify::rgba', (button) => {
                let css = button.rgba.to_string();

                this._settings.set_string('custom-theme-running-dots-color', css);
            });

            rgba.parse(this._settings.get_string('custom-theme-running-dots-border-color'));
            this._builder.get_object('dot_border_color_colorbutton').set_rgba(rgba);

            this._builder.get_object('dot_border_color_colorbutton').connect('notify::rgba', (button) => {
                let css = button.rgba.to_string();

                this._settings.set_string('custom-theme-running-dots-border-color', css);
            });

            this._settings.bind('custom-theme-running-dots-border-width',
                this._builder.get_object('dot_border_width_spin_button'),
                'value',
                Gio.SettingsBindFlags.DEFAULT);


            dialog.connect('response', (dialog, id) => {
                // remove the settings box so it doesn't get destroyed;
                dialog.get_content_area().remove(box);
                dialog.destroy();
                return;
            });

            dialog.present();

        });

        this._settings.bind('custom-background-color', this._builder.get_object('custom_background_color_switch'), 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('custom-background-color', this._builder.get_object('custom_background_color'), 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        let rgba = new Gdk.RGBA();
        rgba.parse(this._settings.get_string('background-color'));
        this._builder.get_object('custom_background_color').set_rgba(rgba);

        this._builder.get_object('custom_background_color').connect('notify::rgba', (button) => {
            let css = button.rgba.to_string();

            this._settings.set_string('background-color', css);
        });

        // Opacity
        this._builder.get_object('customize_opacity_combo').set_active_id(
            this._settings.get_enum('transparency-mode').toString()
        );
        this._builder.get_object('customize_opacity_combo').connect(
            'changed',
            (widget) => {
                this._settings.set_enum('transparency-mode', parseInt(widget.get_active_id()));
            }
        );


        this._builder.get_object('custom_radius_scale').set_value(this._settings.get_int('border-radius'));
        
        this._builder.get_object('custom_margin_scale').set_value(this._settings.get_int('floating-margin'));


        const custom_opacity_scale = this._builder.get_object('custom_opacity_scale');
        custom_opacity_scale.set_value(this._settings.get_double('background-opacity'));
        custom_opacity_scale.set_format_value_func((_, value) => {
            return Math.round(value * 100) + '%';
        });

        if (this._settings.get_enum('transparency-mode') !== TransparencyMode.FIXED)
            this._builder.get_object('custom_opacity_scale').set_sensitive(false);

        this._settings.connect('changed::transparency-mode', () => {
            if (this._settings.get_enum('transparency-mode') !== TransparencyMode.FIXED)
                this._builder.get_object('custom_opacity_scale').set_sensitive(false);
            else
                this._builder.get_object('custom_opacity_scale').set_sensitive(true);
        });

        if (this._settings.get_enum('transparency-mode') !== TransparencyMode.DYNAMIC) {
            this._builder.get_object('dynamic_opacity_button').set_sensitive(false);
        }

        this._settings.connect('changed::transparency-mode', () => {
            if (this._settings.get_enum('transparency-mode') !== TransparencyMode.DYNAMIC) {
                this._builder.get_object('dynamic_opacity_button').set_sensitive(false);
            }
            else {
                this._builder.get_object('dynamic_opacity_button').set_sensitive(true);
            }
        });


        // Create dialog for transparency advanced settings
        this._builder.get_object('dynamic_opacity_button').connect('clicked', () => {

            let dialog = new Gtk.Dialog({
                title: __('Customize opacity'),
                transient_for: this.widget.get_root(),
                use_header_bar: true,
                modal: true
            });

            let box = this._builder.get_object('advanced_transparency_dialog');
            dialog.get_content_area().append(box);

            this._settings.bind(
                'customize-alphas',
                this._builder.get_object('customize_alphas_switch'),
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );
            this._settings.bind(
                'customize-alphas',
                this._builder.get_object('min_alpha_scale'),
                'sensitive',
                Gio.SettingsBindFlags.DEFAULT
            );
            this._settings.bind(
                'customize-alphas',
                this._builder.get_object('max_alpha_scale'),
                'sensitive',
                Gio.SettingsBindFlags.DEFAULT
            );

            const min_alpha_scale = this._builder.get_object('min_alpha_scale');
            const max_alpha_scale = this._builder.get_object('max_alpha_scale');
            min_alpha_scale.set_value(
                this._settings.get_double('min-alpha')
            );
            min_alpha_scale.set_format_value_func((_, value) => {
                return Math.round(value * 100) + ' %';
            });
            max_alpha_scale.set_format_value_func((_, value) => {
                return Math.round(value * 100) + ' %';
            });

            max_alpha_scale.set_value(
                this._settings.get_double('max-alpha')
            );

            dialog.connect('response', (dialog, id) => {
                // remove the settings box so it doesn't get destroyed;
                dialog.get_content_area().remove(box);
                dialog.destroy();
                return;
            });

            dialog.present();
        });


        this._settings.bind('unity-backlit-items',
            this._builder.get_object('unity_backlit_items_switch'),
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        

        // About Panel

        if (Me)
            this._builder.get_object('extension_version').set_label(Me.metadata.version.toString());
        else
            this._builder.get_object('extension_version').set_label('Unknown');
    }
});

function init() {
    ExtensionUtils.initTranslations();
}

function buildPrefsWidget() {
    let settings = new Settings();
    let widget = settings.widget;
    return widget;
}

if (!Me) {
    GLib.setenv('GSETTINGS_SCHEMA_DIR', './schemas', true);
    Gtk.init();

    const loop = GLib.MainLoop.new(null, false);
    const win = new Gtk.Window();
    win.set_child(buildPrefsWidget());
    win.connect('close-request', () => loop.quit());
    win.present();

    loop.run();
}
