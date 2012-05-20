// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_= false;

const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;

const Dash = imports.ui.dash;

// timings settings
const ANIMATION_TIME = 0.200;
const SHOW_DELAY = 0.500;
const HIDE_DELAY =  0.250;

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
        this.actor = new St.Bin({ name: 'mydash', reactive: true, style_class: 'box', y_align: St.Align.START});
        this.actor.connect("notify::hover", Lang.bind(this, this._hoverChanged));

        this.actor.set_track_hover(true);
        // Create and apply height constraint to the dash
        this.constrainHeight = new Clutter.BindConstraint({ source: Main.overview._viewSelector._pageArea,
                                                            coordinate: Clutter.BindCoordinate.HEIGHT });
        this.dash.actor.add_constraint(this.constrainHeight);

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
        // Make the dash background dark
        this.dash._box.set_style('background-color: rgba(0,0,0,0.9)');

        //Add dash to the container actor and the latter to the Chrome.
        this.actor.add_actor(this.dash.actor);
        Main.layoutManager.addChrome(this.actor, { affectsStruts: 0 });

        Main.overview._group.show(); //Workaround to get immediately the correct y position.
        this._redisplay();
        Main.overview._group.hide();

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
                Tweener.removeTweens(this.actor, "x");
            }

            // If the dock is hidden, wait SHOW_DELAY before showing it; 
            // otherwise show it immediately.
            if(anim.hidden()){
                delay = SHOW_DELAY;
            } else {
                delay = 0;
            }

            this._animateIn(ANIMATION_TIME, delay, true);
        }
    },

    _hide: function() {

        if(_DEBUG_) global.log("leave-event " + this._showing + " " + this._hiding);

            var anim = this._animStatus; 

            // If no hiding animation is running or queued
            if( this._autohide && (anim.showing() || anim.shown() ) ){

                let delay;
                let shouldOverwrite;

                // If a show is queued but still not started (i.e the mouse was 
                // over the screen  border but then went away, i.e not a sufficient 
                // amount of time is passeed to trigger the dock showing) remove it.
                if(anim.queued){
                    Tweener.removeTweens(this.actor, "x"); 
                }

                // However, if a show already started, let it finish; queue hide without removing the show.
                // to obtain this I increase the delay to avoid the overlap and interference 
                // between the animations and disable the overwrite tweener property;
                if(anim.running){
                    delay = HIDE_DELAY + 2*ANIMATION_TIME + SHOW_DELAY;
                    shouldOverwrite=false;
                } else {
                    delay = HIDE_DELAY;
                    shouldOverwrite=true;
                }

                this._animateOut(ANIMATION_TIME, delay, shouldOverwrite);

        }
    },

    _animateIn: function(time, delay, shouldOverwrite) {

        this._animStatus.queue(true);

        Tweener.addTween(this.actor,{
            x: 0,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            overwrite: shouldOverwrite,
            onStart:  Lang.bind(this, function() {this._animStatus.start(); }),
            onComplete: Lang.bind(this, function() {this._animStatus.end()})
        });

    },

    _animateOut: function(time, delay, shouldOverwrite){

        this._animStatus.queue(false);

        Tweener.addTween(this.actor,{
            x: -this.actor.width+1,
            time: time,
            delay: delay ,
            transition: 'easeOutQuad',
            overwrite: shouldOverwrite,
            onStart:  Lang.bind(this, function() {this._animStatus.start();}),
            onComplete: Lang.bind(this, function() {this._animStatus.end() })
        })
    },

    _redisplay: function() {
        // Update dash y position animating it
        Tweener.addTween(this.actor,{
            y: Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y,
            time: 0.150,
            delay:0.0,
            transition: 'easeOutQuad'
        });
    },

    // Disable autohide effect, thus show dash
    disableAutoHide: function() {
        if(this._autohide==true){
            this._autohide = false;
            this._animateIn(ANIMATION_TIME, 0, true);
        }
    },

    // Enable autohide effect, hide dash
    enableAutoHide: function() {
        if(this._autohide==false){
            this._autohide = true;
            this._animateOut(ANIMATION_TIME, 0, true);
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


