// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
/*
const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(e) { return e };*/

const _ = function(t){return t;};

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;


const WorkspaceSettingsWidget = new GObject.Class({
    Name: 'WorkspaceIndicator.WorkspaceSettingsWidget',
    GTypeName: 'WorkspaceSettingsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
    this.parent(params);
    this.settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');

    let autohide = new Gtk.Grid({row_spacing:5});
        let autohideLabel = new Gtk.Label({label: "<b>Autohide timing settings</b>", use_markup: true, xalign: 0, margin_top:5, margin_bottom:5});
        let label11 = new Gtk.Label({label: "Show delay [ms]", use_markup: true, xalign: 0, margin_left: 20});
        let spin11 = new Gtk.SpinButton({margin_left: 20});
            spin11.set_sensitive(true);
            spin11.set_range(0, 5000);
            spin11.set_value(this.settings.get_double("show-delay")*1000);
            spin11.set_increments(50, 100); // 100 = page up/down increment
            spin11.connect("value-changed", Lang.bind(this, function(button){
                let s = button.get_value_as_int()/1000;
                this.settings.set_double("show-delay", s);
            }));
        let label12 = new Gtk.Label({label: "Hide delay [ms]", use_markup: true, xalign: 0, margin_left: 20});
        let spin12 = new Gtk.SpinButton({margin_left: 20});
            spin12.set_sensitive(true);
            spin12.set_range(0, 5000);
            spin12.set_value(this.settings.get_double("hide-delay")*1000);
            spin12.set_increments(50, 100); // 100 = page up/down increment
            spin12.connect("value-changed", Lang.bind(this, function(button){
                let s = button.get_value_as_int()/1000;
                this.settings.set_double("hide-delay", s);
            }));
        let label13 = new Gtk.Label({label: "Animation time [ms]", use_markup: true, xalign: 0, margin_left: 20});
        let spin13= new Gtk.SpinButton({margin_left: 20});
            spin13.set_sensitive(true);
            spin13.set_range(0, 5000);
            spin13.set_value(this.settings.get_double("animation-time")*1000);
            spin13.set_increments(50, 100); // 100 = page up/down increment
            spin13.connect("value-changed", Lang.bind(this, function(button){
                let s = button.get_value_as_int()/1000;
                this.settings.set_double("animation-time", s);
            }));

    autohide.attach(autohideLabel,0,0,2,1);
    autohide.attach(label11,0,1,1,1);
    autohide.attach(spin11,1,1,1,1);
    autohide.attach(label12,0,2,1,1);
    autohide.attach(spin12,1,2,1,1);
    autohide.attach(label13,0,3,1,1);
    autohide.attach(spin13,1,3,1,1);

    let general =  new Gtk.Grid({row_spacing:5 });
    let generalLabel = new Gtk.Label({label: "<b>Dash settings</b>", use_markup: true, xalign: 0, margin_top:5, margin_bottom:5});
         let label21 =  new Gtk.CheckButton({label: "Add an opaque layer below the dash",  margin_left: 20});
            label21.set_active(this.settings.get_boolean('opaque-background'));
            label21.connect('toggled', Lang.bind(this, function(check){
                this.settings.set_boolean('opaque-background', check.get_active());
            }));
        let label23 = new Gtk.Label({label: "Layer opacity", use_markup: true, xalign: 0, margin_left: 40});
        let scale23 =  new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL, valuePos: Gtk.PositionType.RIGHT, margin_left: 20/*, drawValue:false*/});
            scale23.set_range(0, 100);
            scale23.set_value(this.settings.get_double('background-opacity')*100);
            scale23.set_digits(0);
            scale23.set_increments(5,5);
            scale23.set_size_request(200, -1);
            scale23.connect('value-changed', Lang.bind(this, function(button){
                let s = button.get_value()/100;
                this.settings.set_double('background-opacity', s);
            }));
         let label22 =  new Gtk.CheckButton({label: "always visible", margin_left: 20});
            label22.set_active(this.settings.get_boolean('opaque-background-always'));
            label22.connect('toggled', Lang.bind(this, function(check){
                this.settings.set_boolean('opaque-background-always', check.get_active());
            }));

            this.settings.bind('opaque-background', label23, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('opaque-background', scale23, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('opaque-background', label22, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        let label24 =  new Gtk.CheckButton({label: "Switch workspace when scrolling over the dash",  margin_left: 20});
            label24.set_active(this.settings.get_boolean('scroll-switch-workspace'));
            label24.connect('toggled', Lang.bind(this, function(check){
                this.settings.set_boolean('scroll-switch-workspace', check.get_active());
            }));
        let label25 =  new Gtk.CheckButton({label: "Whole dash is sensible",  margin_left: 40});
            label25.set_active(this.settings.get_boolean('scroll-switch-workspace-whole'));
            label25.connect('toggled', Lang.bind(this, function(check){
                this.settings.set_boolean('scroll-switch-workspace-whole', check.get_active());
            }));

            this.settings.bind('scroll-switch-workspace', label25, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

        let allSizes  =[ 16, 24, 32, 48, 64 ];
        let label26 = new Gtk.Label({label: "Application icons", use_markup: true, xalign: 0, margin_left: 20, margin_top:5});

        let label27 =  new Gtk.CheckButton({label: "Show favorites", margin_left: 20});
            label27.set_active(this.settings.get_boolean('show-favorites'));
            label27.connect('toggled', Lang.bind(this, function(check){
                this.settings.set_boolean('show-favorites', check.get_active());
            }));
        let label28 =  new Gtk.CheckButton({label: "Show running", margin_left: 20});
            label28.set_active(this.settings.get_boolean('show-running'));
            label28.connect('toggled', Lang.bind(this, function(check){
                this.settings.set_boolean('show-running', check.get_active());
            }));

        let label29 = new Gtk.Label({label: "Maximum icon size", use_markup: true, xalign: 0, margin_left: 20, valign: Gtk.Align.END, margin_bottom:5});
        let scale29 =  new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL, valuePos: Gtk.PositionType.RIGHT, margin_left: 20, valign: Gtk.Align.END/*, drawValue:false*/});
            scale29.set_range(0, 4); // =[ 16, 24, 32, 48, 64 ]
            scale29.set_value(allSizes.indexOf(this.settings.get_int('dash-max-icon-size')));
            scale29.set_digits(0);
            scale29.set_increments(1,1);
            scale29.set_size_request(200, -1);

            scale29.add_mark(0,Gtk.PositionType.TOP,"16");
            scale29.add_mark(1,Gtk.PositionType.TOP,"24");
            scale29.add_mark(2,Gtk.PositionType.TOP,"32");
            scale29.add_mark(3,Gtk.PositionType.TOP,"48");
            scale29.add_mark(4,Gtk.PositionType.TOP,"64");

            scale29.connect('format-value', Lang.bind(this, function(button){
                return allSizes[Math.floor(button.get_value())].toString();
                
            }));

            scale29.connect('value-changed', Lang.bind(this, function(button){
                let s = Math.floor(button.get_value());
                this.settings.set_int('dash-max-icon-size', allSizes[s]);
            }));


    general.attach(generalLabel,0,0,3,1);
    general.attach(label21,0,1,3,1);
    general.attach(label23,0,2,1,1);
    general.attach(scale23,1,2,1,1);
    general.attach(label22,2,2,1,1);
    general.attach(label24,0,3,3,1);
    general.attach(label25,0,4,3,1);
    general.attach(label26,0,5,1,1);
    general.attach(label27,0,6,3,1);
    general.attach(label28,0,7,3,1);
    general.attach(label29,0,8,1,1);
    general.attach(scale29,1,8,2,1);



    let dockSettings = new Gtk.Grid({row_spacing:5 });
    let dockSettingsLabel = new Gtk.Label({label: "<b>Dock settings</b>", use_markup: true, xalign: 0, margin_top:5, margin_bottom:5}); 

        let label34 = new Gtk.Label({label: "Vertically centered", xalign: 0, margin_left: 20, margin_top:5});
        let switch34 = new Gtk.Switch({margin_left: 20});
            switch34.set_active(this.settings.get_boolean('vertical-centered'));
            switch34.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('vertical-centered', check.get_active());
            }));

        let label35 = new Gtk.Label({label: "Expand height", xalign: 0, margin_left: 20, margin_top:5});
        let switch35 = new Gtk.Switch({margin_left: 20});
            switch35.set_active(this.settings.get_boolean('expand-height'));
            switch35.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('expand-height', check.get_active());
            }));

        let label33 = new Gtk.Label({label: "Always visible", use_markup: true, xalign: 0, margin_left: 20, margin_top:5});
        let switch33 =  new Gtk.Switch({margin_left: 20});
            switch33.set_active(this.settings.get_boolean('dock-fixed'));
            switch33.connect("notify::active", Lang.bind(this, function(check){
                this.settings.set_boolean('dock-fixed', check.get_active());
            }));

        let label31 = new Gtk.Label({label: "Autohide", use_markup: true, xalign: 0, margin_left: 20, margin_top:5});
        let switch31 =  new Gtk.Switch({margin_left: 20});
            switch31.set_active(this.settings.get_boolean('autohide'));
            switch31.connect("notify::active", Lang.bind(this, function(check){
                this.settings.set_boolean('autohide', check.get_active());
            }));

        let label32 = new Gtk.Label({label: "intellihide", use_markup: true, xalign: 0, margin_left: 20, margin_top:5});
        let switch32 =  new Gtk.Switch({margin_left: 20});
            switch32.set_active(this.settings.get_boolean('intellihide'));
            switch32.connect("notify::active", Lang.bind(this, function(check){
                this.settings.set_boolean('intellihide', check.get_active());
            }));

        this.settings.bind('dock-fixed', label31, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this.settings.bind('dock-fixed', label32, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this.settings.bind('dock-fixed', switch31, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        this.settings.bind('dock-fixed', switch32, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

    dockSettings.attach(dockSettingsLabel,0,0,2,1);
    dockSettings.attach(label34,0,1,1,1);;
    dockSettings.attach(switch34,1,1,2,1);;
    dockSettings.attach(label35,0,2,1,1);;
    dockSettings.attach(switch35,1,2,2,1);;
    dockSettings.attach(label33,0,3,1,1);;
    dockSettings.attach(switch33,1,3,2,1);
    dockSettings.attach(label31,0,4,1,1);
    dockSettings.attach(switch31,1,4,2,1)
    dockSettings.attach(label32,0,5,1,1);;
    dockSettings.attach(switch32,1,5,2,1);

    this.add(autohide);
    this.add(general);
    this.add(dockSettings);

    }
});

function init() {
   // Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new WorkspaceSettingsWidget({orientation: Gtk.Orientation.VERTICAL, spacing:5, border_width:5});
    widget.show_all();

    return widget;
}

