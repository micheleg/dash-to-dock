// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const ViewSelector = imports.ui.viewSelector;

const Shell = imports.gi.Shell;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

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

        this._signalHandler = new Convenience.globalSignalHandler();
        this._tracker = Shell.WindowTracker.get_default();
        this._focusApp = null;

        // current intellihide status
        this.status;
        // manually temporary disable intellihide update
        this._disableIntellihide = false;
        // Set base functions
        this.showFunction = show;
        this.hideFunction = hide;
        // Target object
        this._target = target;

        // Main id of the timeout controlling timeout for updateDockVisibility function 
        // when windows are dragged around (move and resize)
        this._windowChangedTimeout = 0;

        // Connect global signals
        this._signalHandler.push(
            // call updateVisibility when target actor changes
            [
                this._target,
                'box-changed',
                Lang.bind(this, this._updateDockVisibility)
            ],
            // Add timeout when window grab-operation begins and remove it when it ends.
            // These signals only exist starting from Gnome-Shell 3.4
            [
                global.display,
                'grab-op-begin',
                Lang.bind(this, this._grabOpBegin)
            ],
            [
                global.display,
                'grab-op-end',
                Lang.bind(this, this._grabOpEnd)
            ],
            // direct maximize/unmazimize are not included in grab-operations
            [
                global.window_manager,
                'maximize', 
                Lang.bind(this, this._updateDockVisibility )
            ],
            [
                global.window_manager,
                'unmaximize',
                Lang.bind(this, this._updateDockVisibility )
            ],
            // Probably this is also included in restacked?
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
                Lang.bind(this, this._overviewExit)
            ],
            // Follow 3.8 behaviour: hide on appview
            [
                Main.overview._viewSelector,
                'page-changed',
                Lang.bind(this, this._pageChanged)
            ],
            // update wne monitor changes, for instance in multimonitor when monitor are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._updateDockVisibility )
            ]
        );

        // initialize: call show forcing to initialize status variable
        this._show(true);

        // Load optional features
        this._optionalBoltSupport();

        // update visibility
        this._updateDockVisibility();
    },

    destroy: function() {

        // Disconnect global signals
        this._signalHandler.disconnect();

        if(this._windowChangedTimeout>0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure
    },

    _bindSettingsChanges: function() {

        this._settings.connect('changed::intellihide', Lang.bind(this, function(){
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::intellihide-perapp', Lang.bind(this, function(){
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function(){
            if(this._settings.get_boolean('dock-fixed')) {
                this.status = true; // Since the dock is now shown
            } else {
                // Wait that windows rearrange after struts change
                Mainloop.idle_add(Lang.bind(this, function() {
                    this._updateDockVisibility();
                    return false;
                }));
            }
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
        this._disableIntellihide = false;
        this._updateDockVisibility();

    },

    _overviewEnter: function() {
        this._disableIntellihide = true;
        this._show();
    },

    _pageChanged: function() {

        let activePage = Main.overview._viewSelector.getActivePage();
        let dashVisible = (activePage == ViewSelector.ViewPage.WINDOWS ||
                           activePage == ViewSelector.ViewPage.APPS);

        if(dashVisible){
            this._disableIntellihide = false;
            this._show();
        } else {
            this._disableIntellihide = true;
            this._hide();
        }
    },

    _grabOpBegin: function() {

        if(this._settings.get_boolean('intellihide')){
            let INTERVAL = 100; // A good compromise between reactivity and efficiency; to be tuned.

            if(this._windowChangedTimeout>0)
                Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

            this._windowChangedTimeout = Mainloop.timeout_add(INTERVAL,
                Lang.bind(this, function(){
                    this._updateDockVisibility();
                    return true; // to make the loop continue
                })
            );
        }
    },

    _grabOpEnd: function() {

        if(this._settings.get_boolean('intellihide')){
            if(this._windowChangedTimeout>0)
                Mainloop.source_remove(this._windowChangedTimeout);

            this._updateDockVisibility();
        }
    },

    _switchWorkspace: function(shellwm, from, to, direction) {
        
        this._updateDockVisibility();

    },

    _updateDockVisibility: function() {

        if( !(this._settings.get_boolean('dock-fixed') || this._disableIntellihide)) {

            if( this._settings.get_boolean('intellihide') ){

                let overlaps = false;
                let windows = global.get_window_actors();

                if (windows.length>0){

                    // This is the window on top of all others in the current workspace
                    let topWindow = windows[windows.length-1].get_meta_window();
                    // If there isn't a focused app, use that of the window on top
                    this._focusApp = this._tracker.focus_app || this._tracker.get_window_app(topWindow);

                    windows = windows.filter(this._intellihideFilterInteresting, this);

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
                }

                if(overlaps) {
                    this._hide();
                } else {
                    this._show();
                }
            } else {
                this._hide();
            }
        }
    },

    // Filter interesting windows to be considered for intellihide.
    // Consider all windows visible on the current workspace.
    // Optionally skip windows of other applications
    _intellihideFilterInteresting: function(wa){

        var currentWorkspace = global.screen.get_active_workspace_index();

        var meta_win = wa.get_meta_window();
        if (!meta_win) {
            return false;
        }

        if ( !this._handledWindow(meta_win) )
            return false;

        var wksp = meta_win.get_workspace();
        var wksp_index = wksp.index();

        // Skip windows of other apps
        if(this._focusApp && this._settings.get_boolean('intellihide-perapp')) {
            // The DropDownTerminal extension is not an application per se
            // so we match its window by wm class instead
            if (meta_win.get_wm_class() == 'DropDownTerminalWindow')
                return true;

            let currentApp = this._tracker.get_window_app(meta_win);

            // But consider half maximized windows
            // Useful if one is using two apps side by side
            if( this._focusApp != currentApp && !(meta_win.maximized_vertically && !meta_win.maximized_horizontally) )
                return false;
        }

        if ( wksp_index == currentWorkspace && meta_win.showing_on_its_workspace() ) {
            return true;
        } else {
            return false;
        }

    },

    // Filter windows by type
    // inspired by Opacify@gnome-shell.localdomain.pl
    _handledWindow: function(metaWindow) {
        // The DropDownTerminal extension uses the POPUP_MENU window type hint
        // so we match its window by wm class instead
        if (metaWindow.get_wm_class() == 'DropDownTerminalWindow')
            return true;

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

    // Optional features enable/disable

    // Basic bolt extension support
    _optionalBoltSupport: function() {

        let label = 'optionalBoltSupport';

        this._settings.connect('changed::bolt-support',Lang.bind(this, function(){
            if(this._settings.get_boolean('bolt-support'))
                Lang.bind(this, enable)();
            else
                Lang.bind(this, disable)();
        }));

        if(this._settings.get_boolean('bolt-support'))
            Lang.bind(this, enable)();

        function enable() {
            this._signalHandler.disconnectWithLabel(label);
            this._signalHandler.pushWithLabel(label,
                [
                    Main.overview,
                    'bolt-showing',
                    Lang.bind(this, function(){
                        this._disableIntellihide = true;
                        this._hide();
                    })
                ],
                [
                    Main.overview,
                    'bolt-hiding',
                    Lang.bind(this, function(){
                        this._disableIntellihide = false;
                        this._updateDockVisibility();
                    })
                ]
            );
        }

        function disable() {
            this._signalHandler.disconnectWithLabel(label);
        }
    }

};
