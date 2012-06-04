// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const _DEBUG_ = false;

const Lang = imports.lang;
const Meta = imports.gi.Meta;

const Main = imports.ui.main;

const handledWindowTypes = [
  Meta.WindowType.NORMAL,
  // Meta.WindowType.DESKTOP,    // skip nautilus dekstop window
  // Meta.WindowType.DOCK,       // skip other docks
  Meta.WindowType.DIALOG,
  Meta.WindowType.MODAL_DIALOG,
  Meta.WindowType.TOOLBAR,
  Meta.WindowType.MENU,
  Meta.WindowType.UTILITY,
  Meta.WindowType.SPLASHSCREEN
];

const IntellihideMode = {
    HIDE: 0,            // Dash is always invisible
    SHOW: 1,            // Dash is always visible
    AUTOHIDE:2,         // Basic autohide mode: visible on mouse hover
    INTELLIHIDE: 3      // Basic intellihide mode: visible if no window overlap the dash
};

const OVERVIEW_MODE = IntellihideMode.SHOW;

/*
 * A rough and ugly implementation of the intellihide behaviour.
 * Intallihide object: call show()/hide() function based on the overlap with the
 * the target actor object;
 * 
 * Target object has to contain a Clutter.ActorBox object named staticBox and 
 * emit a 'box-changed' signal when this changes.
 * 
*/

let intellihide = function(show, hide, target, settings) {

    this._init(show, hide, target, settings);
} 

intellihide.prototype = {

    _init: function(show, hide, target, settings) {

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        //store global signals identifiers via _pushSignals();
        this._signals = [];

        // current intellihide status
        this.status;
        // Set base functions
        this.showFunction = show;
        this.hideFunction = hide;
        // Target object
        this._target = target;
        // Keep track of the current overview mode (I mean if it is on/off)
        this._inOverview = false;

        // Connect global signals
        this._pushSignals(
            // call updateVisibility when target actor changes
            [
                this._target,
                'box-changed',
                Lang.bind(this, this._updateDockVisibility)
            ],
            // Add signals on windows created from now on
            [
                global.display,
                'window-created',
                Lang.bind(this, this._windowCreated)
            ],
            [
                global.window_manager,
                'switch-workspace',
                Lang.bind(this, this._switchWorkspace)
            ],
            // trigggered for instance when a window is closed.
            [
                global.screen,
                'restacked',
                Lang.bind(this, this._updateDockVisibility)
            ],
            // Set visibility in overview mode
            [
                Main.overview,
                'showing',
                Lang.bind(this, this._overviewEnter)
            ],
            [
                Main.overview,
                'hiding',
                Lang.bind(this,this._overviewExit)
            ],
            // update wne monitor changes, for instance in multimonitor when monitor are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._updateDockVisibility )
            ]
        );

        // Add signals to current windows
        this._initializeAllWindowSignals();

        // initialize: call show forcing to initialize status variable
        this._show(true);

        // update visibility
        this._updateDockVisibility();
    },

    destroy: function() {

        // Disconnect global signals
        this._disconnectSignals();

    },

    _bindSettingsChanges: function() {

        this._settings.connect('changed::normal-mode', Lang.bind(this, function(){
            this._updateDockVisibility();
        }));
    },


    _show: function(force) {
        if (this.status==false || force){
            this.status = true;
            this.showFunction();
        }
    },

    _hide: function(force) {
        if (this.status==true || force){
            this.status = false;
            this.hideFunction();
        }
    },

    _overviewExit : function() {
        this._inOverview = false;
        this._updateDockVisibility();

    },

    _overviewEnter: function() {

        this._inOverview = true;
        if(OVERVIEW_MODE == IntellihideMode.SHOW){
                this._show();
        } else if (OVERVIEW_MODE == IntellihideMode.AUTOHIDE){
                this._hide();
        } else if (OVERVIEW_MODE == IntellihideMode.INTELLIHIDE){
            this._show();
        } else if (OVERVIEW_MODE == IntellihideMode.HIDE) {
            /*TODO*/
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

        if(this._inOverview){
            if( OVERVIEW_MODE !== IntellihideMode.INTELLIHIDE ) {
                return;
            }
        }

        //else in normal mode:
        if(this._settings.get_enum('normal-mode') == IntellihideMode.AUTOHIDE){
            this._hide();
            return;
        }
        else if(this._settings.get_enum('normal-mode') == IntellihideMode.SHOW){
            this._show();
            return;
        }
        else if(this._settings.get_enum('normal-mode') == IntellihideMode.HIDE){
            /*TODO*/
            return;
        } else if(this._settings.get_enum('normal-mode') == IntellihideMode.INTELLIHIDE){

            let overlaps = false;

            let windows = global.get_window_actors().filter(this._intellihideFilterInteresting, this);

            for(let i=0; i< windows.length; i++){

                let win = windows[i].get_meta_window();
                if(win){
                    let rect = win.get_outer_rect();

                    let test = ( rect.x < this._target.staticBox.x2) &&
                               ( rect.x +rect.width > this._target.staticBox.x1 ) &&
                               ( rect.y < this._target.staticBox.y2 ) &&
                               ( rect.y +rect.height > this._target.staticBox.y1 );

                    if(test){
                        overlaps = true;
                        break;
                    }
                }
            }

            if(overlaps) {
                this._hide();
            } else {
                this._show();
            }
        }
    },

    // Filter interesting windows to be considered for intellihide.
    // Consider all windows visible on the current workspace.
    _intellihideFilterInteresting: function(wa, edge){

        var currentWorkspace = global.screen.get_active_workspace_index();

        var meta_win = wa.get_meta_window();
        if (!meta_win) {    //TODO michele: why? What does it mean?
            return false;
        }

        if ( !this._handledWindowType(meta_win) ) 
            return false;

        var wksp = meta_win.get_workspace();
        var wksp_index = wksp.index();

        if ( wksp_index == currentWorkspace && meta_win.showing_on_its_workspace() ) {
            return true;
        } else {
            return false;
        }

    },

    // Filter windows by type
    // inspired by Opacify@gnome-shell.localdomain.pl
    _handledWindowType: function(metaWindow) { 
        var wtype = metaWindow.get_window_type();
        for (var i = 0; i < handledWindowTypes.length; i++) {
            var hwtype = handledWindowTypes[i];
            if (hwtype == wtype) {
                return true;
            } else if (hwtype > wtype) {
                return false;
            }
        }
        return false;
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
    }


};
