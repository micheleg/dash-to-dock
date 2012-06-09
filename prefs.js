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
            scale29.set_value(this.settings.get_double('background-opacity')*100);
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



    let intellihide = new Gtk.Grid({row_spacing:5 });
    let intellihideLabel = new Gtk.Label({label: "<b>Intellihide behaviour</b>", use_markup: true, xalign: 0, margin_top:5, margin_bottom:5}); 
        let label31 =  new Gtk.RadioButton({label: "Hide", margin_left: 20});
            label31.set_active(this.settings.get_enum('normal-mode') === 0);
            label31.connect("toggled", Lang.bind(this, function(check){
                if(check.get_active()) this.settings.set_enum('normal-mode', 0);
            }));
        let label32 = new Gtk.RadioButton({label: "Show (reload extension to make it effective)", group: label31, margin_left: 20});
            label32.set_active(this.settings.get_enum('normal-mode') === 1);
            label32.connect("toggled", Lang.bind(this, function(check){
                if(check.get_active()) this.settings.set_enum('normal-mode', 1);
            }));
        let label33 = new Gtk.RadioButton({label: "Autohide", group: label31, margin_left: 20});
            label33.set_active(this.settings.get_enum('normal-mode') === 2);
            label33.connect("toggled", Lang.bind(this, function(check){
                if(check.get_active()) this.settings.set_enum('normal-mode', 2);
            }));
        let label34 = new Gtk.RadioButton({label: "Intellihide", group: label31, margin_left: 20});
            label34.set_active(this.settings.get_enum('normal-mode') === 3);
            label34.connect("toggled", Lang.bind(this, function(check){
                if(check.get_active()) this.settings.set_enum('normal-mode', 3);
            }));
    intellihide.attach(intellihideLabel,0,0,2,1);
//    intellihide.attach(label31,0,1,2,1);
//    intellihide.attach(label32,0,2,2,1);
    intellihide.attach(label33,0,3,2,1);
    intellihide.attach(label34,0,4,2,1);

    this.add(autohide);
    this.add(general);
    this.add(intellihide);



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

