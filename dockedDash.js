// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_= false;

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
const WorkspaceSwitcherPopup= imports.ui.workspaceSwitcherPopup;

const Me = imports.ui.extensionSystem.extensions["dash-to-dock@micxgx.gmail.com"];
const Convenience = Me.convenience;
const MyDash = Me.myDash;


// SETTINGS

const ANIMATION_TIME = Overview.ANIMATION_TIME; // show/hide transition time
const SHOW_DELAY     = 0.500; // delay before showing dash when it's hidden 
const HIDE_DELAY     = 0.250; // delay befoee hiding dash when mouse goes out

const OPAQUE_BACKGROUND = true; // make the dash opaque increasing readability.
                                 // Some themes like the default one have a transparent bacground.
const BACKGROUND_OPACITY = 0.8; // set dash background opacity if key above is true
const OPAQUE_BACKGROUND_ALWAYS = false; // whether the dash has always an opaque background or only when 
                                        // in autohide mode
const DISABLE_AUTOHIDE = false      // Disable autohide show/hide mouse events. 
                                    // Dash is fixed: visibility can be manually controlled.

const SCROLL_SWITCH_WORKSPACE = true; // Switch workspace by scrolling over the dock
const SCROLL_SWITCH_WORKSPACE_WHOLE = false; // Whole dock is sensible to scroll events

const AUTOHIDE = true; // Enable or disable autohide mode
const DOCK_FIXED = false; //Dock is always visible
                          // Also the same settings in intellihide.js has to be changed

const EXPAND_HEIGHT = true; // Use all vertical available space
const VERTICAL_CENTERED = true; //Center the dock verticaly

const PREFERRED_MONITOR = -1; //Set on which monitor to put the dock, use -1 for the primary one. If the monitor does not exist for instance beacuse it's disconnected the primary monitor is used

let ADD_DEADTIME = true; // Prevent scroll events from triggering too many workspace switches
                         // by adding a deadtime between each scroll event; usefull on laptops when using a touchpad.
let DEADTIME = 250;

// END OF SETTINGS


function dockedDash() {

    this._init();
}

dockedDash.prototype = {
 
    _init: function() {

        this._signalHandler = new Convenience.globalSignalHandler();

        // authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        this._autohideStatus = AUTOHIDE && !DOCK_FIXED;

        // initialize animation status object
        this._animStatus = new animationStatus(true);

        // Hide usual Dash
        Main.overview._dash.actor.hide();

        // Create a new dash object
        this.dash = new MyDash.myDash();

        // Create the main actor and the main container for centering, turn on track hover

        this._box = new St.BoxLayout({ name: 'dashtodockBox', reactive: true, track_hover:true,
            style_class: 'box'} );
        this.actor = new St.Bin({ name: 'dashtodockContainer',reactive: false,
            style_class: 'container', child: this._box});

        this._box.connect("notify::hover", Lang.bind(this, this._hoverChanged));

        // Create and apply height constraint to the dash. It's controlled by this.actor height
        this.actor.height = Main.overview._viewSelector._pageArea.height; // Guess initial reasonable height.
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
            // Connect events for updating dash vertical position
            [
                Main.overview._viewSelector._pageArea,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                Main.overview._viewSelector,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                Main.overview._viewSelector._pageArea,
                'notify::height',
                Lang.bind(this, this._updateYPosition)
            ],
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
            ]
        );

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        //Add dash container actor and the container to the Chrome.
        this._box.add_actor(this.dash.actor);
        Main.layoutManager.addChrome(this.actor, { affectsInputRegion: false, affectsStruts: DOCK_FIXED});
        Main.layoutManager._chrome.trackActor(this._box, {affectsInputRegion:true});

        // and update position and clip when width changes, that is when icons size and thus dash size changes.
        this.dash.actor.connect('notify::width', Lang.bind(this, this._redisplay));
        this.dash._box.connect('allocation-changed', Lang.bind(this, this._updateStaticBox));

        // sync hover after a popupmenu is closed
        this.dash.connect('menu-closed', Lang.bind(this, function(){this._box.sync_hover();}));

        // Restore dash accessibility
        Main.ctrlAltTabManager.addGroup(
            this.dash.actor, _("Dash"),'user-bookmarks',
                {focusCallback: Lang.bind(this, this._onAccessibilityFocus)});
        this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPress));

        // Load optional features
        this._optionalScrollWorkspaceSwitch();

        Mainloop.idle_add(Lang.bind(this, this._initialize));

    },

    _initialize: function(){
        /* This is a workaround I found to get correct size and positions of actor
         * inside the overview
        */
        Main.overview._group.show();
        Main.overview._group.hide();

        // Set initial position
        this._resetPosition();

        // Now that the dash is on the stage and custom themes should be loaded
        // retrieve its background color
        this._getBackgroundColor();

        // Show 
        this.actor.set_opacity(255); //this.actor.show();
        this._redisplay();

    },

    destroy: function(){

        // Disconnect global signals
        this._signalHandler.disconnect();
        // Destroy main clutter actor: this should be sufficient
        // From clutter documentation:
        // If the actor is inside a container, the actor will be removed.
        // When you destroy a container, its children will be destroyed as well. 
        this.actor.destroy();

        // Reshow normal dash previously hidden
        Main.overview._dash.actor.show();

    },

    _hoverChanged: function() {
        // Skip if dock is not in autohide mode for instance because it is shown by intellihide
        if(AUTOHIDE && this._autohideStatus){
            if( this._box.hover ) {
                this._show();
            } else {
                this._hide();
            }
        }
    },

    _show: function() {  

        var anim = this._animStatus;

        if(_DEBUG_) global.log("show " + anim.showing() + " " + anim.hiding() +
                                " " + anim.shown() + " " + anim.hidden());

        if( this._autohideStatus && ( anim.hidden() || anim.hiding() ) ){

            let delay;
            // If the dock is hidden, wait SHOW_DELAY before showing it; 
            // otherwise show it immediately.
            if(anim.hidden()){
                delay = SHOW_DELAY;
            } else if(anim.hiding()){
                // suppress all potential queued hiding animations (always give priority to show)
                this._removeAnimations();
                delay = 0;
            }

            this._animateIn(ANIMATION_TIME, delay);

        }
    },

    _hide: function() {

        if(_DEBUG_) global.log("hide " + anim.showing() + " " + anim.hiding() +
                            " " + anim.shown() + " " + anim.hidden());

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
                    delay = HIDE_DELAY + 2*ANIMATION_TIME + SHOW_DELAY;

                } else {
                    this._removeAnimations();
                    delay = 0;
                }
            } else if( anim.shown() ) {
                delay = HIDE_DELAY;
            }

            this._animateOut(ANIMATION_TIME, delay);

        }
    },

    _animateIn: function(time, delay) {

        var final_position = this.staticBox.x1;

        if(final_position !== this.actor.x){
            this._animStatus.queue(true);
            Tweener.addTween(this.actor,{
                x: final_position,
                time: time,
                delay: delay,
                transition: 'easeOutQuad',
                onUpdate: Lang.bind(this, this._updateClip),
                onStart:  Lang.bind(this, function() {this._animStatus.start();}),
                onOverwrite : Lang.bind(this, function() {this._animStatus.clear();}),
                onComplete: Lang.bind(this, function() {this._animStatus.end();})
            });
        }
    },

    _animateOut: function(time, delay){

        var final_position = this.staticBox.x1-this.actor.width+1;

        if(final_position !== this.actor.x){
            this._animStatus.queue(false);
            Tweener.addTween(this.actor,{
                x: final_position,
                time: time,
                delay: delay ,
                transition: 'easeOutQuad',
                onUpdate: Lang.bind(this, this._updateClip),
                onStart:  Lang.bind(this, function() {this._animStatus.start();}),
                onOverwrite : Lang.bind(this, function() {this._animStatus.clear();}),
                onComplete: Lang.bind(this, function() {
                    this._animStatus.end();
                    // Disconnect unnecessary signals used for accessibility
                    this._signalHandler.disconnectWithLabel('accessibility');
                    })
            });
        }
    },

    // clip dock to its original allocation along x and to the current monito along y
    // the current monitor; inspired by dock@gnome-shell-extensions.gcampax.github.com

    _updateClip: function(){

        // Here we implicitly assume that the stage and actor's parent
        // share the same coordinate space
        let clip = new Clutter.ActorBox({ x1: this._monitor.x,
                          y1: this._monitor.y,
                          x2: this._monitor.x + this._monitor.width,
                          y2: this._monitor.y + this._monitor.height});

        // Translate back into actor's coordinate space
        // While the actor moves, the clip has to move in the opposite direction 
        // to mantain its position in respect to the screen.
        clip.x1 -= this.actor.x;
        clip.x2 -= this.actor.x;
        clip.y1 -= this.actor.y;
        clip.y2 -= this.actor.y;

        // Apply the clip
        this.actor.set_clip(clip.x1, clip.y1, clip.x2-clip.x1, clip.y2 - clip.y1);

    },

    _fadeOutBackground:function (time, delay) {

        // CSS time is in ms!
        this.dash._box.set_style('transition-duration: ' + time*1000 + ';' +
            'transition-delay: '+ delay*1000 +'; ' +
            'background-color:'+ this._defaultBackground);
    }, 

    _fadeInBackground:function (time, delay) {

        // CSS time is in ms!
        this.dash._box.set_style('transition-duration: ' + time*1000 + ';' +
            'transition-delay: '+ delay*1000 +'; ' +
            'background-color:'+ this._customizedBackground);
    },

    _updateBackgroundOpacity: function() {

        let newAlpha = BACKGROUND_OPACITY;

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

        if(OPAQUE_BACKGROUND && (this._autohideStatus || OPAQUE_BACKGROUND_ALWAYS)){
            this._fadeInBackground(ANIMATION_TIME, 0);
        }
        else if(!OPAQUE_BACKGROUND || (!this._autohideStatus && !OPAQUE_BACKGROUND_ALWAYS)) {
            this._fadeOutBackground(ANIMATION_TIME, 0);
        }
    },

    _getBackgroundColor: function() {

        // Remove custom style
        let oldStyle = this.dash._box.get_style();
        this.dash._box.set_style(null);

        let themeNode = this.dash._box.get_theme_node();
        this.dash._box.set_style(oldStyle);

        this._defaultBackgroundColor = themeNode.get_background_color();
    },

    _onThemeChanged: function() {
        this._getBackgroundColor();
        this._updateBackgroundOpacity();
    },

    _redisplay: function() {

        // Update dash x position animating it
        if( this._animStatus.hidden() ){
            this._removeAnimations();
            this._animateOut(0, 0);
        } else if( this._animStatus.shown() ){
            this._removeAnimations();
            this._animateIn(ANIMATION_TIME, 0);
        }

        this._updateBackgroundOpacity();
        this._updateStaticBox();
        this._updateClip();

    },

    _updateYPosition: function() {

        let unavailableTopSpace = 0;
        let unavailableBottomSpace = 0;

        // check if the dock is on the primary monitor
        if ( this._monitor.x == Main.layoutManager.primaryMonitor.x &&
             this._monitor.y == Main.layoutManager.primaryMonitor.y ){

            unavailableTopSpace = Main.panel.actor.height;
        }

        let availableHeight = this._monitor.height - unavailableTopSpace - unavailableBottomSpace;
        let defaultHeight = Main.overview._viewSelector._pageArea.height;

        if(EXPAND_HEIGHT){
            this.actor.y = this._monitor.y + unavailableTopSpace;
            this.actor.height = availableHeight;
        } else{
            this.actor.y = this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y;

            // It can occur if the monitor where the dock is displayed is not the primary one
            if((defaultHeight + this.actor.y) > (this._monitor.y + this._monitor.height))
                defaultHeight = this._monitor.height - 2*(this.actor.y - this._monitor.y);

            this.actor.height = defaultHeight;
        }

        if(VERTICAL_CENTERED)
            this.actor.y_align = St.Align.MIDDLE;
        else
            this.actor.y_align = St.Align.START;

        this._updateStaticBox();
    },

    _updateStaticBox: function() {

        this.staticBox.x1 = this._monitor.x;
        this.staticBox.y1 = this.actor.y + this._box.y;
        this.staticBox.x2 = this.staticBox.x1 + this._box.width;
        this.staticBox.y2 = this.staticBox.y1 + this._box.height;

        this.emit('box-changed');
    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        this._monitor = this._getMonitor();
        this._updateStaticBox();
        if( this._animStatus.hidden() )
            this._animateOut(0,0);
        else if( this._animStatus.shown() ){
            this._animateOut(0,0);
            this._animateIn(ANIMATION_TIME,0);
        }
        this._updateYPosition();
        this._updateClip();
    },

    _getMonitor: function(){

        let monitorIndex = PREFERRED_MONITOR;
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
        global.stage_input_mode = Shell.StageInputMode.FULLSCREEN;
    },

    _onDragEnd: function(){
        if(Main.overview.visible==false){ 
            global.stage_input_mode = Shell.StageInputMode.NORMAL;
        }
        if(this._oldAutohideStatus)
            this._autohideStatus  = this._oldAutohideStatus;
        this._box.sync_hover();
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
        this._animateIn(ANIMATION_TIME, 0);

        this._signalHandler.disconnectWithLabel('accessibility');
        this._signalHandler.pushWithLabel('accessibility',
            [
                global.stage,
                'notify::key-focus',
                Lang.bind(this, accessibilityCheck)
            ],
            // This is needed because when launching a new app focus is still the dash
            // for some reasons and the new window is still not focused when 
            // notify::key-focus signal triggers.
            // global.display 's 'window-created' doesn't work
            [
                global.screen,
                'restacked',
                Lang.bind(this, accessibilityCheck)
            ]

        );

        function accessibilityCheck(){
            if (!this._dashHasFocus() && ! this._dashMenuIsUp() ) {
                this._signalHandler.disconnectWithLabel('accessibility');
                if( AUTOHIDE ){
                    this._box.sync_hover();
                    this._hoverChanged();
                } else {
                    this._hide();
                }
            }
        };
    },

   _onKeyPress: function(entry, event) {
        let symbol = event.get_key_symbol();

        // Exit accessibility focus
        if (symbol == Clutter.Escape) {

            global.stage.set_key_focus(null);

            if( AUTOHIDE ){
                // Force hover update
                // Set hover true, thus do nothing since the dash is already shown;
                // then sync hover, if mouse is away hide the dash.
                this._box.hover = true;
                this._box.sync_hover();
            } else {
                this._hide();
            }

            // TODO: find a way to restore focus on old window if nothing changed?

        }
    },

    // Check if some app icon's menu is up
    _dashMenuIsUp: function() {

        let iconChildren = this.dash._box.get_children();

        let isMenuUp=false;
        for( let i = 0; i<iconChildren.length; i++) {
            try {
                // AppWellIcon.isMenuUp does not exist in GS 3.2
                isMenuUp = isMenuUp || ( iconChildren[i]._delegate.child._delegate._menuManager &&
                                         iconChildren[i]._delegate.child._delegate._menuManager.grabbed);
            } catch(err) {}
        }

        return isMenuUp;
    },

    // Check if some app icon's menu has key focus
    _dashHasFocus: function() {

        let focusedActor = global.stage.get_key_focus();
        let hasFocus = this.actor.contains(focusedActor) ;

        // For some reason the app icon keep focus even when the focus is on a window
        // after pressing enter or spacebar.
        // In this way it seems to work correctly
        hasFocus = hasFocus && (global.display.get_focus_window() == null);

        return hasFocus;
    },

    // Optional features enable/disable

    // Switch workspace by scrolling over the dock
    _optionalScrollWorkspaceSwitch: function() {

        let label = 'optionalScrollWorkspaceSwitch';

        if(SCROLL_SWITCH_WORKSPACE)
            Lang.bind(this, enable)();

        function enable(){

            // Sometimes Main.wm._workspaceSwitcherPopup is null when first loading the extension
            if (Main.wm._workspaceSwitcherPopup == null)
                Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();

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

        // This comes from desktop-scroller@obsidien.github.com
        function onScrollEvent(actor, event) {

            if(ADD_DEADTIME){

                // During the deadtime do nothing
                if(this._optionalScrollWorkspaceSwitchDeadTimeId>0)
                    return false;

                this._optionalScrollWorkspaceSwitchDeadTimeId =  Mainloop.timeout_add(DEADTIME, Lang.bind(this, function() {
                        this._optionalScrollWorkspaceSwitchDeadTimeId=0;
                    }
                ));
            }

            // filter events occuring not near the screen border if required
            if(SCROLL_SWITCH_WORKSPACE_WHOLE==false) {

                let [x,y] = event.get_coords();

                if(x > this.staticBox.x1 + 1){
                    return false
                }
            }

            switch ( event.get_scroll_direction() ) {
            case Clutter.ScrollDirection.UP:
                Main.wm.actionMoveWorkspaceUp();
                break;
            case Clutter.ScrollDirection.DOWN:
                Main.wm.actionMoveWorkspaceDown();
                break;
            }
        };

    },

    // Disable autohide effect, thus show dash
    disableAutoHide: function() {
        if(this._autohideStatus==true){
            this._autohideStatus = false;

            this._removeAnimations();
            this._animateIn(ANIMATION_TIME, 0);
            if(OPAQUE_BACKGROUND && !OPAQUE_BACKGROUND_ALWAYS)
                this._fadeOutBackground(ANIMATION_TIME, 0);
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

            if( !this._box.hover || !AUTOHIDE) {
                this._animateOut(ANIMATION_TIME, 0);
                delay = ANIMATION_TIME;
            } else {
                delay = 0;
            }
            
            if(OPAQUE_BACKGROUND && ! OPAQUE_BACKGROUND_ALWAYS)
                this._fadeInBackground(ANIMATION_TIME, delay);
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


