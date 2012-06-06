// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_= false;

const St = imports.gi.St;
const Signals = imports.signals;
const Lang = imports.lang;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const Mainloop = imports.mainloop;
const Dash = imports.ui.dash;
const Overview = imports.ui.overview;


// SETTINGS
// These settings are ingored in gnome-shell 3.4+ 
// Use gnome-shell-extension-prefs  "dash-to-dock@micxgx.gmail.com" instead.

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

// END OF SETTINGS

function dockedDash(settings) {

    this._init(settings);
}

dockedDash.prototype = {
 
    _init: function(settings) {

        // Load settings
        this._settings = settings;
        this._loadSettings();
        if(this._settings){
            this._bindSettingsChanges();
        }

        //store global signals identifiers via _pushSignals();
        this._signals = [];

        // authohide on hover effect on/off
        this._autohide = true;
        // initialize animation status object
        this._animStatus = new animationStatus(true);

        // Hide usual Dash
        Main.overview._dash.actor.hide();

        // Create a new dash object
        this.dash = new Dash.Dash(); // this.dash = new MyDash.myDash();

        // Create the main container, turn on track hover, add hoverChange signal
        this.actor = new St.BoxLayout({ name: 'mydash', reactive: true, style_class: 'box'});
        this.actor.connect("notify::hover", Lang.bind(this, this._hoverChanged));

        // I create another actor with name #dash. This serves for applying an opaque background 
        // for those themes like the default one that has a semi-transparent dash.
        // I inherit all dash style of the current theme, then disable all those non interesting.
        // I'm interested only on the shape, thus only on the border radius I think, in order
        // to cover all and only the dash area. It is probably a little ugly workaround, but I 
        // have not found a way to access the current style and simply change the background alpha.
        this._backgroundBox = new St.Bin({ name: 'dash', reactive: false, y_align: St.Align.START});
        this._backgroundBox.set_style('background-color: rgba(1,1,1,'+this._SETTINGS['background_opacity']+');padding:0;margin:0;border:0;');

        this.actor.set_track_hover(true);
        // Create and apply height constraint to the dash
        this.constrainHeight = new Clutter.BindConstraint({ source: Main.overview._viewSelector._pageArea,
                                                            coordinate: Clutter.BindCoordinate.HEIGHT });
        this.dash.actor.add_constraint(this.constrainHeight);

        this.constrainSize = new Clutter.BindConstraint({ source: this.dash._box,
                                                            coordinate: Clutter.BindCoordinate.SIZE });
        this._backgroundBox.add_constraint(this.constrainSize);

        // Put dock on the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // this store size and the position where the dash is shown;
        // used by intellihide module to check window overlap.
        this.staticBox = new Clutter.ActorBox({x1:0, y1:0, x2:100, y2:500});

        // Connect global signals
        this._pushSignals(
            // Connect events for updating dash vertical position
            [
                Main.overview._viewSelector._pageArea,
                'notify::y',
                Lang.bind(this, this._redisplay)
            ],
            [
                Main.overview._viewSelector,
                'notify::y',
                Lang.bind(this, this._redisplay)
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
            ]
        );

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        //Add dash and backgroundBox to the container actor and the last to the Chrome.
        this.actor.add_actor(this._backgroundBox);
        this.actor.add_actor(this.dash.actor);
        Main.layoutManager.addChrome(this.actor, { affectsStruts: 0 });

        // and update position and clip when width changes, that is when icons size and thus dash size changes.
        this.dash.actor.connect('notify::width', Lang.bind(this, this._redisplay));

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
        //put out of the screen so its initial show is animated
        this.actor.x = this.staticBox.x1 - this.staticBox.x2+this.staticBox.x1+1;

        // Show 
        this.actor.set_opacity(255); //this.actor.show();
        this._redisplay();

    },

    destroy: function(){

        // Disconnect global signals
        this._disconnectSignals();
        // Destroy main clutter actor: this should be sufficient
        // From clutter documentation:
        // If the actor is inside a container, the actor will be removed.
        // When you destroy a container, its children will be destroyed as well. 
        this.actor.destroy();

        // Reshow normal dash previously hidden
        Main.overview._dash.actor.show();

    },

    _loadSettings: function(){

        // Gnome 3.4+
        if(this._settings) {

        let settings = this._settings;

            this._SETTINGS = {

                animation_time: settings.get_double('animation-time'),
                show_delay: settings.get_double('show-delay'),
                hide_delay: settings.get_double('hide-delay'),
                opaque_background: settings.get_boolean('opaque-background'),
                background_opacity: settings.get_double('background-opacity'),
                opaque_background_always: settings.get_boolean('opaque-background-always')

            };

        // Gnome 3.2
        } else{

            this._SETTINGS = { 

                animation_time: ANIMATION_TIME,
                show_delay: SHOW_DELAY,
                hide_delay: HIDE_DELAY,
                opaque_background: OPAQUE_BACKGROUND,
                background_opacity: BACKGROUND_OPACITY,
                opaque_background_always: OPAQUE_BACKGROUND_ALWAYS

            };
        }
    },

    _bindSettingsChanges: function() {

        let double_keys = ['hide-delay', 'show-delay', 'animation-time'];
        for(let i=0; i<double_keys.length; i++){
            let key = double_keys[i];
            this._settings.connect('changed::'+key, Lang.bind(this, function() {
                this._loadSettings(this._settings);
                let keyJ = all_keys[i].replace('-', '_');
                this._SETTINGS[keyJ] = this._settings.get_double(key);
            }));
        }

        this._settings.connect('changed::opaque-background', Lang.bind(this, function(){
            this._SETTINGS['opaque_background'] = this._settings.get_boolean('opaque-background');
            this._updateBackgroundOpacity();
        }));

        this._settings.connect('changed::background-opacity', Lang.bind(this, function(){
            this._SETTINGS['background_opacity'] = this._settings.get_double('background-opacity');
            this._backgroundBox.set_style('background-color: rgba(1,1,1,'+this._SETTINGS['background_opacity']+');padding:0;margin:0;border:0;');
        }));

        this._settings.connect('changed::opaque-background-always', Lang.bind(this, function(){
            this._SETTINGS['opaque_background_always'] = this._settings.get_boolean('opaque-background-always');
            this._updateBackgroundOpacity();
        }));
    },

    _hoverChanged: function() {
        if(this._autohide){
            if( this.actor.hover ) {
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

        if( this._autohide && ( anim.hidden() || anim.hiding() ) && !DISABLE_AUTOHIDE ){

            let delay;
            // If the dock is hidden, wait this._SETTINGS['show_delay'] before showing it; 
            // otherwise show it immediately.
            if(anim.hidden()){
                delay = this._SETTINGS['show_delay'];
            } else if(anim.hiding()){
                // suppress all potential queued hiding animations (always give priority to show)
                this._removeAnimations();
                delay = 0;
            }

            this._animateIn(this._SETTINGS['animation_time'], delay);
        }
    },

    _hide: function() {

        if(_DEBUG_) global.log("hide " + anim.showing() + " " + anim.hiding() +
                            " " + anim.shown() + " " + anim.hidden());

        var anim = this._animStatus;

        // If no hiding animation is running or queued
        if( this._autohide && (anim.showing() || anim.shown() ) && !DISABLE_AUTOHIDE ){

            let delay;

            // If a show is queued but still not started (i.e the mouse was 
            // over the screen  border but then went away, i.e not a sufficient 
            // amount of time is passeed to trigger the dock showing) remove it.
            if( anim.showing()) {
                if(anim.running){
                    //if a show already started, let it finish; queue hide without removing the show.
                    // to obtain this I increase the delay to avoid the overlap and interference 
                    // between the animations
                    delay = this._SETTINGS['hide_delay'] + 2*this._SETTINGS['animation_time'] + this._SETTINGS['show_delay'];

                } else {
                    this._removeAnimations();
                    delay = 0;
                }
            } else if( anim.shown() ) {
                delay = this._SETTINGS['hide_delay'];
            }

            this._animateOut(this._SETTINGS['animation_time'], delay);

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
                onComplete: Lang.bind(this, function() {this._animStatus.end();})
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

        Tweener.removeTweens(this._backgroundBox);

        Tweener.addTween(this._backgroundBox,{
            opacity: 0,
            time: time,
            delay: delay,
            transition: 'easeOutQuad'
        });

    }, 

    _fadeInBackground:function (time, delay) {

        Tweener.removeTweens(this._backgroundBox);

        Tweener.addTween(this._backgroundBox,{
            opacity: 255,
            time: time,
            delay: delay,
            transition: 'easeOutQuad'
        });

    },

    _updateBackgroundOpacity: function() {

        if(this._SETTINGS['opaque_background'] && (this._autohide || this._SETTINGS['opaque_background_always'])){
            this._backgroundBox.show();
            this._fadeInBackground(this._SETTINGS['animation_time'], 0);
        }
        else if(!this._SETTINGS['opaque_background'] || (!this._autohide && !this._SETTINGS['opaque_background_always'])) {
            this._fadeOutBackground(this._SETTINGS['animation_time'], 0);
        }
    },

    _redisplay: function() {

        this._updateStaticBox();

        // update y position
        this.actor.y = this.staticBox.y1;

        // Update dash x position animating it
        if( this._animStatus.hidden() ){
            this._removeAnimations();
            this._animateOut(0, 0);
        } else if( this._animStatus.shown() ){
            this._removeAnimations();
            this._animateIn(this._SETTINGS['animation_time'], 0);
        }

        this._updateBackgroundOpacity();
        this._updateClip();

    },

    _updateStaticBox: function() {
        this.staticBox.init_rect(
            this._monitor.x,
            this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y,
            this.dash.actor.width,
            this.dash.actor.height
        );

        this.emit('box-changed');
    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._updateStaticBox();
        this.actor.x = this.staticBox.x1;
        this.actor.y = this.staticBox.y1;
        this._updateClip();
    },

    _removeAnimations: function() {
        Tweener.removeTweens(this.actor);
        this._animStatus.clear();
    },

    _onDragStart: function(){
        global.stage_input_mode = Shell.StageInputMode.FULLSCREEN;
    },

    _onDragEnd: function(){
        if(Main.overview.visible==false){ 
            global.stage_input_mode = Shell.StageInputMode.NORMAL;
        }

        this.actor.sync_hover();
    },

    // try to simplify global signals handling
    _pushSignals: function(/*unlimited 3-long array arguments*/) {

        for( let i = 0; i < arguments.length; i++ ) {
            let object = arguments[i][0];
            let event = arguments[i][1];

            let id = object.connect(event, arguments[i][2]);
            this._signals.push( [ object , id ] );
        }
    },

    _disconnectSignals: function() {

        for( let i = 0; i < this._signals.length; i++ ) {
            this._signals[i][0].disconnect(this._signals[i][1]);
        }
    },

    // Disable autohide effect, thus show dash
    disableAutoHide: function() {
        if(this._autohide==true){
            this._autohide = false;
            this._removeAnimations();
            this._animateIn(this._SETTINGS['animation_time'], 0);
            if(this._SETTINGS['opaque_background'] && !this._SETTINGS['opaque_background_always'])
                this._fadeOutBackground(this._SETTINGS['animation_time'], 0);
        }
    },

    // Enable autohide effect, hide dash
    enableAutoHide: function() {
        if(this._autohide==false){
            this._autohide = true;
            this._removeAnimations();
            if(!this.actor.hover && !DISABLE_AUTOHIDE) this._animateOut(this._SETTINGS['animation_time'], 0);
            if(this._SETTINGS['opaque_background'] && !this._SETTINGS['opaque_background_always'])
                this._fadeInBackground(this._SETTINGS['animation_time'], 0);
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


