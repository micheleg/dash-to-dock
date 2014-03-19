// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const MessageTray = imports.ui.messageTray;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
const ViewSelector = imports.ui.viewSelector;
const WorkspaceSwitcherPopup= imports.ui.workspaceSwitcherPopup;
const Layout = imports.ui.layout;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const MyDash = Me.imports.myDash;

const PRESSURE_TIMEOUT = 1000;

const SlideDirection = {
    LEFT: 0,
    RIGHT: 1
};


/*
 * A simple Actor with one child whose allocation takes into account the
 * slide out of its child via the _slidex parameter ([0:1]).
 *
 * Required since I want to track the input region of this container which is
 * based on its allocation even if the child overlows the parent actor. By doing
 * this the region of the dash that is slideout is not steling anymore the input
 * regions making the extesion usable when the primary monitor is the right one.
 *
 * The slidex parameter can be used to directly animate the sliding. The parent
 * must have a WEST anchor_point to achieve the sliding in the RIGHT direction.
*/

const DashSlideContainer = new Lang.Class({
    Name: 'DashSlideContainer',
    Extends: Clutter.Actor,

    _init: function(params) {

        
        /* Default local params */
        let localDefaults = {
            direction: SlideDirection.LEFT,
            initialSlideValue: 1
        }

        let localParams = Params.parse(params, localDefaults, true);

        if (params){
            /* Remove local params before passing the params to the parent
               constructor to avoid errors. */
            let prop;
            for (prop in localDefaults) {
                if ((prop in params))
                    delete params[prop];
            }
        }

        this.parent(params);

        this._child = null;

        // slide parameter: 1 = visible, 0 = hidden.
        this._slidex = localParams.initialSlideValue;
        this._direction = localParams.direction;
        this._slideoutWidth = 1; // minimum width when slided out
    },


    vfunc_allocate: function(box, flags) {

        this.set_allocation(box, flags);

        if (this._child == null)
            return;

        let availWidth = box.x2 - box.x1;
        let availHeight = box.y2 - box.y1;
        let [minChildWidth, minChildHeight, natChildWidth, natChildHeight] =
            this._child.get_preferred_size();

        let childWidth = natChildWidth;
        let childHeight = natChildHeight;

        let childBox = new Clutter.ActorBox();

        let slideoutWidth = this._slideoutWidth;

        if (this._direction == SlideDirection.LEFT) {
            childBox.x1 = (this._slidex -1)*(childWidth - slideoutWidth);
            childBox.x2 = slideoutWidth + this._slidex*(childWidth - slideoutWidth);
        } else if (this._direction == SlideDirection.RIGHT) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
        }

        childBox.y1 = 0;
        childBox.y2 = childBox.y1 + childHeight;
        this._child.allocate(childBox, flags);
        this._child.set_clip(-childBox.x1, 0, -childBox.x1+availWidth, availHeight);
    },

    /* Just the child width but taking into account the slided out part */
    vfunc_get_preferred_width: function(forHeight) {
        let [minWidth, natWidth ] = this._child.get_preferred_width(forHeight);
        minWidth = (minWidth - this._slideoutWidth)*this._slidex + this._slideoutWidth;
        natWidth = (natWidth - this._slideoutWidth)*this._slidex + this._slideoutWidth;
        return [minWidth, natWidth];
    },

    /* Just the child min height, no border, no positioning etc. */
    vfunc_get_preferred_height: function(forWidth) {
        let [minHeight, natHeight] = this._child.get_preferred_height(forWidth);
        return [minHeight, natHeight];
    },

    /* I was expecting it to be a virtual function... stil I don't understand
       how things work.
    */
    add_child: function(actor) {

        /* I'm supposed to have only on child */
        if(this._child !== null) {
            this.remove_child(actor);
        }

        this._child = actor;
        this.parent(actor);
    },

    set slidex(value) {
        this._slidex = value;
        this._child.queue_relayout();
    },

    get slidex() {
        return this._slidex;
    }

});

const dockedDash = new Lang.Class({
    Name: 'dockedDash',
 
    _init: function(settings) {

        this._rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        // authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        this._autohideStatus = this._settings.get_boolean('autohide') && !this._settings.get_boolean('dock-fixed');

        // initialize animation status object
        this._animStatus = new animationStatus(true);

        /* status variable: true when the overview is shown through the dash
         * applications button.
         */
        this.forcedOverview = false;

        // Put dock on the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // this store size and the position where the dash is shown;
        // used by intellihide module to check window overlap.
        this.staticBox = new Clutter.ActorBox();

        // initialize colors with generic values
        this._defaultBackground = {red: 0, green:0, blue: 0, alpha:0};
        this._defaultBackgroundColor = {red: 0, green:0, blue: 0, alpha:0};
        this._customizedBackground = {red: 0, green:0, blue: 0, alpha:0};

        // Initialize pressure barrier variables
        this._canUsePressure = false;
        this._pressureSensed = false;
        this._pressureBarrier = null;
        this._barrier = null;
        this._messageTrayShowing = false;
        this._removeBarrierTimeoutId = 0;

        // Create a new dash object
        this.dash = new MyDash.myDash(this._settings);

        // connect app icon into the view selector
        this.dash.showAppsButton.connect('notify::checked', Lang.bind(this, this._onShowAppsButtonToggled));

        // Create the main actor and the containers for sliding in and out and
        // centering, turn on track hover

        // This is the vertical centering actor
        this.actor = new St.Bin({ name: 'dashtodockContainer',reactive: false,
            y_align: St.Align.MIDDLE});
        this.actor._delegate = this;

        // This is the sliding actor whose allocation is to be tracked for input regions
        this._slider = new DashSlideContainer( {
            direction:this._rtl?SlideDirection.RIGHT:SlideDirection.LEFT}
        );
        // This is the actor whose hover status us tracked for autohide
        this._box = new St.BoxLayout({ name: 'dashtodockBox', reactive: true, track_hover:true } );
        this._box.connect("notify::hover", Lang.bind(this, this._hoverChanged));

        // Create and apply height constraint to the dash. It's controlled by this.actor height
        this.actor.height = Main.overview._viewSelector.actor.height; // Guess initial reasonable height.
        this.constrainHeight = new Clutter.BindConstraint({ source: this.actor,
                                                            coordinate: Clutter.BindCoordinate.HEIGHT });
        this.dash.actor.add_constraint(this.constrainHeight);

        // Connect global signals
        this._signalHandler = new Convenience.globalSignalHandler();
        this._signalHandler.push(
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
            // When theme changes re-obtain default background color
            [
                St.ThemeContext.get_for_stage (global.stage),
                'changed',
                Lang.bind(this, this._updateCustomTheme)
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
                Main.overview._viewSelector._showAppsButton,
                'notify::checked',
                Lang.bind(this, this._syncShowAppsButtonToggled)
            ],
            [
                Main.messageTray,
                'showing',
                Lang.bind(this, this._onMessageTrayShowing)
            ],
            [
                Main.messageTray,
                'hiding',
                Lang.bind(this, this._onMessageTrayHiding)
            ],
            [
                global.screen,
                'in-fullscreen-changed',
                Lang.bind(this, this._onFullscreenChanged)
            ]
        );

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        // Apply custome css class according to the settings
        this._updateCustomTheme();

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
            this.dash.actor, _("Dash"),'user-bookmarks-symbolic',
                {focusCallback: Lang.bind(this, this._onAccessibilityFocus)});

        // Load optional features
        this._optionalScrollWorkspaceSwitch();

         // Delay operations that require the shell to be fully loaded and with
         // user theme applied.

        this._realizeId = this.actor.connect("realize", Lang.bind(this, this._initialize));

        // Hide usual Dash
        // For some reason if I hide the actor object as I used to do before reshowing it when disabling
        // the extension leads to the dash being placed in the center of the overview.
        // Hiding the parent container seems to work properly instead
        // I don't know if it's linked with this bug: https://bugzilla.gnome.org/show_bug.cgi?id=692744.
        // However tha same workaround doesn't work.
        Main.overview._controls._dashSlider.actor.hide();

        // Add dash container actor and the container to the Chrome.
        this.actor.set_child(this._slider);
        this._slider.add_child(this._box);
        this._box.add_actor(this.dash.actor);

        // Add aligning container without tracking it for input region (old affectsinputRegion: false that was removed).
        // The public method trackChrome requires the actor to be child of a tracked actor. Since I don't want the parent
        // to be tracked I use the private internal _trackActor instead.
        Main.uiGroup.add_child(this.actor);
        Main.layoutManager._trackActor(this._slider, {trackFullscreen: true});

        // The dash need to be above the top_window_group, otherwise it doesn't
        // accept dnd of app icons when not in overiew mode, although the default
        // behavior is to keep newly added chrome elements below the the
        // top_window_group.
        this.actor.raise(global.top_window_group);

        if ( this._settings.get_boolean('dock-fixed') )
          Main.layoutManager._trackActor(this.dash._box, {affectsStruts: true});

        // pretend this._slider is isToplevel child so that fullscreen is actually tracked
        let index = Main.layoutManager._findActor(this._slider);
        Main.layoutManager._trackedActors[index].isToplevel = true ;

    },

    _initialize: function(){

        if(this._realizeId>0){
            this.actor.disconnect(this._realizeId);
            this._realizeId=0;
        }

        // Set initial position
        this._resetPosition();

        // Since Gnome 3.8 dragging an app without having opened the overview before cause the attemp to
        //animate a null target since some variables are not initialized when the _viewSElector is created
        if(Main.overview._viewSelector._activePage == null)
                Main.overview._viewSelector._activePage = Main.overview._viewSelector._workspacesPage;

        // Now that the dash is on the stage and custom themes should be loaded
        // retrieve its background color
        this._getBackgroundColor();
        this._updateBackgroundOpacity();

        // Show 
        this.actor.set_opacity(255); //this.actor.show();

        // Setup pressure barrier (GS38+ only)
        this._updatePressureBarrier();
        this._updateBarrier();
    },

    destroy: function(){

        // Disconnect global signals
        this._signalHandler.disconnect();
        // The dash has global signals as well internally
        this.dash.destroy();

        // Destroy main clutter actor: this should be sufficient removing it and
        // destroying  all its children
        this.actor.destroy();

        // Remove barrier timeout
        if (this._removeBarrierTimeoutId > 0)
            Mainloop.source_remove(this._removeBarrierTimeoutId);

        // Remove existing barrier
        this._removeBarrier();

        // Reshow normal dash previously hidden, restore panel position if changed.
        Main.overview._controls._dashSlider.actor.show();
        this._revertMainPanel();
    },

    _bindSettingsChanges: function() {

        this._settings.connect('changed::opaque-background', Lang.bind(this,this._updateBackgroundOpacity));

        this._settings.connect('changed::background-opacity', Lang.bind(this,this._updateBackgroundOpacity));

        this._settings.connect('changed::scroll-switch-workspace', Lang.bind(this, function(){
            this._optionalScrollWorkspaceSwitch(this._settings.get_boolean('scroll-switch-workspace'));
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

            if(this._settings.get_boolean('dock-fixed')) {
                Main.layoutManager._trackActor(this.dash._box, {affectsStruts: true});
                // show dash
                this.disableAutoHide();
            } else {
                Main.layoutManager._untrackActor(this.dash._box);
                this.emit('box-changed');
            }

            this._updateYPosition();

            // Add or remove barrier depending on if dock-fixed
            this._updateBarrier();
        }));
        this._settings.connect('changed::autohide', Lang.bind(this, function(){
            this.emit('box-changed');
            this._updateBarrier();
        }));
        this._settings.connect('changed::extend-height', Lang.bind(this, this._updateYPosition));
        this._settings.connect('changed::preferred-monitor', Lang.bind(this,this._resetPosition));
        this._settings.connect('changed::height-fraction', Lang.bind(this,this._updateYPosition));

        this._settings.connect('changed::apply-custom-theme', Lang.bind(this, this._updateCustomTheme));

        this._settings.connect('changed::require-pressure-to-show', Lang.bind(this, this._updateBarrier));
        this._settings.connect('changed::pressure-threshold', Lang.bind(this, function() {
            this._updatePressureBarrier();
            this._updateBarrier();
        }));

    },

    _hoverChanged: function() {

        // Ignore hover if pressure barrier being used but pressureSensed not triggered
        if (this._canUsePressure && this._settings.get_boolean('require-pressure-to-show') && this._barrier) {
            if (this._pressureSensed == false) {
                return;
            }
        }

        // Skip if dock is not in autohide mode for instance because it is shown
        // by intellihide. Delay the hover changes check while switching
        // workspace: the workspaceSwitcherPopup steals the hover status and it
        // is not restored until the mouse move again (sync_hover has no effect).
        if(Main.wm._workspaceSwitcherPopup) {
            Mainloop.timeout_add(500, Lang.bind(this, function() {
                    this._box.sync_hover();
                    this._hoverChanged();
                    return false;
                }));
        } else if(this._settings.get_boolean('autohide') && this._autohideStatus) {
            if( this._box.hover ) {
                this._show();
            } else {
                this._hide();
            }
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

            this.emit("showing");
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

            this.emit("hiding");
            this._animateOut(this._settings.get_double('animation-time'), delay);

        }
    },

    _animateIn: function(time, delay) {

        this._animStatus.queue(true);
        Tweener.addTween(this._slider,{
            slidex: 1,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onStart:  Lang.bind(this, function() {
                this._animStatus.start();
            }),
            onOverwrite : Lang.bind(this, function() {this._animStatus.clear();}),
            onComplete: Lang.bind(this, function() {
                  this._animStatus.end();
                  // Remove barrier so that mouse pointer is released and can access monitors on other side of dock
                  // NOTE: Delay needed to keep mouse from moving past dock and re-hiding dock immediately. This
                  // gives users an opportunity to hover over the dock
                  if (this._removeBarrierTimeoutId > 0) {
                      Mainloop.source_remove(this._removeBarrierTimeoutId);
                  }
                  this._removeBarrierTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, this._removeBarrier));
              })
        });
    },

    _animateOut: function(time, delay){

        this._animStatus.queue(false);
        Tweener.addTween(this._slider,{
            slidex: 0,
            time: time,
            delay: delay ,
            transition: 'easeOutQuad',
            onStart:  Lang.bind(this, function() {
                this._animStatus.start();
            }),
            onOverwrite : Lang.bind(this, function() {this._animStatus.clear();}),
            onComplete: Lang.bind(this, function() {
                    this._animStatus.end();
                    this._updateBarrier();
            })
        });
    },

    _updatePressureBarrier: function() {
        this._canUsePressure = global.display.supports_extended_barriers();
        let pressureThreshold = this._settings.get_double('pressure-threshold');

        // Remove existing pressure barrier
        if (this._pressureBarrier) {
            this._pressureBarrier.destroy();
            this._pressureBarrier = null;
        }

        // Create new pressure barrier based on pressure threshold setting
        if (this._canUsePressure) {
            this._pressureBarrier = new Layout.PressureBarrier(pressureThreshold, PRESSURE_TIMEOUT,
                                Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.OVERVIEW);
            this._pressureBarrier.connect('trigger', Lang.bind(this, function(barrier){
                this._onPressureSensed();
            }));
        }
    },

    // handler for mouse pressure sensed
    _onPressureSensed: function() {
        this._pressureSensed = true;
        // Prevent dock from being shown accidentally by testing for mouse hover
        this._hoverChanged();
    },

    _onMessageTrayShowing: function() {

        // Temporary move the dash below the top panel so that it slide below it.
        this.actor.lower(Main.layoutManager.panelBox);

        // Remove other tweens that could mess with the state machine
        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
              y: this._y0 - Main.messageTray.actor.height,
              time: MessageTray.ANIMATION_TIME,
              transition: 'easeOutQuad'
            });
        this._messageTrayShowing = true;
        this._updateBarrier();
    },

    _onMessageTrayHiding: function() {

        // Remove other tweens that could mess with the state machine
        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
              y: this._y0,
              time: MessageTray.ANIMATION_TIME,
              transition: 'easeOutQuad',
              onComplete: Lang.bind(this, function(){
                  // Reset desired dash stack order (on top to accept dnd of app icons)
                  this.actor.raise(global.top_window_group);
                })
            });

        this._messageTrayShowing = false;
        this._updateBarrier();
    },

    _onFullscreenChanged: function() {
        if (!this._slider.visible)
            this._updateBarrier();
    },

    // Remove pressure barrier
    _removeBarrier: function() {
        if (this._barrier) {
            if (this._pressureBarrier) {
                this._pressureBarrier.removeBarrier(this._barrier);
            }
            this._barrier.destroy();
            this._barrier = null;
        }
        this._removeBarrierTimeoutId = 0;
        return false;
    },

    // Update pressure barrier size
    _updateBarrier: function() {
        // Remove existing barrier
        this._removeBarrier();

        // Manually reset pressure barrier
        // This is necessary because we remove the pressure barrier when it is triggered to show the dock
        if (this._pressureBarrier) {
            this._pressureBarrier._reset();
            this._pressureBarrier._isTriggered = false;
        }

        // Create new barrier
        // Note: dash in fixed position doesn't use pressure barrier
        if (this._slider.visible && this._canUsePressure && this._settings.get_boolean('autohide') && this._settings.get_boolean('require-pressure-to-show') && !this._settings.get_boolean('dock-fixed') && !this._messageTrayShowing) {
            let x, direction;
            if (this._rtl) {
                x = this._monitor.x + this._monitor.width;
                direction = Meta.BarrierDirection.NEGATIVE_X;
            } else {
                x = this._monitor.x;
                direction = Meta.BarrierDirection.POSITIVE_X;
            }
            this._barrier = new Meta.Barrier({display: global.display,
                                x1: x, x2: x,
                                y1: (this.staticBox.y1), y2: (this.staticBox.y2),
                                directions: direction});
            if (this._pressureBarrier) {
                this._pressureBarrier.addBarrier(this._barrier);
            }
        }

        // Reset pressureSensed flag
        this._pressureSensed = false;
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

        if(this._settings.get_boolean('opaque-background') ){
            this._fadeInBackground(this._settings.get_double('animation-time'), 0);
        }
        else {
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
        this._y0 = this._monitor.y + unavailableTopSpace + Math.round( (1-fraction)/2 * availableHeight);
        this.actor.y = this._y0;

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
            this.actor.y + this._slider.y + this._box.y,
            this._box.width,
            this._box.height
        );

        // This prevents an allocation cycle warning. Somehow changing the topbar
        // allocation causes an allocation of the dock actor and thus the cycle I
        // think. This happens only if _updateStaticBox is called upon the
        // allocation event (why?). This seems to prevent the warning and I checked
        // that the function is called once to be sure.
        Mainloop.timeout_add(10,
                Lang.bind(this, function(){
                  this._updateMainPanel();
                  return false;
                }));

        this.emit('box-changed');
    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        this._monitor = this._getMonitor();
        this._updateStaticBox();

        let position, anchor_point;

        if(this._rtl){
            anchor_point = Clutter.Gravity.NORTH_EAST;
            position = this.staticBox.x2;
        } else {
            anchor_point = Clutter.Gravity.NORTH_WEST;
            position = this.staticBox.x1;
        }

        this.actor.move_anchor_point_from_gravity(anchor_point);
        this.actor.x = position;


        this._updateYPosition();
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
        Tweener.removeTweens(this._slider);
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

    // Show dock and give key focus to it
    _onAccessibilityFocus: function(){
        this._box.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
        this._animateIn(this._settings.get_double('animation-time'), 0);
    },

    _onShowAppsButtonToggled: function() {

        // Sync the status of the default appButtons. Only if the two statuses are
        // different, that means the user interacted with the extension provided
        // application button, cutomize the behaviour. Otherwise the shell has changed the
        // status (due to the _syncShowAppsButtonToggled function below) and it
        // has already performed the desired action.

        let selector = Main.overview._viewSelector;

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
        let status = Main.overview._viewSelector._showAppsButton.checked;
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

            // When in overview change workscape only in windows view
            if (Main.overview.visible && Main.overview.viewSelector.getActivePage() !== ViewSelector.ViewPage.WINDOWS)
                return

            let activeWs = global.screen.get_active_workspace();
            let direction = null;


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
                direction = Meta.MotionDirection.UP;
                break;
            case Clutter.ScrollDirection.DOWN:
                direction = Meta.MotionDirection.DOWN;
                break;
            case Clutter.ScrollDirection.SMOOTH:
                let [dx, dy] = event.get_scroll_delta();
                if(dy < 0){
                    direction = Meta.MotionDirection.UP;
                } else if(dy > 0) {
                    direction = Meta.MotionDirection.DOWN;
                }
                break;
            }

            if(direction !==null ){

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

                ws = activeWs.get_neighbor(direction)

                if (Main.wm._workspaceSwitcherPopup == null)
                    Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
                    // Set the actor non reactive, so that it doesn't prevent the
                    // clicks events from reaching the dash actor. I can't see a reason
                    // why it should be reactive.
                    Main.wm._workspaceSwitcherPopup.actor.reactive = false;
                    Main.wm._workspaceSwitcherPopup.connect('destroy', function() {
                        Main.wm._workspaceSwitcherPopup = null;
                    });

                // Do not show wokspaceSwithcer in overview
                if(!Main.overview.visible)
                    Main.wm._workspaceSwitcherPopup.display(direction, ws.index());
                Main.wm.actionMoveWorkspace(direction);

                return true;

            } else {
                return false;
            }
        }

    },

    _updateCustomTheme: function() {
        // Apply customization to the theme but only if the default theme is used
        if(Main.getThemeStylesheet() == null && this._settings.get_boolean('apply-custom-theme'))
            this.actor.add_style_class_name('dashtodock');
        else
           this.actor.remove_style_class_name('dashtodock');

        this._onThemeChanged();
    },

    // Disable autohide effect, thus show dash
    disableAutoHide: function() {
        if(this._autohideStatus==true){
            this._autohideStatus = false;

            this._removeAnimations();
            this._animateIn(this._settings.get_double('animation-time'), 0);
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
        }
    }
});

Signals.addSignalMethods(dockedDash.prototype);

/*
 * Store animation status in a perhaps overcomplicated way.
 * status is true for visible, false for hidden
 */
const animationStatus = new Lang.Class({
    Name: 'AnimationStatus',

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
});
