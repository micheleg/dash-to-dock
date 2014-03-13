// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
const ViewSelector = imports.ui.viewSelector;
const WorkspaceSwitcherPopup= imports.ui.workspaceSwitcherPopup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const MyDash = Me.imports.myDash;

function dockedDash(settings) {

    this._init(settings);
}

dockedDash.prototype = {
    _numHotkeys: 10,
 
    _init: function(settings) {

        this._rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalHandler = new Convenience.globalSignalHandler();

        // authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        this._autohideStatus = this._settings.get_boolean('autohide') && !this._settings.get_boolean('dock-fixed');

        // initialize animation status object
        this._animStatus = new animationStatus(true);

        // initialize colors with generic values
        this._defaultBackground = {red: 0, green:0, blue: 0, alpha:0};
        this._defaultBackgroundColor = {red: 0, green:0, blue: 0, alpha:0};
        this._customizedBackground = {red: 0, green:0, blue: 0, alpha:0};

        // Hide usual Dash
        // For some reason if I hide the actor object as I used to do before reshowing it when disabling
        // the extension leads to the dash being placed in the center of the overview.
        // Hiding the parent container seems to work properly instead
        // I don't know if it's linked with this bug: https://bugzilla.gnome.org/show_bug.cgi?id=692744.
        // However tha same workaround doesn't work.
        Main.overview._controls._dashSlider.actor.hide();

        // Create a new dash object
        this.dash = new MyDash.myDash(this._settings); // this.dash = new MyDash.myDash();
        this.forcedOverview = false;

        // connect app icon into the view selector
        this.dash.showAppsButton.connect('notify::checked', Lang.bind(this, this._onShowAppsButtonToggled));

        // Create the main actor and the main container for centering, turn on track hover

        this._box = new St.BoxLayout({ name: 'dashtodockBox', reactive: true, track_hover:true,
            style_class: 'box'} );
        this.actor = new St.Bin({ name: 'dashtodockContainer',reactive: false,
            style_class: 'container', y_align: St.Align.MIDDLE, child: this._box});

        this._box.connect("notify::hover", Lang.bind(this, this._hoverChanged));
        this._realizeId = this.actor.connect("realize", Lang.bind(this, this._initialize));

        // Create and apply height constraint to the dash. It's controlled by this.actor height
        this.actor.height = Main.overview.viewSelector.actor.height; // Guess initial reasonable height.
        this.constrainHeight = new Clutter.BindConstraint({ source: this.actor,
                                                            coordinate: Clutter.BindCoordinate.HEIGHT });
        this.dash.actor.add_constraint(this.constrainHeight);

        // Put dock on the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // this store size and the position where the dash is shown;
        // used by intellihide module to check window overlap.
        this.staticBox = new Clutter.ActorBox({x1:0, y1:0, x2:100, y2:500});

        // Connect global signals
        this._signalHandler.push(
            // Allow app icons do be dragged out of the chrome actors when reordering or deleting theme while not on overview mode
            // by changing global stage input mode
            [
                Main.overview,
                'item-drag-begin',
                Lang.bind(this, this._onDragStart)
            ],
            [
                Main.overview,
                'item-drag-end',
                Lang.bind(this, this._onDragEnd)
            ],
            [
                Main.overview,
                'item-drag-cancelled',
                Lang.bind(this, this._onDragEnd)
            ],
            // update wne monitor changes, for instance in multimonitor when monitor are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._resetPosition )
            ],
            // keep the dock above Main.wm._workspaceSwitcherPopup.actor
            [
                global.window_manager,
                'switch-workspace',
                Lang.bind(this, this._onSwitchWorkspace)
            ],
            // When theme changes re-obtain default background color
            [
                St.ThemeContext.get_for_stage (global.stage),
                'changed',
                Lang.bind(this, this._onThemeChanged)
            ],
            [
                Main.overview,
                'showing',
                Lang.bind(this, this.disableAutoHide)
            ],
            // Follow 3.8 behaviour: hide on appview
            [
                Main.overview.viewSelector,
                'page-changed',
                Lang.bind(this, this._pageChanged)
            ],
            // Ensure the ShowAppsButton status is kept in sync
            [
                Main.overview.viewSelector._showAppsButton,
                'notify::checked',
                Lang.bind(this, this._syncShowAppsButtonToggled)
            ]
        );

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        //Add dash container actor and the container to the Chrome.
        this._box.add_actor(this.dash.actor);

        // Add aligning container without tracking it for input region (old affectsinputRegion: false that was removed).
        // The public method trackChrome requires the actor to be child of a tracked actor. Since I don't want the parent
        // to be tracked I use the private internal _trackActor instead.
        Main.uiGroup.add_child(this.actor);
        Main.layoutManager._trackActor(this._box, {trackFullscreen: true});
        Main.layoutManager._trackActor(this.dash._box, { affectsStruts: this._settings.get_boolean('dock-fixed')});

        // pretend this._box is isToplevel child so that fullscreen is actually tracked
        let index = Main.layoutManager._findActor(this._box);
        Main.layoutManager._trackedActors[index].isToplevel = true ;

        // Since the actor is not a topLevel child and its parent is now not added to the Chrome,
        // the allocation change of the parent container (slide in and slideout) doesn't trigger
        // anymore an update of the input regions. Force the update manually.
        this.actor.connect('notify::allocation',
                                              Lang.bind(Main.layoutManager, Main.layoutManager._queueUpdateRegions));

        this.dash._container.connect('allocation-changed', Lang.bind(this, this._updateStaticBox));

        // sync hover after a popupmenu is closed
        this.dash.connect('menu-closed', Lang.bind(this, function(){this._box.sync_hover();}));

        // Restore dash accessibility
        Main.ctrlAltTabManager.addGroup(
            this.dash.actor, _("Dash"),'user-bookmarks',
                {focusCallback: Lang.bind(this, this._onAccessibilityFocus)});

        // Load optional features
        this._optionalScrollWorkspaceSwitch();
        this._hotKeysEnabled = false;
        this._optionalHotKeys();
    },

    _initialize: function(){
        if(this._realizeId>0){
            this.actor.disconnect(this._realizeId);
            this._realizeId=0;
        }

        // Set initial position
        this._resetPosition();

        // Since Gnome 3.8 dragging an app without having opened the overview before cause the attemp to
        //animate a null target since some variables are not initialized when the viewSelector is created
        if(Main.overview.viewSelector._activePage == null)
                Main.overview.viewSelector._activePage = Main.overview.viewSelector._workspacesPage;

        // Now that the dash is on the stage and custom themes should be loaded
        // retrieve its background color
        this._getBackgroundColor();
        this._updateBackgroundOpacity();

        // Show 
        this.actor.set_opacity(255); //this.actor.show();

    },

    destroy: function(){

        // Disconnect global signals
        this._signalHandler.disconnect();
        // Destroy main clutter actor: this should be sufficient
        // From clutter documentation:
        // If the actor is inside a container, the actor will be removed.
        // When you destroy a container, its children will be destroyed as well. 
        this.actor.destroy();

        // Reshow normal dash previously hidden, restore panel position if changed.
        Main.overview._controls._dashSlider.actor.show();
        this._revertMainPanel();
        
        this._disableHotKeys();
    },

    _bindSettingsChanges: function() {

        this._settings.connect('changed::opaque-background', Lang.bind(this,this._updateBackgroundOpacity));

        this._settings.connect('changed::background-opacity', Lang.bind(this,this._updateBackgroundOpacity));

        this._settings.connect('changed::opaque-background-always', Lang.bind(this,this._updateBackgroundOpacity));

        this._settings.connect('changed::scroll-switch-workspace', Lang.bind(this, function(){
            this._optionalScrollWorkspaceSwitch(this._settings.get_boolean('scroll-switch-workspace'));
        }));
        
        this._settings.connect('changed::hot-keys', Lang.bind(this, function() {
            this._optionalHotKeys(this._settings.get_boolean('hot-keys'));
        }));

        this._settings.connect('changed::dash-max-icon-size', Lang.bind(this, function(){
            this.dash.setMaxIconSize(this._settings.get_int('dash-max-icon-size'));
        }));

        this._settings.connect('changed::show-favorites', Lang.bind(this, function(){
            this.dash.resetAppIcons();
        }));

        this._settings.connect('changed::show-running', Lang.bind(this, function(){
            this.dash.resetAppIcons();
        }));

        this._settings.connect('changed::show-apps-at-top', Lang.bind(this, function(){
            this.dash.resetAppIcons();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function(){
            Main.layoutManager._untrackActor(this.dash._box);
            Main.layoutManager._trackActor(this.dash._box, {affectsStruts: this._settings.get_boolean('dock-fixed')});

            if(this._settings.get_boolean('dock-fixed')) {
                // show dash
                this.disableAutoHide();
            } else {
                this.emit('box-changed');
            }

            this._updateYPosition();
        }));
        this._settings.connect('changed::autohide', Lang.bind(this, function(){
            this.emit('box-changed');
        }));
        this._settings.connect('changed::extend-height', Lang.bind(this, this._updateYPosition));
        this._settings.connect('changed::preferred-monitor', Lang.bind(this,this._resetPosition));
        this._settings.connect('changed::height-fraction', Lang.bind(this,this._updateYPosition));

    },

    _hoverChanged: function() {
        // Skip if dock is not in autohide mode for instance because it is shown by intellihide
        if(this._settings.get_boolean('autohide') && this._autohideStatus){
            if( this._box.hover ) {
                this._show();
            } else {
                this._hide();
            }
        }
    },
    
    _activateApp: function(appIndex, modifier) {
        let children = this.dash._box.get_children().filter(function(actor) {
                return actor.child &&
                       actor.child._delegate &&
                       actor.child._delegate.app;
            });
        
        // Apps currently in the dash
        let apps = children.map(function(actor) {
                return actor.child._delegate;
            });
        
        if (appIndex < apps.length) {
            apps[appIndex]._onActivate({ get_state: function() { return modifier; }, get_click_count: function() { return 1; }, simulated_hotkey_events: true });
        }
    },

    _show: function() {  

        var anim = this._animStatus;

        if( this._autohideStatus && ( anim.hidden() || anim.hiding() ) ){

            let delay;
            // If the dock is hidden, wait this._settings.get_double('show-delay') before showing it; 
            // otherwise show it immediately.
            if(anim.hidden()){
                delay = this._settings.get_double('show-delay');
            } else if(anim.hiding()){
                // suppress all potential queued hiding animations (always give priority to show)
                this._removeAnimations();
                delay = 0;
            }

            this._animateIn(this._settings.get_double('animation-time'), delay);
        }
    },

    _hide: function() {

        var anim = this._animStatus;

        // If no hiding animation is running or queued
        if( this._autohideStatus && (anim.showing() || anim.shown()) ){

            let delay;

            // If a show is queued but still not started (i.e the mouse was 
            // over the screen  border but then went away, i.e not a sufficient 
            // amount of time is passeed to trigger the dock showing) remove it.
            if( anim.showing()) {
                if(anim.running){
                    //if a show already started, let it finish; queue hide without removing the show.
                    // to obtain this I increase the delay to avoid the overlap and interference 
                    // between the animations
                    delay = this._settings.get_double('hide-delay') + 1.2*this._settings.get_double('animation-time') + this._settings.get_double('show-delay');

                } else {
                    this._removeAnimations();
                    delay = 0;
                }
            } else if( anim.shown() ) {
                delay = this._settings.get_double('hide-delay');
            }

            this._animateOut(this._settings.get_double('animation-time'), delay);

        }
    },

    _animateIn: function(time, delay) {

        let final_position, anchor_point;

        // Move anchor point so mode so that when dash icon size changes
        // the dash stays at the right position
        if(this._rtl){
            anchor_point = Clutter.Gravity.NORTH_EAST;
            final_position = this.staticBox.x2;
        } else {
            anchor_point = Clutter.Gravity.NORTH_WEST;
            final_position = this.staticBox.x1;
        }

        /* Animate functions are also used for 'hard' position reset with time==0
         * and delay==0 since they keep this._animStatus in sync. But I really
         * want to remove all queued animation in this instance (Only running
         * animation are removed adding a new Tween).
         */
        if (time==0 && delay==0)
            this._removeAnimations();

        this._animStatus.queue(true);
        Tweener.addTween(this.actor,{
            x: final_position,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onUpdate: Lang.bind(this, this._updateClip),
            onStart:  Lang.bind(this, function() {
                this._animStatus.start();
                this.actor.move_anchor_point_from_gravity(anchor_point);
            }),
            onOverwrite : Lang.bind(this, function() {this._animStatus.clear();}),
            onComplete: Lang.bind(this, function() {this._animStatus.end();})
        });
    },

    _animateOut: function(time, delay){

        let final_position, anchor_point;

        // Move anchor point so that when dash icon size changes
        // the dash stays at the right position
        if(this._rtl){
            anchor_point = Clutter.Gravity.NORTH_WEST;
            final_position = this.staticBox.x2 - 1;
        } else {
            anchor_point = Clutter.Gravity.NORTH_EAST;
            final_position = this.staticBox.x1 + 1;
        }

        /* Animate functions are also used for 'hard' position reset with time==0
         * and delay==0 since they keep this._animStatus in sync. But I really
         * want to remove all queued animation in this instance (Only running
         * animation are removed adding a new Tween).
         */
        if (time==0 && delay==0)
            this._removeAnimations();

        this._animStatus.queue(false);
        Tweener.addTween(this.actor,{
            x: final_position,
            time: time,
            delay: delay ,
            transition: 'easeOutQuad',
            onUpdate: Lang.bind(this, this._updateClip),
            onStart:  Lang.bind(this, function() {
                this._animStatus.start();
                this.actor.move_anchor_point_from_gravity(anchor_point);
            }),
            onOverwrite : Lang.bind(this, function() {this._animStatus.clear();}),
            onComplete: Lang.bind(this, function() {
                this._animStatus.end();
                })
        });
    },

    // clip the dock to the current monitor;
    // inspired by dock@gnome-shell-extensions.gcampax.github.com
    _updateClip: function(){

        // Here we implicitly assume that the stage and actor's parent
        // share the same coordinate space
        let clip = new Clutter.ActorBox({ x1: this._monitor.x,
                          y1: this._monitor.y,
                          x2: this._monitor.x + this._monitor.width,
                          y2: this._monitor.y + this._monitor.height});

        // Translate back into actor's coordinate space
        // While the actor moves, the clip has to move in the opposite direction
        // to mantain its position in respect to the screen. Also take into account
        // the actor anchor point.

        let [x_anchor, y_anchor] = this.actor.get_anchor_point();

        clip.x1 -= this.actor.x - x_anchor;
        clip.x2 -= this.actor.x - x_anchor;
        clip.y1 -= this.actor.y - y_anchor;
        clip.y2 -= this.actor.y - y_anchor;

        // Apply the clip
        this.actor.set_clip(clip.x1, clip.y1, clip.x2-clip.x1, clip.y2 - clip.y1);

    },

    _fadeOutBackground:function (time, delay) {

        this.dash._container.set_style('transition-duration: ' + time + 's;' +
            'transition-delay: '+ delay +'s; ' +
            'background-color:'+ this._defaultBackground);
    }, 

    _fadeInBackground:function (time, delay) {

        this.dash._container.set_style('transition-duration: ' + time + 's;' +
            'transition-delay: '+ delay +'s; ' +
            'background-color:'+ this._customizedBackground);
    },

    _updateBackgroundOpacity: function() {

        let newAlpha = this._settings.get_double('background-opacity');

        this._defaultBackground = 'rgba('+
            this._defaultBackgroundColor.red + ','+
            this._defaultBackgroundColor.green + ','+
            this._defaultBackgroundColor.blue + ','+
            Math.round(this._defaultBackgroundColor.alpha/2.55)/100 + ')';

        this._customizedBackground = 'rgba('+
            this._defaultBackgroundColor.red + ','+
            this._defaultBackgroundColor.green + ','+
            this._defaultBackgroundColor.blue + ','+
            newAlpha + ')';

        if(this._settings.get_boolean('opaque-background') && (this._autohideStatus || this._settings.get_boolean('opaque-background-always'))){
            this._fadeInBackground(this._settings.get_double('animation-time'), 0);
        }
        else if(!this._settings.get_boolean('opaque-background') || (!this._autohideStatus && !this._settings.get_boolean('opaque-background-always'))) {
            this._fadeOutBackground(this._settings.get_double('animation-time'), 0);
        }
    },

    _getBackgroundColor: function() {

        // Remove custom style
        let oldStyle = this.dash._container.get_style();
        this.dash._container.set_style(null);

        // Prevent shell crash if the actor is not on the stage.
        // It happens enabling/disabling repeatedly the extension
        if(!this.dash._container.get_stage())
            return;

        let themeNode = this.dash._container.get_theme_node();
        this.dash._container.set_style(oldStyle);

        this._defaultBackgroundColor = themeNode.get_background_color();
    },

    _onThemeChanged: function() {
        this.dash._queueRedisplay();
        this._getBackgroundColor();
        this._updateBackgroundOpacity();
    },

    _isPrimaryMonitor: function() {
        return (this._monitor.x == Main.layoutManager.primaryMonitor.x &&
             this._monitor.y == Main.layoutManager.primaryMonitor.y);
    },

    _updateYPosition: function() {

        let unavailableTopSpace = 0;
        let unavailableBottomSpace = 0;

        let extendHeight = this._settings.get_boolean('extend-height');
        let dockFixed = this._settings.get_boolean('dock-fixed');

        // check if the dock is on the primary monitor
        if (this._isPrimaryMonitor()){
            if (!extendHeight || !dockFixed) {
                unavailableTopSpace = Main.panel.actor.height;
            }
        }

        let availableHeight = this._monitor.height - unavailableTopSpace - unavailableBottomSpace;

        let fraction = this._settings.get_double('height-fraction');

        if(extendHeight)
            fraction = 1;
        else if(fraction<0 || fraction >1)
            fraction = 0.95;

        this.actor.height = Math.round( fraction * availableHeight);
        this.actor.y = this._monitor.y + unavailableTopSpace + Math.round( (1-fraction)/2 * availableHeight);
        this.actor.y_align = St.Align.MIDDLE;

        if(extendHeight){
            this.dash._container.set_height(this.actor.height);
            this.actor.add_style_class_name('extended');
        } else {
            this.dash._container.set_height(-1);
            this.actor.remove_style_class_name('extended');
        }

        this._updateStaticBox();
    },

    // Shift panel position to extend the dash to the full monitor height
    _updateMainPanel: function() {
        let extendHeight = this._settings.get_boolean('extend-height');
        let dockFixed = this._settings.get_boolean('dock-fixed');
        let panelActor = Main.panel.actor;

        if (this._isPrimaryMonitor() && extendHeight && dockFixed) {
            panelActor.set_width(this._monitor.width - this._box.width);
            if (this._rtl) {
                panelActor.set_margin_right(this._box.width - 1);
            } else {
                panelActor.set_margin_left(this._box.width - 1);
            }
        } else {
            this._revertMainPanel();
        }
    },

    _revertMainPanel: function() {
        let panelActor = Main.panel.actor;
        panelActor.set_width(this._monitor.width);
        panelActor.set_margin_right(0);
        panelActor.set_margin_left(0);
    },

    _updateStaticBox: function() {

        this.staticBox.init_rect(
            this._monitor.x + (this._rtl?(this._monitor.width - this._box.width):0),
            this.actor.y + this._box.y,
            this._box.width,
            this._box.height
        );

        // If allocation is changed, probably also the clipping has to be updated.
        this._updateClip();

        this._updateMainPanel();

        this.emit('box-changed');
    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        this._monitor = this._getMonitor();
        this._updateStaticBox();
        if( this._animStatus.hidden() || this._animStatus.hiding())
            this._animateOut(0,0);
        else {
            this._animateOut(0,0);
            this._animateIn(this._settings.get_double('animation-time'),0);
        }
        this._updateYPosition();
        this._updateClip();
    },

    _getMonitor: function(){

        let monitorIndex = this._settings.get_int('preferred-monitor');
        let monitor;

        if (monitorIndex >0 && monitorIndex< Main.layoutManager.monitors.length)
            monitor = Main.layoutManager.monitors[monitorIndex];
        else
            monitor = Main.layoutManager.primaryMonitor;

        return monitor;
    },

    _removeAnimations: function() {
        Tweener.removeTweens(this.actor);
        this._animStatus.clearAll();
    },

    _onDragStart: function(){
        this._oldAutohideStatus = this._autohideStatus;
        this._autohideStatus = false;
        this._animateIn(this._settings.get_double('animation-time'), 0);
    },

    _onDragEnd: function(){
        if(this._oldAutohideStatus)
            this._autohideStatus  = this._oldAutohideStatus;
        this._box.sync_hover();
        if(Main.overview._shown)
            this._pageChanged();
    },

    _pageChanged: function() {

        let activePage = Main.overview.viewSelector.getActivePage();
        let dashVisible = (activePage == ViewSelector.ViewPage.WINDOWS ||
                           activePage == ViewSelector.ViewPage.APPS);

        if(dashVisible){
            this._animateIn(this._settings.get_double('animation-time'), 0);
        } else {
            this._animateOut(this._settings.get_double('animation-time'), 0);
        }
    },

    _onSwitchWorkspace: function(){
        // workspace switcher group actor is stealing my focus when 
        // switching workspaces! Sometimes my actor is placed below it; 
        // try to keep it above.
        if(Main.wm._workspaceSwitcherPopup) {
            this.actor.raise(Main.wm._workspaceSwitcherPopup.actor);
        }
    },

    // Show dock and give key focus to it
    _onAccessibilityFocus: function(){
        this.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);

        this._animateIn(this._settings.get_double('animation-time'), 0);
    },

    _onShowAppsButtonToggled: function() {

        // Sync the status of the default appButtons. Only if the two statuses are
        // different, that means the user interacted with the extension provided
        // application button, cutomize the behaviour. Otherwise the shell has changed the
        // status (due to the _syncShowAppsButtonToggled function below) and it
        // has already performed the desired action.

        let selector = Main.overview.viewSelector;

        if(selector._showAppsButton.checked !== this.dash.showAppsButton.checked){

            if(this.dash.showAppsButton.checked){
                if (!Main.overview._shown) {
                    // force entering overview if needed
                    Main.overview.show();
                    this.forcedOverview = true;
                }
                selector._showAppsButton.checked = true;
            } else {
                if (this.forcedOverview) {
                    // force exiting overview if needed
                    Main.overview.hide();
                    this.forcedOverview = false;
                }
                selector._showAppsButton.checked = false;
            }
        }

        // whenever the button is unactivated even if not by the user still reset the
        // forcedOverview flag
        if( this.dash.showAppsButton.checked==false)
            this.forcedOverview = false;
    },

    // Keep ShowAppsButton status in sync with the overview status
    _syncShowAppsButtonToggled: function() {
        let status = Main.overview.viewSelector._showAppsButton.checked;
        if(this.dash.showAppsButton.checked !== status)
            this.dash.showAppsButton.checked = status;
    },

    // Optional features enable/disable

    // Switch workspace by scrolling over the dock
    _optionalScrollWorkspaceSwitch: function() {

        let label = 'optionalScrollWorkspaceSwitch';

        this._settings.connect('changed::scroll-switch-workspace',Lang.bind(this, function(){
            if(this._settings.get_boolean('scroll-switch-workspace'))
                Lang.bind(this, enable)();
            else
                Lang.bind(this, disable)();
        }));

        if(this._settings.get_boolean('scroll-switch-workspace'))
            Lang.bind(this, enable)();

        function enable(){

            // Sometimes Main.wm._workspaceSwitcherPopup is null when first loading the extension
            if (Main.wm._workspaceSwitcherPopup == null)
                Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
                Main.wm._workspaceSwitcherPopup.connect('destroy', function() {
                    Main.wm._workspaceSwitcherPopup = null;
                });

            this._signalHandler.disconnectWithLabel(label);

            this._signalHandler.pushWithLabel(label,
                [
                    this._box,
                    'scroll-event',
                    Lang.bind(this, onScrollEvent)
                ]
            );

            this._optionalScrollWorkspaceSwitchDeadTimeId=0;
        }

        function disable() {
            this._signalHandler.disconnectWithLabel(label);

            if(this._optionalScrollWorkspaceSwitchDeadTimeId>0){
                Mainloop.source_remove(this._optionalScrollWorkspaceSwitchDeadTimeId);
                this._optionalScrollWorkspaceSwitchDeadTimeId=0;
            }
        }

        // This was inspired to desktop-scroller@obsidien.github.com
        function onScrollEvent(actor, event) {

            let activeWs = global.screen.get_active_workspace();
            let direction = 0; // 0: do nothing; +1: up; -1:down.

            // filter events occuring not near the screen border if required
            if(this._settings.get_boolean('scroll-switch-workspace-whole')==false) {

                let [x,y] = event.get_coords();

                if (this._rtl) {
                    if(x < this.staticBox.x2 - 1)
                        return false;
                } else {
                    if(x > this.staticBox.x1 + 1)
                        return false;
                }
            }

            switch ( event.get_scroll_direction() ) {
            case Clutter.ScrollDirection.UP:
                direction = 1;
                break;
            case Clutter.ScrollDirection.DOWN:
                direction = -1;
                break;
            case Clutter.ScrollDirection.SMOOTH:
                let [dx, dy] = event.get_scroll_delta();
                if(dy < 0){
                    direction = 1;
                } else if(dy > 0) {
                    direction = -1;
                }
                break;
            }

            if(direction !==0 ){

                // Prevent scroll events from triggering too many workspace switches
                // by adding a deadtime between each scroll event.
                // Usefull on laptops when using a touchpad.
                if(this._settings.get_boolean('scroll-switch-workspace-one-at-a-time')){
                    // During the deadtime do nothing
                    if(this._optionalScrollWorkspaceSwitchDeadTimeId>0)
                        return false;
                    else {
                        this._optionalScrollWorkspaceSwitchDeadTimeId =
                                Mainloop.timeout_add(this._settings.get_int('scroll-switch-workspace-dead-time'),
                                    Lang.bind(this, function() {
                                        this._optionalScrollWorkspaceSwitchDeadTimeId=0;
                                    }
                        ));
                    }
                }


                let ws;

                if (direction>0)
                    ws = activeWs.get_neighbor(Meta.MotionDirection.UP)
                else
                    ws = activeWs.get_neighbor(Meta.MotionDirection.DOWN);

                Main.wm.actionMoveWorkspace(ws);

                return true;

            } else {
                return false;
            }
        }

    },
    
    _optionalHotKeys: function() {
        if(this._settings.get_boolean('hot-keys'))
            this._enableHotKeys();
        else
            this._disableHotKeys();
    },
    
    _enableHotKeys: function() {
        if (this._hotKeysEnabled) {
            return;
        }
        
        // Setup keyboard bindings for dash elements
        
        for (let i = 0; i < this._numHotkeys; i++) {
            let appNum = i;
            Main.wm.addKeybinding('app-hotkey-' + (i + 1), this._settings, Meta.KeyBindingFlags.NONE, Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY, Lang.bind(this, function() {
                this._activateApp(appNum, 0);
            }));
            
            Main.wm.addKeybinding('app-shift-hotkey-' + (i + 1), this._settings, Meta.KeyBindingFlags.NONE, Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY, Lang.bind(this, function() {
                this._activateApp(appNum, Clutter.ModifierType.SHIFT_MASK);
            }));
            
            Main.wm.addKeybinding('app-ctrl-hotkey-' + (i + 1), this._settings, Meta.KeyBindingFlags.NONE, Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY, Lang.bind(this, function() {
                this._activateApp(appNum, Clutter.ModifierType.CONTROL_MASK);
            }));
        }
        
        this._hotKeysEnabled = true;
    },
    
    _disableHotKeys: function() {
        if (!this._hotKeysEnabled) {
            return;
        }
        
        // Remove keyboard bindings for dash elements
        for (let i = 0; i < this._numHotkeys; i++) {
            Main.wm.removeKeybinding('app-hotkey-' + (i + 1));
            Main.wm.removeKeybinding('app-shift-hotkey-' + (i + 1));
            Main.wm.removeKeybinding('app-ctrl-hotkey-' + (i + 1));
        }
        
        this._hotKeysEnabled = false;
    },

    // Disable autohide effect, thus show dash
    disableAutoHide: function() {
        if(this._autohideStatus==true){
            this._autohideStatus = false;

            this._removeAnimations();
            this._animateIn(this._settings.get_double('animation-time'), 0);
            if(this._settings.get_boolean('opaque-background') && !this._settings.get_boolean('opaque-background-always'))
                this._fadeOutBackground(this._settings.get_double('animation-time'), 0);
        }
    },

    // Enable autohide effect, hide dash
    enableAutoHide: function() {
        if(this._autohideStatus==false){

            let delay=0; // immediately fadein background if hide is blocked by mouseover,
                         // oterwise start fadein when dock is already hidden.
            this._autohideStatus = true;
            this._removeAnimations();

            if(this._box.hover==true)
                this._box.sync_hover();

            if( !this._box.hover || !this._settings.get_boolean('autohide')) {
                this._animateOut(this._settings.get_double('animation-time'), 0);
                delay = this._settings.get_double('animation-time');
            } else {
                delay = 0;
            }
            
            if(this._settings.get_boolean('opaque-background') && !this._settings.get_boolean('opaque-background-always'))
                this._fadeInBackground(this._settings.get_double('animation-time'), delay);
        }
    }
};

Signals.addSignalMethods(dockedDash.prototype);

/*
 * Store animation status in a perhaps overcomplicated way.
 * status is true for visible, false for hidden
 */
function animationStatus(initialStatus){
    this._init(initialStatus);
}

animationStatus.prototype = {

    _init: function(initialStatus){
        this.status  = initialStatus;
        this.nextStatus  = [];
        this.queued = false;
        this.running = false;
    },

    queue: function(nextStatus){
        this.nextStatus.push(nextStatus);
        this.queued = true;
    },

    start: function(){
        if(this.nextStatus.length==1){
            this.queued = false;
        }
        this.running = true;
    },

    end: function(){
        if(this.nextStatus.length==1){
            this.queued=false; // in the case end is called and start was not
        }
        this.running=false;
        this.status = this.nextStatus.shift();
    },

    clear: function(){
        if(this.nextStatus.length==1){
            this.queued = false;
        this.running = false;
        }

        this.nextStatus.splice(0, 1);
    },

    clearAll: function(){
        this.queued  = false;
        this.running = false;
        this.nextStatus.splice(0, this.nextStatus.length);
    },

    // Return true if a showing animation is running or queued
    showing: function(){
        if( (this.running == true || this.queued == true) && this.nextStatus[0] == true)
            return true;
        else
            return false;
    },

    shown: function(){
        if( this.status==true && !(this.queued || this.running) )
            return true;
        else
            return false;
    },

    // Return true if an hiding animation is running or queued
    hiding: function(){
        if( (this.running == true || this.queued == true) && this.nextStatus[0] == false )
            return true;
        else
            return false;
    },

    hidden: function(){
        if( this.status==false && !(this.queued || this.running) )
            return true;
        else
            return false;
    }
}
