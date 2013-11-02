// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

// A good compromise between reactivity and efficiency; to be tuned.
const INTELLIHIDE_CHECK_INTERVAL = 100;

// List of windows type taken into account. Order is important (keep the original
// enum order).
const handledWindowTypes = [
  Meta.WindowType.NORMAL,
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

const intellihide = new Lang.Class({
    Name: 'Intellihide',

    _init: function(show, hide, target, settings) {

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalsHandler = new Convenience.GlobalSignalsHandler();
        this._tracker = Shell.WindowTracker.get_default();
        this._focusApp = null;

        // Set base functions
        this._show = show;
        this._hide = hide;

        // Target object
        this._target = target;

        // Main id of the timeout controlling timeout for updateDockVisibility function 
        // when windows are dragged around (move and resize)
        this._windowChangedTimeout = 0;

        this._isEnabled =  this._settings.get_boolean('intellihide') &&
                          !this._settings.get_boolean('dock-fixed');

        if(this._isEnabled)
            this._enable();

    },

    destroy: function() {

        // Disconnect global signals
        this._signalsHandler.destroy();

        if(this._windowChangedTimeout>0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure
        this._windowChangedTimeout=0;
    },

    _bindSettingsChanges: function() {

        function settingsChange(){
           this._isEnabled =  this._settings.get_boolean('intellihide') &&
                              !this._settings.get_boolean('dock-fixed');

            if (this._isEnabled)
                this._enable();
            else
                this._disable();
        }

        this._settings.connect('changed::intellihide', Lang.bind(this, settingsChange));
        this._settings.connect('changed::dock-fixed',  Lang.bind(this, settingsChange));

        this._settings.connect('changed::intellihide-perapp', Lang.bind(this, function(){
            this._updateDockVisibility();
        }));


    },

    _enable: function() {

      // Avoid to duplicate the global signals.
      this._signalsHandler.destroy();

      // Connect global signals
        this._signalsHandler.add(
            // call updateVisibility when target actor changes
            [
                this._target,
                'box-changed',
                Lang.bind(this, this._updateDockVisibility)
            ],
            // Add timeout when window grab-operation begins and remove it when it ends.
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
            // trigggered for instance when a window list order changes,
            // included when the workspace is switched
            [
                global.screen,
                'restacked',
                Lang.bind(this, this._updateDockVisibility)
            ],
            // Disable intellihide when in overview
            [
                Main.overview,
                'hiding',
                Lang.bind(this, this._overviewExit)
            ],
            // Re-enable intellihide when exiting the overview
            [
                Main.overview,
                'showing',
                Lang.bind(this, this._overviewEnter)
            ],

            // update wne monitor changes, for instance in multimonitor when monitor are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._updateDockVisibility )
            ]
        );

        this._updateDockVisibility();
    },

    // Disconnect signals tracking windows changes
    // disabling intellihide control of the dash visibility
    _disable: function() {
        this._signalsHandler.destroy()
        this._show();
    },

    _overviewExit : function() {
        this._isEnabled =  this._settings.get_boolean('intellihide') &&
                          !this._settings.get_boolean('dock-fixed');

        this._updateDockVisibility();
    },

    _overviewEnter: function() {
        // Temporary disable intellihide
        this._isEnabled = false;
    },

    _grabOpBegin: function() {

        if(this._isEnabled){
            if(this._windowChangedTimeout>0)
                Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

            this._windowChangedTimeout = Mainloop.timeout_add(INTELLIHIDE_CHECK_INTERVAL,
                Lang.bind(this, function(){
                    this._updateDockVisibility();
                    return true; // to make the loop continue
                })
            );
        }
    },

    _grabOpEnd: function() {

            if(this._windowChangedTimeout>0)
                Mainloop.source_remove(this._windowChangedTimeout);

            this._windowChangedTimeout=0;
            this._updateDockVisibility();
    },

    _updateDockVisibility: function() {

        if( !this._isEnabled)
            return;

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

        if(overlaps)
            this._hide();
        else
            this._show();
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

    }

});
