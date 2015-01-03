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
const OverviewControls = imports.ui.overviewControls;
const Tweener = imports.ui.tweener;
const ViewSelector = imports.ui.viewSelector;
const WorkspaceSwitcherPopup= imports.ui.workspaceSwitcherPopup;
const Layout = imports.ui.layout;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const MyDash = Me.imports.myDash;

const PRESSURE_TIMEOUT = 1000;

/* Return the actual position reverseing left and right in rtl */
function getPosition(settings) {
    let position = settings.get_enum('dock-position');
    if(Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        if (position == St.Side.LEFT)
            position = St.Side.RIGHT;
        else if (position == St.Side.RIGHT)
            position = St.Side.LEFT;
    }
    return position;
}

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
 * must have a WEST (SOUTH) anchor_point to achieve the sliding to the RIGHT (BOTTOM)
 * side.
*/

const DashSlideContainer = new Lang.Class({
    Name: 'DashSlideContainer',
    Extends: Clutter.Actor,

    _init: function(params) {

        
        /* Default local params */
        let localDefaults = {
            side: St.Side.LEFT,
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
        this._side = localParams.side;
        this._slideoutSize = 1; // minimum size when slided out
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

        let slideoutSize = this._slideoutSize;

        if (this._side == St.Side.LEFT) {
            childBox.x1 = (this._slidex -1)*(childWidth - slideoutSize);
            childBox.x2 = slideoutSize + this._slidex*(childWidth - slideoutSize);
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        } else if (this._side ==  St.Side.RIGHT
                 || this._side ==  St.Side.BOTTOM) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        } else if (this._side ==  St.Side.TOP) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = (this._slidex -1)*(childHeight - slideoutSize);
            childBox.y2 = slideoutSize + this._slidex*(childHeight - slideoutSize);
        }

        this._child.allocate(childBox, flags);
        this._child.set_clip(-childBox.x1, -childBox.y1,
                             -childBox.x1+availWidth,-childBox.y1 + availHeight);
    },

    /* Just the child width but taking into account the slided out part */
    vfunc_get_preferred_width: function(forHeight) {
        let [minWidth, natWidth ] = this._child.get_preferred_width(forHeight);
        if (this._side ==  St.Side.LEFT
          || this._side == St.Side.RIGHT) {
            minWidth = (minWidth - this._slideoutSize)*this._slidex + this._slideoutSize;
            natWidth = (natWidth - this._slideoutSize)*this._slidex + this._slideoutSize;
        }
        return [minWidth, natWidth];
    },

    /* Just the child height but taking into account the slided out part */
    vfunc_get_preferred_height: function(forWidth) {
        let [minHeight, natHeight] = this._child.get_preferred_height(forWidth);
        if (this._side ==  St.Side.TOP
          || this._side ==  St.Side.BOTTOM) {
            minHeight = (minHeight - this._slideoutSize)*this._slidex + this._slideoutSize;
            natHeight = (natHeight - this._slideoutSize)*this._slidex + this._slideoutSize;
        }
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

        this._position = getPosition(settings);
        this._isHorizontal = ( this._position == St.Side.TOP ||
                               this._position == St.Side.BOTTOM );

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

        let positionStyleClass = ['top', 'right', 'bottom', 'left'];
        // This is the centering actor
        this.actor = new St.Bin({ name: 'dashtodockContainer',reactive: false,
            style_class:positionStyleClass[this._position],
            x_align: this._isHorizontal?St.Align.MIDDLE:St.Align.START,
            y_align: this._isHorizontal?St.Align.START:St.Align.MIDDLE});
        this.actor._delegate = this;

        // This is the sliding actor whose allocation is to be tracked for input regions
        this._slider = new DashSlideContainer({side: this._position});

        // This is the actor whose hover status us tracked for autohide
        this._box = new St.BoxLayout({ name: 'dashtodockBox', reactive: true, track_hover:true } );
        this._box.connect("notify::hover", Lang.bind(this, this._hoverChanged));

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

        this._themeManager = new themeManager(this._settings, this.actor, this.dash);

        // Since the actor is not a topLevel child and its parent is now not added to the Chrome,
        // the allocation change of the parent container (slide in and slideout) doesn't trigger
        // anymore an update of the input regions. Force the update manually.
        this.actor.connect('notify::allocation',
                                              Lang.bind(Main.layoutManager, Main.layoutManager._queueUpdateRegions));

        this.dash._container.connect('allocation-changed', Lang.bind(this, this._updateStaticBox));
        this._slider.connect(this._isHorizontal?'notify::x':'notify::y', Lang.bind(this, this._updateStaticBox));

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

        // Also set dash width to 0, so it's not taken into account by code calculaing the reserved space in the overview
        Main.overview._controls.dash.actor.set_width(0);

        // Manage the DashSpacer which is used to reserve space in the overview for the dock
        // Replace the current dashSpacer with a new one pointing at the dashtodock dash
        // and positioned according to the dash positioning. It gets restored on extension unload.
        Main.overview._controls._dashSpacer.destroy();
        this._dashSpacer = new OverviewControls.DashSpacer();
        this._dashSpacer.setDashActor(this._box);

        if (this._position ==  St.Side.LEFT)
          Main.overview._controls._group.insert_child_at_index(this._dashSpacer, this._rtl?-1:0); // insert on first
        else if (this._position ==  St.Side.RIGHT)
            Main.overview._controls._group.insert_child_at_index(this._dashSpacer, this._rtl?0:-1); // insert on last
        else if (this._position ==  St.Side.TOP)
            Main.overview._overview.insert_child_at_index(this._dashSpacer, 0);
        else if (this._position ==  St.Side.BOTTOM)
          Main.overview._overview.insert_child_at_index(this._dashSpacer, -1);

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
          Main.layoutManager._trackActor(this.dash.actor, {affectsStruts: true});

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

        // Apply custome css class according to the settings
        this._themeManager.updateCustomTheme();

        // Since Gnome 3.8 dragging an app without having opened the overview before cause the attemp to
        //animate a null target since some variables are not initialized when the _viewSElector is created
        if(Main.overview._viewSelector._activePage == null)
                Main.overview._viewSelector._activePage = Main.overview._viewSelector._workspacesPage;

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

        // Restore the default dashSpacer and link it to the standard dash
        this._dashSpacer.destroy();
        Main.overview._controls._dashSpacer = new OverviewControls.DashSpacer();
        Main.overview._controls._group.insert_child_at_index(Main.overview._controls._dashSpacer, 0);
        Main.overview._controls._dashSpacer.setDashActor(Main.overview._controls._dashSlider.actor);

        // Reshow normal dash previously hidden, restore panel position if changed.
        Main.overview._controls._dashSlider.actor.show();
        Main.overview._controls.dash.actor.set_width(-1); //reset default dash size
        this._revertMainPanel();
    },

    _bindSettingsChanges: function() {

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
                Main.layoutManager._trackActor(this.dash.actor, {affectsStruts: true});
                // show dash
                this.disableAutoHide();
            } else {
                Main.layoutManager._untrackActor(this.dash.actor);
                this.emit('box-changed');
            }

            this._resetPosition();

            // Add or remove barrier depending on if dock-fixed
            this._updateBarrier();
        }));
        this._settings.connect('changed::autohide', Lang.bind(this, function(){
            this.emit('box-changed');
            this._updateBarrier();
        }));
        this._settings.connect('changed::extend-height', Lang.bind(this, this._resetPosition));
        this._settings.connect('changed::preferred-monitor', Lang.bind(this,this._resetPosition));
        this._settings.connect('changed::height-fraction', Lang.bind(this,this._resetPosition));

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
        // by intellihide.
        if(this._settings.get_boolean('autohide') && this._autohideStatus) {
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
            let x1, x2, y1, y2, direction;

            if(this._position==St.Side.LEFT){
                x1 = this.staticBox.x1;
                x2 = this.staticBox.x1;
                y1 = this.staticBox.y1;
                y2 = this.staticBox.y2;
                direction = Meta.BarrierDirection.POSITIVE_X;
            } else if(this._position==St.Side.RIGHT) {
                x1 = this.staticBox.x2;
                x2 = this.staticBox.x2;
                y1 = this.staticBox.y1;
                y2 = this.staticBox.y2;
                direction = Meta.BarrierDirection.NEGATIVE_X;
            } else if(this._position==St.Side.TOP) {
                x1 = this.staticBox.x1;
                x2 = this.staticBox.x2;
                y1 = this.staticBox.y1;
                y2 = this.staticBox.y1;
                direction = Meta.BarrierDirection.POSITIVE_Y;
            } else if (this._position==St.Side.BOTTOM) {
                x1 = this.staticBox.x1;
                x2 = this.staticBox.x2;
                y1 = this.staticBox.y2;
                y2 = this.staticBox.y2;
                direction = Meta.BarrierDirection.NEGATIVE_Y;
            }

            this._barrier = new Meta.Barrier({display: global.display,
                                x1: x1, x2: x2,
                                y1: y1, y2: y2,
                                directions: direction});
            if (this._pressureBarrier) {
                this._pressureBarrier.addBarrier(this._barrier);
            }
        }

        // Reset pressureSensed flag
        this._pressureSensed = false;
    },

    _isPrimaryMonitor: function() {
        return (this._monitor.x == Main.layoutManager.primaryMonitor.x &&
             this._monitor.y == Main.layoutManager.primaryMonitor.y);
    },

    _resetPosition: function() {

        this._monitor = this._getMonitor();

        let unavailableTopSpace = 0;
        let unavailableBottomSpace = 0;

        let extendHeight = this._settings.get_boolean('extend-height');
        let dockFixed = this._settings.get_boolean('dock-fixed');

        // check if the dock is on the primary monitor
        if (this._isPrimaryMonitor()){
          if (!extendHeight || !dockFixed) {
              unavailableTopSpace = Main.panel.actor.height;
          }
          // Reserve space for the dash on the overview
          this._dashSpacer.show();
        } else {
          // No space is required in the overview of the dash
          this._dashSpacer.hide();
        }

        let fraction = this._settings.get_double('height-fraction');

        if(extendHeight)
            fraction = 1;
        else if(fraction<0 || fraction >1)
            fraction = 0.95;

        let anchor_point;

        if(this._isHorizontal){

            let availableWidth = this._monitor.width;
            this.actor.width = Math.round( fraction * availableWidth);

            let pos_y;
            if( this._position == St.Side.BOTTOM) {
                pos_y =  this._monitor.y + this._monitor.height;
                anchor_point = Clutter.Gravity.SOUTH_WEST;
            } else {
                pos_y =  this._monitor.y + unavailableTopSpace;
                anchor_point = Clutter.Gravity.NORTH_WEST;
            }

            this.actor.move_anchor_point_from_gravity(anchor_point);
            this.actor.x = this._monitor.x + Math.round( (1-fraction)/2 * availableWidth);
            this.actor.y = pos_y;

            if(extendHeight){
                this.dash._container.set_width(this.actor.width);
                this.actor.add_style_class_name('extended');
            } else {
                this.dash._container.set_width(-1);
                this.actor.remove_style_class_name('extended');
            }

        } else {

            let availableHeight = this._monitor.height - unavailableTopSpace - unavailableBottomSpace;
            this.actor.height = Math.round( fraction * availableHeight);

            let pos_x;
            if( this._position == St.Side.RIGHT) {
                pos_x =  this._monitor.x + this._monitor.width;
                anchor_point = Clutter.Gravity.NORTH_EAST;
            } else {
                pos_x =  this._monitor.x;
                anchor_point = Clutter.Gravity.NORTH_WEST;
            }

            this.actor.move_anchor_point_from_gravity(anchor_point);
            this.actor.x = pos_x;
            this.actor.y = this._monitor.y + unavailableTopSpace + Math.round( (1-fraction)/2 * availableHeight);

            if(extendHeight){
                this.dash._container.set_height(this.actor.height);
                this.actor.add_style_class_name('extended');
            } else {
                this.dash._container.set_height(-1);
                this.actor.remove_style_class_name('extended');
            }
        }

        this._y0 = this.actor.y;

        // Set dash max height/width depending on the orientation
        if(this._isHorizontal)
          this.dash.setMaxSize(this.actor.width);
        else
          this.dash.setMaxSize(this.actor.height);

        this._updateStaticBox();
    },

    // Shift panel position to extend the dash to the full monitor height
    _updateMainPanel: function() {
        let extendHeight = this._settings.get_boolean('extend-height');
        let dockFixed = this._settings.get_boolean('dock-fixed');
        let panelActor = Main.panel.actor;

        if (!this._isHorizontal && this._isPrimaryMonitor() && extendHeight && dockFixed) {
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
            this.actor.x + this._slider.x - (this._position==St.Side.RIGHT?this._box.width:0),
            this.actor.y + this._slider.y - (this._position==St.Side.BOTTOM?this._box.height:0),
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
                return false;

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

            this._autohideStatus = true;


            if(this._box.hover==true)
                this._box.sync_hover();

            if( !this._box.hover || !this._settings.get_boolean('autohide')) {
                this._removeAnimations();
                this._animateOut(this._settings.get_double('animation-time'), 0);
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

/* 
 * Manage theme customization and custom theme support
*/
const themeManager = new Lang.Class({
    Name: 'ThemeManager',

    _init: function(settings, actor, dash) {

    this._settings = settings;
    this._bindSettingsChanges();
    this._actor = actor;
    this._dash = dash;

    // initialize colors with generic values
    this._defaultBackground = {red: 0, green:0, blue: 0, alpha:0};
    this._defaultBackgroundColor = {red: 0, green:0, blue: 0, alpha:0};
    this._customizedBackground = {red: 0, green:0, blue: 0, alpha:0};

    this._signalHandler = new Convenience.globalSignalHandler();
    this._signalHandler.push(
        // When theme changes re-obtain default background color
        [
          St.ThemeContext.get_for_stage (global.stage),
          'changed',
          Lang.bind(this, this.updateCustomTheme)
        ]
    );

    // Now that the dash is on the stage and custom themes should be loaded
    // retrieve its background color
    this._getBackgroundColor();
    this._updateBackgroundOpacity();

    },

    destroy: function() {
        this._signalHandler.disconnect();
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
  },

    _getBackgroundColor: function() {

        // Remove custom style
        let oldStyle = this._dash._container.get_style();
        this._dash._container.set_style(null);

        // Prevent shell crash if the actor is not on the stage.
        // It happens enabling/disabling repeatedly the extension
        if(!this._dash._container.get_stage())
            return;

        let themeNode = this._dash._container.get_theme_node();
        this._dash._container.set_style(oldStyle);

        this._defaultBackgroundColor = themeNode.get_background_color();
  },

    updateCustomTheme: function() {

        if (this._settings.get_boolean('apply-custom-theme'))
            this._actor.add_style_class_name('dashtodock');
        else {
            this._actor.remove_style_class_name('dashtodock');
        }

        if (this._settings.get_boolean('custom-theme-shrink'))
            this._actor.add_style_class_name('shrink');
        else {
            this._actor.remove_style_class_name('shrink');
        }

        if (this._settings.get_boolean('custom-theme-running-dots'))
            this._actor.add_style_class_name('running-dots');
        else {
            this._actor.remove_style_class_name('running-dots');
        }

        this._dash._queueRedisplay();
        this._getBackgroundColor();
        this._updateBackgroundOpacity();
        this._adjustTheme();
  },

    /* Reimported back and adapted from atomdock */
    _adjustTheme: function() {
        // Prevent shell crash if the actor is not on the stage.
        // It happens enabling/disabling repeatedly the extension
        if (!this._dash._container.get_stage()) {
            return;
        }

        let position = getPosition(this._settings);

        // Remove prior style edits
        this._dash._container.set_style(null);

        // obtain theme border settings
        let themeNode = this._dash._container.get_theme_node();
        let borderColor = themeNode.get_border_color(St.Side.TOP);
        let borderWidth = themeNode.get_border_width(St.Side.TOP);
        let borderRadius = themeNode.get_border_radius(St.Corner.TOPRIGHT);

        /* We're copying border and corner styles to left border and top-left
        * corner, also removing bottom border and bottom-right corner styles
        */
        let borderInner = '';
        let borderRadiusValue = '';
        let borderMissingStyle = '';

        if (this._rtl && position != St.Side.RIGHT) {
            borderMissingStyle = 'border-right: ' + borderWidth + 'px solid ' +
                   borderColor.to_string() + ';';
        } else if (!this._rtl && position != St.Side.LEFT){
            borderMissingStyle = 'border-left: ' + borderWidth + 'px solid ' +
                   borderColor.to_string() + ';';
        }

        switch(position) {
            case St.Side.LEFT:
                borderInner = 'border-left';
                borderRadiusValue = '0 ' + borderRadius + 'px ' + borderRadius + 'px 0;';
                break;
            case St.Side.RIGHT:
                borderInner = 'border-right';
                borderRadiusValue = borderRadius + 'px 0 0 ' + borderRadius + 'px;';
                break;
            case St.Side.TOP:
                borderInner = 'border-top';
                borderRadiusValue = '0 0 ' + borderRadius + 'px ' + borderRadius + 'px;';
                break;
            case St.Side.BOTTOM:
                borderInner = 'border-bottom';
                borderRadiusValue = borderRadius + 'px ' + borderRadius + 'px 0 0;';
                break;
        }

        let newStyle = borderInner + ': none;' +
        'border-radius: ' + borderRadiusValue +
        borderMissingStyle;

        /* I do call set_style twice so that only yhe background get the transition.
        *  The transition-property css rules seems to be unsupported
        */
        this._dash._container.set_style(newStyle);

        newStyle = newStyle + 'transition-delay: 0s; transition-duration: 0.250s;';

        /* Customize background opacity */
        if ( this._settings.get_boolean('opaque-background') )
            newStyle = newStyle + 'background-color:'+ this._customizedBackground;
        else
            newStyle = newStyle + 'background-color:'+ this._defaultBackground;

        this._dash._container.set_style(newStyle);

  },

    _bindSettingsChanges: function() {

     let keys = ['opaque-background',
                 'background-opacity',
                 'apply-custom-theme',
                 'custom-theme-shrink',
                 'custom-theme-running-dots'];

     keys.forEach(function(key){ 
        this._settings.connect('changed::'+key,
                               Lang.bind(this, this.updateCustomTheme)
        );
      }, this );

    }
});
