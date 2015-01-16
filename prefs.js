// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;


const Gettext = imports.gettext.domain('dashtodock');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

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

    let notebook = new Gtk.Notebook();

    /* MAIN DOCK SETTINGS */

    let dockSettings = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});
    let dockSettingsTitle = new Gtk.Label({label: _("Main Settings")});

    /* DOCK POSITION */

    let placementMain = new Gtk.Box({spacing:30,orientation:Gtk.Orientation.HORIZONTAL, homogeneous:true,
                                         margin:10});
    indentWidget(placementMain);

    let placementPosition =  new Gtk.Box({spacing:30, margin_left:10, margin_top:10, margin_right:10});
        let placementPositionLabel = new Gtk.Label({label: _("Dock Position"), use_markup: true,
                                            xalign: 0, hexpand:true});
        let placementPositionCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});

            placementPositionCombo.append_text(_("Top"));

            // Left and right are reversed in RTL languages
            if( Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL )
              placementPositionCombo.append_text(_("Left"));
            else
              placementPositionCombo.append_text(_("Right"));

            placementPositionCombo.append_text(_("Bottom"));

            if( Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL )
              placementPositionCombo.append_text(_("Right"));
            else
              placementPositionCombo.append_text(_("Left"));

            placementPositionCombo.set_active(this.settings.get_enum('dock-position'));

            placementPositionCombo.connect('changed', Lang.bind (this, function(widget) {
                    this.settings.set_enum('dock-position', widget.get_active());
            }));

    placementPosition.add(placementPositionLabel)
    placementPosition.add(placementPositionCombo);

    /* FIXED DOCK */

    let dockSettingsMain1 = new Gtk.Box({spacing:30,orientation:Gtk.Orientation.HORIZONTAL, homogeneous:true,
                                         margin:10});
    indentWidget(dockSettingsMain1);

    let dockSettingsControl1 = new Gtk.Box({spacing:30, margin_left:10, margin_top:10, margin_right:10});

    let alwaysVisibleLabel = new Gtk.Label({label: _("Dock is fixed and always visible"), use_markup: true,
                                            xalign: 0, hexpand:true});

    let alwaysVisible =  new Gtk.Switch({halign:Gtk.Align.END});
        alwaysVisible.set_active(this.settings.get_boolean('dock-fixed'));
        alwaysVisible.connect('notify::active', Lang.bind(this, function(check){
            this.settings.set_boolean('dock-fixed', check.get_active());
        }));

    dockSettingsControl1.add(alwaysVisibleLabel);
    dockSettingsControl1.add(alwaysVisible);

    /* TIMINGS SETTINGS */

    let dockSettingsGrid1= new Gtk.Grid({row_homogeneous:true,column_homogeneous:false});

    let animationTimeLabel = new Gtk.Label({label: _("Animation time [ms]"), use_markup: true, xalign: 0,hexpand:true});
    let animationTime = new Gtk.SpinButton({halign:Gtk.Align.END});
            animationTime.set_sensitive(true);
            animationTime.set_range(0, 5000);
            animationTime.set_value(this.settings.get_double('animation-time')*1000);
            animationTime.set_increments(50, 100);
            animationTime.connect('value-changed', Lang.bind(this, function(button){
                let s = button.get_value_as_int()/1000;
                this.settings.set_double('animation-time', s);
            }));

    let showDelayLabel = new Gtk.Label({label: _("Show delay [ms]"), use_markup: true, xalign: 0, hexpand:true});
    let showDelay = new Gtk.SpinButton({halign:Gtk.Align.END});
            showDelay.set_sensitive(true);
            showDelay.set_range(0, 5000);
            showDelay.set_value(this.settings.get_double('show-delay')*1000);
            showDelay.set_increments(50, 100);
            showDelay.connect('value-changed', Lang.bind(this, function(button){
                let s = button.get_value_as_int()/1000;
                this.settings.set_double('show-delay', s);
            }));

    let hideDelayLabel = new Gtk.Label({label: _("Hide delay [ms]"), use_markup: true, xalign: 0, hexpand:true});
    let hideDelay = new Gtk.SpinButton({halign:Gtk.Align.END});
            hideDelay.set_sensitive(true);
            hideDelay.set_range(0, 5000);
            hideDelay.set_value(this.settings.get_double('hide-delay')*1000);
            hideDelay.set_increments(50, 100);
            hideDelay.connect('value-changed', Lang.bind(this, function(button){
                let s = button.get_value_as_int()/1000;
                this.settings.set_double('hide-delay', s);
            }));

    /* INTELLIHIDE AUTOHIDE SETTINGS */

    let dockSettingsGrid2= new Gtk.Grid({row_homogeneous:true,column_homogeneous:false});

    let autohideLabel = new Gtk.Label({label: _("Autohide"), xalign: 0, hexpand:true});
    let autohide =  new Gtk.Switch({halign:Gtk.Align.END});
        autohide.set_active(this.settings.get_boolean('autohide'));
        autohide.connect('notify::active', Lang.bind(this, function(check){
            this.settings.set_boolean('autohide', check.get_active());
        }));

    let intellihideLabel = new Gtk.Label({label: _("intellihide"),  xalign: 0, hexpand:true});
    let intellihide =  new Gtk.Switch({halign:Gtk.Align.END});
        intellihide.set_active(this.settings.get_boolean('intellihide'));
        intellihide.connect('notify::active', Lang.bind(this, function(check){
            this.settings.set_boolean('intellihide', check.get_active());
        }));

    dockSettingsGrid1.attach(animationTimeLabel, 0,0,1,1);
    dockSettingsGrid1.attach(animationTime, 1,0,1,1);
    dockSettingsGrid1.attach(showDelayLabel, 0,1,1,1);
    dockSettingsGrid1.attach(showDelay, 1,1,1,1);
    dockSettingsGrid1.attach(hideDelayLabel, 0,2,1,1);
    dockSettingsGrid1.attach(hideDelay, 1,2,1,1);

    dockSettingsGrid2.attach(autohideLabel, 0,0,1,1);
    dockSettingsGrid2.attach(autohide, 1,0,1,1);
    dockSettingsGrid2.attach(intellihideLabel, 0,1,1,1);
    dockSettingsGrid2.attach(intellihide, 1,1,1,1);
    dockSettingsGrid2.attach(new Gtk.Label(), 0,2,1,1);

    dockSettingsMain1.add(dockSettingsGrid1);
    dockSettingsMain1.add(dockSettingsGrid2);

    this.settings.bind('dock-fixed', dockSettingsMain1, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

    let intellihideSubSettings = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:0, margin_right:10});
    indentWidget(intellihideSubSettings);

    let perappIntellihide =  new Gtk.CheckButton({label: _("Application based intellihide")});
        perappIntellihide.set_active(this.settings.get_boolean('intellihide-perapp'));
        perappIntellihide.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('intellihide-perapp', check.get_active());
        }));

    intellihideSubSettings.add(perappIntellihide);


    /* PRESSURE SETTINGS */

    let requirePressureControl = new Gtk.Box({margin_left:10, margin_top:0, margin_bottom:0, margin_right:10});
    let requirePressureContainer = new Gtk.Box({margin_left:10, margin_top:0, margin_bottom:10, margin_right:10});
    indentWidget(requirePressureControl);
    indentWidget(requirePressureContainer);


    let requirePressureButton = new Gtk.CheckButton({
        label: _("Require pressure to show the dock"),
        margin_left: 0,
        margin_top: 0
    });
    requirePressureButton.set_active(this.settings.get_boolean('require-pressure-to-show'));
    requirePressureButton.connect('toggled', Lang.bind(this, function(check) {
        this.settings.set_boolean('require-pressure-to-show', check.get_active());
    }));

    let pressureThresholdLabel = new Gtk.Label({
        label: _("Pressure threshold (px)"),
        use_markup: true,
        xalign: 0,
        margin_top: 0,
        hexpand: true
    });

    let pressureThresholdSpinner = new Gtk.SpinButton({
        halign: Gtk.Align.END,
        margin_top: 0
    });
    pressureThresholdSpinner.set_sensitive(true);
    pressureThresholdSpinner.set_range(10, 500);
    pressureThresholdSpinner.set_value(this.settings.get_double("pressure-threshold") * 1);
    pressureThresholdSpinner.set_increments(10, 20);
    pressureThresholdSpinner.connect("value-changed", Lang.bind(this, function(button) {
        let s = button.get_value_as_int() / 1;
        this.settings.set_double("pressure-threshold", s);
    }));

    requirePressureControl.add(requirePressureButton);
    requirePressureContainer.add(pressureThresholdLabel);
    requirePressureContainer.add(pressureThresholdSpinner);

    this.settings.bind('require-pressure-to-show', pressureThresholdLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('require-pressure-to-show', pressureThresholdSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);



    this.settings.bind('dock-fixed', intellihideSubSettings, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('dock-fixed', perappIntellihide, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('intellihide', intellihideSubSettings, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('autohide', requirePressureControl, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('autohide', requirePressureContainer, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


    /* POISITION AND SIZE */

    let dockMonitor = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:0, margin_right:10});
        let dockMonitorLabel = new Gtk.Label({label: _("Show the dock on following monitor (if attached)"), hexpand:true, xalign:0});
        let dockMonitorCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
            dockMonitorCombo.append_text(_("Primary (default)"));
            dockMonitorCombo.append_text(_("1"));
            dockMonitorCombo.append_text(_("2"));
            dockMonitorCombo.append_text(_("3"));
            dockMonitorCombo.append_text(_("4"));
            let active = this.settings.get_int('preferred-monitor');
            if (active<0)
                active = 0;
            dockMonitorCombo.set_active(active);

            dockMonitorCombo.connect('changed', Lang.bind (this, function(widget) {
                let active = widget.get_active();
                if (active <=0)
                    this.settings.set_int('preferred-monitor', -1);
                else
                    this.settings.set_int('preferred-monitor', active );
            }));

    dockMonitor.add(dockMonitorLabel)
    dockMonitor.add(dockMonitorCombo);

    let dockSettingsMain2 = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:false,
                                        margin_left:10, margin_top:5, margin_bottom:10, margin_right:10});
    indentWidget(dockSettingsMain2);

    let dockHeightMain = new Gtk.Box({spacing:30, orientation:Gtk.Orientation.HORIZONTAL, homogeneous:false,
                                       margin:10});
    indentWidget(dockHeightMain);
    let dockMaxHeightTimeout=0; // Used to avoid to continuosly update the dock height
    let dockMaxHeightLabel = new Gtk.Label({label: _("Max height"), xalign: 0});
    let dockMaxHeight =  new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL, valuePos: Gtk.PositionType.RIGHT});
        dockMaxHeight.set_range(0, 100);
        dockMaxHeight.set_value(this.settings.get_double('height-fraction')*100);
        dockMaxHeight.set_digits(0);
        dockMaxHeight.set_increments(5,5);
        dockMaxHeight.set_size_request(200, -1);
        dockMaxHeight.connect('value-changed', Lang.bind(this, function(button){
            let s = button.get_value()/100;
            if(dockMaxHeightTimeout>0)
                Mainloop.source_remove(dockMaxHeightTimeout);
            dockMaxHeightTimeout = Mainloop.timeout_add(250, Lang.bind(this, function(){
                this.settings.set_double('height-fraction', s);
                return false;
            }));
        }));

        dockMaxHeight.connect('format-value', function(scale, value) {return value + '%'});
    let extendHeight =  new Gtk.CheckButton({label: _("Expand (experimental and buggy)")});
        extendHeight.set_active(this.settings.get_boolean('extend-height'));
        extendHeight.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('extend-height', check.get_active());
        }));

    dockHeightMain.add(dockMaxHeightLabel);
    dockHeightMain.add(dockMaxHeight);
    dockHeightMain.add(extendHeight);

    this.settings.bind('extend-height', dockMaxHeightLabel, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('extend-height', dockMaxHeight, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

    dockSettingsMain2.add(dockHeightMain);

    dockSettings.add(placementPosition);
    dockSettings.add(dockSettingsControl1);
    dockSettings.add(dockSettingsMain1);
    dockSettings.add(intellihideSubSettings);
    dockSettings.add(requirePressureControl);
    dockSettings.add(requirePressureContainer);

    dockSettings.add(dockMonitor);
    dockSettings.add(dockSettingsMain2);

    /*ICON SIZE*/

    let iconSizeMain = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:true,
                                       margin_left:10, margin_top:10, margin_bottom:0, margin_right:10});

    let allSizes  =[ 16, 24, 32, 48, 64 ];
    let maximumIconSizeBox = new Gtk.Box({spacing:30,});

    let maximumIconSizeLabel = new Gtk.Label({label: _("Maximum icon size"), use_markup: true,
                                              xalign: 0, valign: Gtk.Align.END, margin_bottom:5,  hexpand:true});

    let maximumIconSize =  new Gtk.ComboBoxText({halign:Gtk.Align.END});

            maximumIconSize.append_text(_("16"));
            maximumIconSize.append_text(_("24"));
            maximumIconSize.append_text(_("32"));
            maximumIconSize.append_text(_("48"));
            maximumIconSize.append_text(_("64"));

            maximumIconSize.set_size_request(100, -1);

            maximumIconSize.set_active(allSizes.indexOf(this.settings.get_int('dash-max-icon-size')));

            maximumIconSize.connect('changed', Lang.bind (this, function(widget) {
                this.settings.set_int('dash-max-icon-size', allSizes[widget.get_active()]);
            }));

    maximumIconSizeBox.add(maximumIconSizeLabel);
    maximumIconSizeBox.add(maximumIconSize);

    iconSizeMain.add(maximumIconSizeBox);
    dockSettings.add(iconSizeMain);

    /* SHOW FAVORITES/RUNNING */

    let showIcons = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL,
                                 margin_left:10, margin_top:5, margin_bottom:10, margin_right:10})
    indentWidget(showIcons);

    let showFavorites =  new Gtk.CheckButton({label: _("Show favorite application icons")});
        showFavorites.set_active(this.settings.get_boolean('show-favorites'));
        showFavorites.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('show-favorites', check.get_active());
        }));
    let showRunning =  new Gtk.CheckButton({label: _("Show running application icons")});
        showRunning.set_active(this.settings.get_boolean('show-running'));
        showRunning.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('show-running', check.get_active());
        }));
    let showAppsAtTop =  new Gtk.CheckButton({label: _("Show applications button at the top")});
        showAppsAtTop.set_active(this.settings.get_boolean('show-apps-at-top'));
        showAppsAtTop.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('show-apps-at-top', check.get_active());
        }));

    showIcons.add(showFavorites);
    showIcons.add(showRunning);
    showIcons.add(showAppsAtTop);

    dockSettings.add(showIcons);

    notebook.append_page(dockSettings, dockSettingsTitle);

    /* CUSTOMIZATION PAGE */

    let customization = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});
    let customizationTitle = new Gtk.Label({label: _("Optional features")});

    /* SWITCH WORKSPACE */

    let switchWorkspaceControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

    let switchWorkspaceLabel = new Gtk.Label({label: _("Switch workspace when scrolling over the dock"),
                                              xalign: 0, hexpand:true});
    let switchWorkspace = new Gtk.Switch({halign:Gtk.Align.END});
            switchWorkspace.set_active(this.settings.get_boolean('scroll-switch-workspace'));
            switchWorkspace.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('scroll-switch-workspace', check.get_active());
            }));

    let switchWorkspaceMain = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:false,
                                       margin_left:10, margin_top:5, margin_bottom:10, margin_right:10});
    indentWidget(switchWorkspaceMain);
    let oneAtATime = new Gtk.CheckButton({label: _("Switch one workspace at a time"), margin_bottom: 5});
        oneAtATime.set_active(this.settings.get_boolean('scroll-switch-workspace-one-at-a-time'));
        oneAtATime.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('scroll-switch-workspace-one-at-a-time', check.get_active());
        }));

    let deadTimeSettings= new Gtk.Box({spacing:30, orientation:Gtk.Orientation.HORIZONTAL, homogeneous:false,
                                       margin_bottom:5});
    indentWidget(deadTimeSettings);
    let deadTimeLabel = new Gtk.Label({label: _("Deadtime between each workspace switching [ms]"), use_markup: true, xalign: 0,hexpand:true});
    let deadTime = new Gtk.SpinButton({halign:Gtk.Align.END});
            deadTime.set_sensitive(true);
            deadTime.set_range(0, 1000);
            deadTime.set_value(this.settings.get_int('scroll-switch-workspace-dead-time'));
            deadTime.set_increments(25, 50);
            deadTime.connect('value-changed', Lang.bind(this, function(button){
                let s = button.get_value_as_int();
                this.settings.set_int('scroll-switch-workspace-dead-time', s);
            }));

    let only1px = new Gtk.RadioButton({label: _("Only a 1px wide area close to the screen edge is active")});

        only1px.set_active(!this.settings.get_boolean('scroll-switch-workspace-whole'));
        only1px.connect('toggled', Lang.bind(this, function(check){
            if(check.get_active()) this.settings.set_boolean('scroll-switch-workspace-whole', false);
        }));
    let wholeArea = new Gtk.RadioButton({label: _("All the area of the dock is active"), group: only1px });
        wholeArea.set_active(this.settings.get_boolean('scroll-switch-workspace-whole'));
        wholeArea.connect('toggled', Lang.bind(this, function(check){
            if(check.get_active()) this.settings.set_boolean('scroll-switch-workspace-whole', true);
        }));

    this.settings.bind('scroll-switch-workspace-one-at-a-time', deadTimeSettings, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


    this.settings.bind('scroll-switch-workspace', switchWorkspaceMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

    deadTimeSettings.add(deadTimeLabel);
    deadTimeSettings.add(deadTime);

    switchWorkspaceMain.add(oneAtATime);
    switchWorkspaceMain.add(deadTimeSettings);
    switchWorkspaceMain.add(only1px);
    switchWorkspaceMain.add(wholeArea);

    switchWorkspaceControl.add(switchWorkspaceLabel)
    switchWorkspaceControl.add(switchWorkspace)

    customization.add(switchWorkspaceControl);
    customization.add(switchWorkspaceMain);

    /* CUSTOMIZE CLICK BEHAVIOUR */
 
    let clickControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

    let clickLabel = new Gtk.Label({label: _("Customize actions on mouse click"),
                                              xalign: 0, hexpand:true});
    let click = new Gtk.Switch({halign:Gtk.Align.END});
        click.set_active(this.settings.get_boolean('customize-click'));
        click.connect('notify::active', Lang.bind(this, function(check){
            this.settings.set_boolean('customize-click', check.get_active());
        }));

    clickControl.add(clickLabel);
    clickControl.add(click);

    let clickMain = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:false,
                                       margin_left:20, margin_top:5, margin_bottom:10, margin_right:10});

    let clickAction =  new Gtk.Box({margin_bottom:5});
        let clickActionLabel = new Gtk.Label({label: _("Action on clicking on running app"), hexpand:true, xalign:0});
        let clickActionCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
            clickActionCombo.append_text(_("Do nothing (default)"));
            clickActionCombo.append_text(_("Minimize"));
            clickActionCombo.append_text(_("Launch new window"));
            clickActionCombo.append_text(_("Cycle through application windows"));

            clickActionCombo.set_active(this.settings.get_enum('click-action'));

            clickActionCombo.connect('changed', Lang.bind (this, function(widget) {
                    this.settings.set_enum('click-action', widget.get_active());
            }));

    clickAction.add(clickActionLabel)
    clickAction.add(clickActionCombo);

    let minimizeShift =  new Gtk.CheckButton({label: _("Minimize window on shift+click (double click for all app windows)")});
        minimizeShift.set_active(this.settings.get_boolean('minimize-shift'));
        minimizeShift.connect('toggled', Lang.bind(this, function(check){
            this.settings.set_boolean('minimize-shift', check.get_active());
        }));

    clickMain.add(clickAction);
    clickMain.add(minimizeShift);

    this.settings.bind('customize-click', clickMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

    customization.add(clickControl);
    customization.add(clickMain);


    notebook.append_page(customization, customizationTitle);


    /* APPEARENCE AND THEME PAGE */

    let appearence = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});
    let appearenceTitle = new Gtk.Label({label: _("Appearence and Themes")});

    let infoLabel1 = new Gtk.Label({label: _("A customized theme is built in the extension. " +
        "This is meant to work with the default Adwaita theme: the dash is shrunk to save " +
        "space, its background transparency reduced, and custom indicators for the number " +
        "of windows of each application are added."),
                                              margin: 10, xalign: 0, hexpand:false, max_width_chars: 80});
    infoLabel1.set_line_wrap(true);
    appearence.add(infoLabel1);

    /* CUSTOM THEME */
    let customThemeControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

    let customThemeLabel = new Gtk.Label({label: _("Apply built in custom theme"),
                                              xalign: 0, hexpand:true});
    let customTheme = new Gtk.Switch({halign:Gtk.Align.END});
            customTheme.set_active(this.settings.get_boolean('apply-custom-theme'));
            customTheme.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('apply-custom-theme', check.get_active());
            }));

    customThemeControl.add(customThemeLabel)
    customThemeControl.add(customTheme)
    appearence.add(customThemeControl);


    let infoLabel2 = new Gtk.Label({label: _("Alternatively, for a better integration with custom themes, each " +
        "customization can be applied indipendently"),
                                              margin: 10, xalign: 0, hexpand:false, max_width_chars: 80});
    infoLabel2.set_line_wrap(true);
    appearence.add(infoLabel2);


    let customThemeShrinkControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

    let customThemeShrinkLabel = new Gtk.Label({label: _("Shrink the dash size by reducing padding"),
                                              xalign: 0, hexpand:true});
    let customThemeShrink = new Gtk.Switch({halign:Gtk.Align.END});
            customThemeShrink.set_active(this.settings.get_boolean('custom-theme-shrink'));
            customThemeShrink.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('custom-theme-shrink', check.get_active());
            }));

    customThemeShrinkControl.add(customThemeShrinkLabel)
    customThemeShrinkControl.add(customThemeShrink)
    appearence.add(customThemeShrinkControl);

    this.settings.bind('apply-custom-theme', customThemeShrinkControl, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

    let customThemeRunningDotsControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

    let customThemeRunningDotsLabel = new Gtk.Label({label: _("Show indicators for the number of windows of each application"),
                                              xalign: 0, hexpand:true});
    let customThemeRunningDots = new Gtk.Switch({halign:Gtk.Align.END});
            customThemeRunningDots.set_active(this.settings.get_boolean('custom-theme-running-dots'));
            customThemeRunningDots.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('custom-theme-running-dots', check.get_active());
            }));

    customThemeRunningDotsControl.add(customThemeRunningDotsLabel)
    customThemeRunningDotsControl.add(customThemeRunningDots)
    appearence.add(customThemeRunningDotsControl);

    this.settings.bind('apply-custom-theme', customThemeRunningDotsControl, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

    /* OPAQUE LAYER */

    let opaqueLayerControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:10, margin_right:10});

    let opaqueLayerLabel = new Gtk.Label({label: _("Customize the dock background opacity"), xalign: 0, hexpand:true});
    let opaqueLayer = new Gtk.Switch({halign:Gtk.Align.END});
            opaqueLayer.set_active(this.settings.get_boolean('opaque-background'));
            opaqueLayer.connect('notify::active', Lang.bind(this, function(check){
                this.settings.set_boolean('opaque-background', check.get_active());
            }));


    opaqueLayerControl.add(opaqueLayerLabel);
    opaqueLayerControl.add(opaqueLayer);

    let opaqueLayerMain = new Gtk.Box({spacing:30, orientation:Gtk.Orientation.HORIZONTAL, homogeneous:false,
                                       margin:10});
    indentWidget(opaqueLayerMain);

    let opacityLayerTimeout=0; // Used to avoid to continuosly update the opacity
    let layerOpacityLabel = new Gtk.Label({label: _("Opacity"), use_markup: true, xalign: 0});
    let layerOpacity =  new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL, valuePos: Gtk.PositionType.RIGHT});
        layerOpacity.set_range(0, 100);
        layerOpacity.set_value(this.settings.get_double('background-opacity')*100);
        layerOpacity.set_digits(0);
        layerOpacity.set_increments(5,5);
        layerOpacity.set_size_request(200, -1);
        layerOpacity.connect('value-changed', Lang.bind(this, function(button){
            let s = button.get_value()/100;
            if(opacityLayerTimeout>0)
                Mainloop.source_remove(opacityLayerTimeout);
            opacityLayerTimeout = Mainloop.timeout_add(250, Lang.bind(this, function(){
                this.settings.set_double('background-opacity', s);
                return false;
            }));
        }));

    opaqueLayerMain.add(layerOpacityLabel);
    opaqueLayerMain.add(layerOpacity);

    let opaqueLayerContainer = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});

    opaqueLayerContainer.add(opaqueLayerControl);
    opaqueLayerContainer.add(opaqueLayerMain);

    this.settings.bind('opaque-background', opaqueLayerMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('apply-custom-theme', opaqueLayerContainer, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

    appearence.add(opaqueLayerContainer);


    notebook.append_page(appearence, appearenceTitle);
/*
    let OptionalFeaturesTitle = new Gtk.Label({label: _("Optional Features")});
    let OptionalFeatures = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});

    OptionalFeatures.add(switchWorkspaceControl);
    OptionalFeatures.add(switchWorkspaceMain);

    notebook.append_page(OptionalFeatures, OptionalFeaturesTitle);
*/


    this.add(notebook);


    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new WorkspaceSettingsWidget({orientation: Gtk.Orientation.VERTICAL, spacing:5, border_width:5});
    widget.show_all();

    return widget;
}


/*
 * Add a margin to the widget:
 *  left margin in LTR
 *  right margin in RTL
 */
function indentWidget(widget){

    let indent = 20;

    if(Gtk.Widget.get_default_direction()==Gtk.TextDirection.RTL){
        widget.set_margin_right(indent);
    } else {
        widget.set_margin_left(indent);
    }
}
