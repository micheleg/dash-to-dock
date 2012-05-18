// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_ = false;

const Lang = imports.lang;
const Main = imports.ui.main;

const OverviewMode = {
    HIDE: 0,
    SHOW: 1
};

const PositionMode = { // ACHTUNG: Only LEFT working at the moment!
    LEFT:   0,
    RIGHT:  1,
    TOP:    2,
    BOTTOM: 3
};

// Settings
const OVERVIEW_MODE = OverviewMode.SHOW;
const POSITION_MODE = PositionMode.LEFT;



/*
 * A rough and ugly implementation of the intellihide behaviour.
 * Intallihide object: call show()/hide() function based on the overlap with the
 * the target actor. Intellihide is disabled in overview mode: in this case
 * OVERVIEW_MODE state is applied.
 * 
 * Hide is triggered whenever a window is near the screen border at a distance
 * less than the dock width, regardless of the dock vertical dimension.
 * 
*/

let intellihide = function(show, hide, target) {

    this._init(show, hide, target);
} 

intellihide.prototype = {

    _init: function(show, hide, target) {
    
        // Set base functions 
        this.show = show;
        this.hide = hide;
        // Target object
        this.target = target;
        // Keep track of the current overview mode (I mean if it is on/off)
        this._inOverview = false;
        // dinstance from the border below which hide effect is triggered. It is update to match the dock width;
        this._offset = 0; 
        // It is automatically updated by the below signal:
        this._onSizeChange = this.target.connect('notify::width', Lang.bind(this, this._updateOffset));

        // Add signals on windows created from now on
        this._onWindowCreated = global.display.connect('window-created', Lang.bind(this, this._windowCreated));
        this._onSwitchWorkspace = global.window_manager.connect('switch-workspace', Lang.bind(this, this._switchWorkspace ));
        // trigggered for instance when a window is closed.
        this._onRestacked = global.screen.connect('restacked',  Lang.bind(this, this._updateDockVisibility ));

        // Set visibility in overview mode      
        this._onOverviewEnter = Main.overview.connect('showing', Lang.bind(this, this._overviewEnter));
        this._onOverviewExit = Main.overview.connect('hiding', Lang.bind(this,this._overviewExit));

        // Add signals to current windows
        this._initializeAllWindowSignals();

        // update visibility
        this._updateOffset();
    },

    destroy: function() {
       
        // Clear global signals

        if (this._onWindowCreated) {
            global.display.disconnect(this._onWindowCreated);
            delete this._onWindowCreated;
        }

        if (this._onSwitchWorkspace) {
            global.window_manager.disconnect(this._onSwitchWorkspace);
            delete this._onSwitchWorkspace;
        }

        if (this._onRestacked) {
            global.screen.disconnect(this._onRestacked);
            delete this._onRestacked;
        }

        if (this._onOverviewEnter) {
            Main.overview.disconnect(this._onOverviewEnter);
            delete this._onOverviewEnter;
        }

        if (this._onOverviewExit) {
            Main.overview.disconnect(this._onOverviewExit);
            delete this._onOverviewExit;
        }

        // Clear signals on existing windows 

        global.get_window_actors().forEach(Lang.bind(this,function(wa) { 

            var the_window = wa.get_meta_window();

            this._removeWindowSignals(the_window);

         }));


    },

    _updateOffset : function() {

        if(_DEBUG_) global.log("width: " + this.target.width);
        if(_DEBUG_) global.log("x: " + this.target.x);

        if(POSITION_MODE <= 2) { 
            this._offset = this.target.width ;
        } else {
            this._offset = this.target.height;
        }

        this._updateDockVisibility();
    },

    _overviewExit : function() {
        this._inOverview = false;
        this._updateDockVisibility();

    },

    _overviewEnter: function() {

        this._inOverview = true;
        if(OVERVIEW_MODE == OverviewMode.SHOW){
                this.show();
        } else {
                this.hide();
        }
    },

    _windowCreated: function(__unused_display, the_window) {

        this._addWindowSignals(the_window);

    },

    _addWindowSignals: function(the_window) {
            
            // Looking for a way to avoid to add custom variables ...
            the_window._micheledash_onPositionChanged = the_window.get_compositor_private().connect(
                'position-changed', Lang.bind(this, this._updateDockVisibility)
            );

            the_window._micheledash_onSizeChanged = the_window.get_compositor_private().connect(
                'size-changed', Lang.bind(this, this._updateDockVisibility)
            );

    },

    _removeWindowSignals: function(the_window) {
        
        var wa = the_window.get_compositor_private();

        if( the_window && the_window._micheledash_onSizeChanged ) {
               wa.disconnect(the_window._micheledash_onSizeChanged);
               delete the_window._micheledash_onSizeChanged;
        }

        if( the_window && the_window._micheledash_onPositionChanged ) {
               wa.disconnect(the_window._micheledash_onPositionChanged);
               delete the_window._micheledash_onPositionChanged;
        }
    },

    _switchWorkspace: function(shellwm, from, to, direction) {
        
        this._updateDockVisibility();

    },

    _updateDockVisibility: function() {  
        

        // If we are in overview mode and the dock is set to be visible prevent 
        // it to be hidden by window events(window create, workspace change, 
        // window close...)
        if( OVERVIEW_MODE == OverviewMode.SHOW && this._inOverview ) {
            return;
        }
        //else

        var currentWorkspace = global.screen.get_active_workspace_index();

        var edge = 5000; // TODO: for the time being a very big number, bigger than any reasonable dock width.

        /* Originally inspired by Opacify@gnome-shell.localdomain.pl extension */
        global.get_window_actors().forEach(function(wa) {

            var meta_win = wa.get_meta_window();
            if (!meta_win) {    //TODO michele: why? What does it mean?
                return;
            }   
            
            var left_edge = meta_win.get_outer_rect().x


            var wksp = meta_win.get_workspace();
            var wksp_index = wksp.index();

            if ( wksp_index == currentWorkspace && !meta_win.is_hidden() ) {

                if(left_edge < edge ){
                    edge=left_edge;
                }         
            }
        });

        if( edge < this._offset) {
            this.hide();
        } else {
            this.show();
        }
    },

    _initializeAllWindowSignals: function () {
        
        global.get_window_actors().forEach(Lang.bind(this,function(wa) {

            var meta_win = wa.get_meta_window();
            if (!meta_win) {    //TODO michele: why? What does it mean?
                return;
            } 
            // First remove signals if already present. It should never happen 
            // if the extension is correctly unloaded.
            this._removeWindowSignals(meta_win);
            this._addWindowSignals(meta_win);

        }));
    }


};
