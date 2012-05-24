// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_= false;

const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;

const Dash = imports.ui.dash;


// SETTINGS

const ANIMATION_TIME = 0.200; // show/hide transition time
const SHOW_DELAY     = 0.500; // delay before showing dash when it's hidden 
const HIDE_DELAY     = 0.250; // delay befoee hiding dash when mouse goes out

const OPAQUE_BACKGROUND = true; // make the dash opaque increasing readability.
                                 // Some themes like the default one have a transparent bacground.

const OPAQUE_BACKGROUND_ALWAYS = false; // whether the dash has always an opaque background or only when 
                                        // in autohide mode

// END OF SETTINGS

function dockedDash() {

    this._init();
}

dockedDash.prototype = {
 
    _init: function() {

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
        this._backgroundBox.set_style('background-color: rgba(1,1,1,0.8);padding:0;margin:0;border:0;');

        this.actor.set_track_hover(true);
        // Create and apply height constraint to the dash
        this.constrainHeight = new Clutter.BindConstraint({ source: Main.overview._viewSelector._pageArea,
                                                            coordinate: Clutter.BindCoordinate.HEIGHT });
        this.dash.actor.add_constraint(this.constrainHeight);

        this.constrainSize = new Clutter.BindConstraint({ source: this.dash._box,
                                                            coordinate: Clutter.BindCoordinate.SIZE });
        this._backgroundBox.add_constraint(this.constrainSize);

        // Connect events for updating dash vertical position
        this._resizeId1 = Main.overview._viewSelector._pageArea.connect("notify::y", Lang.bind(this, this._redisplay));
        this._resizeId2 = Main.overview._viewSelector.connect("notify::y", Lang.bind(this, this._redisplay));

        // Allow app icons do be dragged out of the chrome actors when reordering or deleting theme while not on overview mode
        // by changing global stage input mode
        this._dragStartId = Main.overview.connect('item-drag-begin',
                              Lang.bind(this, function(){ global.stage_input_mode = Shell.StageInputMode.FULLSCREEN;}));
        this._dragEndId = Main.overview.connect('item-drag-end',
                              Lang.bind(this, function(){ if(Main.overview.visible==false) global.stage_input_mode =
                                                           Shell.StageInputMode.NORMAL;}));

        //Add dash and backgroundBox to the container actor and the last to the Chrome.
        this.actor.add_actor(this._backgroundBox);
        this.actor.add_actor(this.dash.actor);
        Main.layoutManager.addChrome(this.actor, { affectsStruts: 0 });

        // Put dock on the primary monitor and clip it
        this.monitor = Main.layoutManager.primaryMonitor;
        this.position_x = this.monitor.x ;
        this._updateClip();
        // and update position and clip when allocation changes, that is when icons size and thus dash sise changes.
        this.dash.actor.connect('allocation-changed', Lang.bind(this, this._redisplay));

        this._redisplay();

    },

    destroy: function(){

        // Disconnect global signals 
        Main.overview._viewSelector._pageArea.disconnect(this._resizeId1);
        Main.overview._viewSelector.disconnect(this._resizeId2);
        Main.overview.disconnect(this._dragStartId);
        Main.overview.disconnect(this._dragEndId);

        // Destroy main clutter actor: this should be sufficient
        // From clutter documentation:
        // If the actor is inside a container, the actor will be removed.
        // When you destroy a container, its children will be destroyed as well. 
        this.actor.destroy();

        // Reshow normal dash previously hidden
        Main.overview._dash.actor.show();

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
        if(_DEBUG_) global.log("enter-event " + this._showing + " " + this._hiding + this._queuedShowing);

        // If no showing animation is running or queued
        if( this._autohide && (anim.hiding() || anim.hidden()) ){

            let delay;

            // suppress all potential queued hiding animations (always give priority to show)
            if( anim.queued ){
                Tweener.removeTweens(this.actor);
            }

            // If the dock is hidden, wait SHOW_DELAY before showing it; 
            // otherwise show it immediately.
            if(anim.hidden()){
                delay = SHOW_DELAY;
            } else {
                delay = 0;
            }

            this._animateIn(ANIMATION_TIME, delay);
        }
    },

    _hide: function() {

        if(_DEBUG_) global.log("leave-event " + this._showing + " " + this._hiding);

            var anim = this._animStatus; 

            // If no hiding animation is running or queued
            if( this._autohide && (anim.showing() || anim.shown() ) ){

                let delay;

                // If a show is queued but still not started (i.e the mouse was 
                // over the screen  border but then went away, i.e not a sufficient 
                // amount of time is passeed to trigger the dock showing) remove it.
                if(anim.queued){
                    Tweener.removeTweens(this.actor); 
                }

                // However, if a show already started, let it finish; queue hide without removing the show.
                // to obtain this I increase the delay to avoid the overlap and interference 
                // between the animations
                if(anim.running){
                    delay = HIDE_DELAY + 2*ANIMATION_TIME + SHOW_DELAY;
                } else {
                    delay = HIDE_DELAY;
                }

                this._animateOut(ANIMATION_TIME, delay);

        }
    },

    _animateIn: function(time, delay) {

        this._animStatus.queue(true);

        Tweener.addTween(this.actor,{
            x: this.position_x,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onUpdate: Lang.bind(this, this._updateClip),
            onStart:  Lang.bind(this, function() {this._animStatus.start(); }),
            onComplete: Lang.bind(this, function() {this._animStatus.end()})
        });

    },

    _animateOut: function(time, delay){

        this._animStatus.queue(false);

        Tweener.addTween(this.actor,{
            x: this.position_x-this.actor.width+1,
            time: time,
            delay: delay ,
            transition: 'easeOutQuad',
            onUpdate: Lang.bind(this, this._updateClip),
            onStart:  Lang.bind(this, function() {this._animStatus.start();}),
            onComplete: Lang.bind(this, function() {this._animStatus.end() })
        })
    },

    // clip dock to its original allocation along x and to the current monito along y
    // the current monitor; inspired by dock@gnome-shell-extensions.gcampax.github.com

    _updateClip: function(){

        // Here we implicitly assume that the stage and actor's parent
        // share the same coordinate space
        let clip = new Clutter.ActorBox({ x1: this.position_x,
                          y1: this.monitor.y,
                          x2: this.actor.x+this.actor.width, // it was this.actor.allocation.x2 
                                                        // but it does not work properly...
                                                        // I don't know what the substantal
                                                        // difference is between x and allocation.x
                          y2: this.monitor.y + this.monitor.height});

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

    _redisplay: function() {

        // Update dash y position animating it
        Tweener.addTween(this.actor,{
            y: Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y,
            time: 0.150,
            delay:0.0,
            transition: 'easeOutQuad'
        });

        // Update dash x position (for instance when its width changes due to icon are resized)
        // using hidden() / shown() do nothing is dash is already animating

        if( this._animStatus.hidden() ){
            this._animateOut(0, 0);
        } else if( this._animStatus.shown() ){
            this._animateIn(ANIMATION_TIME, 0);
        }

        // update background
        if(OPAQUE_BACKGROUND==true) {
            this._backgroundBox.show();
        } else {
            this._backgroundBox.hide();
        }

        //update clip
        this._updateClip();

    },

    _removeAnimations: function() {
        Tweener.removeTweens(this.actor);
    },

    // Disable autohide effect, thus show dash
    disableAutoHide: function() {
        if(this._autohide==true){
            this._autohide = false;
            this._removeAnimations();
            this._animateIn(ANIMATION_TIME, 0);
            if(OPAQUE_BACKGROUND && !OPAQUE_BACKGROUND_ALWAYS)
                this._fadeOutBackground(ANIMATION_TIME, 0);
        }
    },

    // Enable autohide effect, hide dash
    enableAutoHide: function() {
        if(this._autohide==false){
            this._autohide = true;
            this._removeAnimations();
            this._animateOut(ANIMATION_TIME, 0);
            if(OPAQUE_BACKGROUND && !OPAQUE_BACKGROUND_ALWAYS)
                this._fadeInBackground(ANIMATION_TIME, ANIMATION_TIME);
        }
    } 
};

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
        this.nextStatus  = initialStatus;
        this.queued = false;
        this.running = false;
    },

    queue: function(nextStatus){
        this.nextStatus = nextStatus;
        this.queued = true;
    },

    start: function(){
        this.queued = false;
        this.running = true;
    },

    end: function(){
        this.queued=false; // in the case end is called and start was not
        this.running=false;
        this.status = this.nextStatus;
    },

    // Return true if a showing animation is running or queued
    showing: function(){
        if( this.status==false && this.nextStatus == true)
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
        if( this.status==true && this.nextStatus == false )
            return true;
        else
            return false;
    },

    hidden: function(){
        if( this.status==false && !(this.queued || this.running) )
            return true;
        else
            return false;
    },
}


