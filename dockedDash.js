// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_= false;

const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;

const Dash = imports.ui.dash;


function dockedDash() {

    this._init();
}

dockedDash.prototype = {
 
    _init: function() {

        // turn on/off hide function; default on;
        this._hideable = true;
        // Whether show/hide animation are running;
        this._hiding = false;
        this._showing = false;
        this._queuedHiding = false;
        this._queuedShowing = false;

        // Hide usual Dash
        Main.overview._dash.actor.hide();

        // Create a new dash object
        this.dash = new Dash.Dash(); // this.dash = new MyDash.myDash();

        // Create the main container
        this.actor = new St.Bin({ name: 'mydash', reactive: true, style_class: 'box', y_align: St.Align.START});

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

        // Connect main autohide signals
        this.actor.connect("leave-event", Lang.bind(this, this.hide));
        this.actor.connect("enter-event", Lang.bind(this, this.show));

        // These events seem unnecessary  //TODO
        //this.actor.connect("button-press-event", Lang.bind(this, this.show));
        //this.actor.connect("button-release-event", Lang.bind(this, this.show));
        //this.actor.connect("captured-event", Lang.bind(this, this.show));

        //TODO this.actor.set_track_hover(true);
        //this.actor.connect("notify::hover", Lang.bind(this, function(){global.log("hover: "+ this.actor.get_hover());}));


        //Add dash to the container actor and the latter to the Chrome.
        this.actor.add_actor(this.dash.actor);
        Main.layoutManager.addChrome(this.actor, { affectsStruts: 0 });

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

    // Reset variables function. Be carefull to prevent jamming.
    _resetShow : function(){
        this._showing = false;
        this._queuedShowing =false;
    },

    _resetHide : function(){
        this._hiding = false;
        this._queuedHiding =false;
    },

    show: function(actor, event) {  


        if(_DEBUG_) global.log("enter-event " + this._showing + " " + this._hiding + this._queuedShowing);

        // If it is already showing or the animation is already queed do nothing
        if( this._hideable && !this._showing && !this._queuedShowing ){

            this._queuedShowing = true;

            // I just let the new animation overwrite the old one if present, 
            // so onOverwrite is automatically call.
            // suppress all potential queued hiding animations (always give priority to show)
            //if( this._hiding ||   this._queuedHiding){
                //Tweener.removeTweens(this.actor, "x");
                // As onComplete is not executed, ensure _hiding variable is reset. 
                // this._hiding = false; this._queuedHiding = false;
            //}

            Tweener.addTween(this.actor,{
                x: 0,
                time: 0.250,
                delay:0.250,
                transition: 'easeOutQuad',
                overwrite: true,
                onStart:  Lang.bind(this, function() {this._showing=true;this._queuedShowing = false; }),
                onComplete: Lang.bind(this, function() {this._showing=false; }),
                onOverwrite: Lang.bind(this, this._resetShow),
                onError: Lang.bind(this, this._resetShow)
            });

        }
    },

    hide: function(actor, event) {

        if(_DEBUG_) global.log("leave-event " + this._showing + " " + this._hiding);

            if(this._hideable && !this._hiding && !this._qeuedHiding){

                this._queuedHiding = true;
                let delta  = 0;
                let shouldOverwrite = true;

                // I just let the new animation overwrite the old one if present, 
                // so onOverwrite is automatically call.
                // If a show is queued but still not started (i.e the mouse was 
                // over the screen  border but then went away, i.e not a sufficient 
                // amount of time is passeed to trigger the dock showing) remove it.
                //if(this._queuedShowing && !this._showing){
                    //Tweener.removeTweens(this.actor, "x"); 
                    // this._showing = false; this._queuedShowing = false;
                //}

                // if a show already started, queue hide without removing the show.
                // to obtain this I increase the delay to avoid the overlap and interference 
                // between the animations and disable the overwrite tweener property;

                if(this._showing ){
                    delta = 0.500;
                    shouldOverwrite=false;
                    //this._showing=false; 
                }

                Tweener.addTween(this.actor,{
                    x: -this.actor.width+1,
                    time: 0.250,
                    delay:0.250 + delta ,
                    transition: 'easeOutQuad',
                    overwrite: shouldOverwrite,
                    onStart:  Lang.bind(this, function() {this._hiding=true; this._queuedHiding = false; }),
                    onComplete: Lang.bind(this, function() {this._hiding=false;}),
                    onOverwrite: Lang.bind(this, this._resetHide),
                    onError: Lang.bind(this, this._resetHide)
                });
        }
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

    disableAutoHide: function() {
        this.show();
        this._hideable = false;
    },

    enableAutoHide: function() {
        this._hideable = true;
        this.hide();
    } 
};

