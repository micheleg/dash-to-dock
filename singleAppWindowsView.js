

const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspacesView = imports.ui.workspacesView;

const singleAppWindowsView = new Lang.Class({
    Name: 'singleAppWindowsView',

    _init: function(){

        this.actor = new St.Widget();

        this.actor.connect('notify::allocation', Lang.bind(this, this._updateWorkspacesActualGeometry));

        this._update();
    },

    _update: function(){
  
        if (this._workspace)
            this._workspace.actor.destroy();
        this._workspace = new singleAppWindowsWorkspace() ;
        this.actor.add_actor(this._workspace.actor);


        //this._workspace.setFullGeometry(Main.layoutManager.monitors[0]);
        //this._workspace.setActualGeometry(Main.layoutManager.monitors[0]);

        this._workspace.setFullGeometry(Main.layoutManager.monitors[0]);

        this._updateWorkspacesActualGeometry();

    },

    _updateWorkspacesActualGeometry: function() {

            let geom = this.actor.get_allocation_geometry();
            this._workspace.setActualGeometry(geom);
            // I don't know what it is...
            this._workspace.setFullGeometry(geom);
      }

});



const singleAppWindowsWorkspace = new Lang.Class({
    Name: 'singleAppWindowsWorkspace',
    Extends: Workspace.Workspace,

    _init: function(){
        let metaWorkspace = global.screen.get_workspace_by_index(0);
        //this.parent(metaWorkspace, 0);
        this.parent(null, 0);

        global.log('********************** ' + this.actor);

        this._app = null;

        // tmp debug
        this.actor._delegate = this;  
    },

    updateApp: function(app) {

        this._app = app;

        let allWindows =global.get_window_actors().filter(this._isMyWindow, this);

        let appWindows = [];
        if(app)
            appWindows = app.get_windows();//.filter(this._isOverviewWindow, this);

        let currentWindows = this._windows;


        global.log(this._windows.length);
        global.log(appWindows.length);

/*        
        for (let i=0; i<appWindows.length; i++)
            this._doAddWindow(appWindows[i].get_meta_window());
*/

          let toDelete = [];

        currentWindows.forEach(function(w) {
            toDelete.push(w.metaWindow);
        }, this);


        toDelete.forEach(function(w) {
            this._doRemoveWindow(w);
        }, this);

        for (let i=0; i<appWindows.length; i++)
            this._doAddWindow(appWindows[i]);

    },

    _isMyWindow2:function (actor) {
        /*
        let win = actor.meta_window;
        return (this.metaWorkspace == null || win.located_on_workspace(this.metaWorkspace)) &&
            (win.get_monitor() == this.monitorIndex);*/
        return true;
    },

_updateWindowPositions2: function(flags) {
        if (this._currentLayout == null) {
            this._recalculateWindowPositions(flags);
            return;
        }

        // We will reposition windows anyway when enter again overview or when ending the windows
        // animations whith fade animation.
        // In this way we avoid unwanted animations of windows repositioning while
        // animating overview.
        if (this.leavingOverview || this._animatingWindowsFade)
            return;

        let initialPositioning = flags & WindowPositionFlags.INITIAL;
        let animate = flags & WindowPositionFlags.ANIMATE;

        let layout = this._currentLayout;
        let strategy = layout.strategy;

        let [, , padding] = this._getSpacingAndPadding();
        let area = padArea(this._actualGeometry, padding);
        let slots = strategy.computeWindowSlots(layout, area);

        let currentWorkspace = global.screen.get_active_workspace();
        let isOnCurrentWorkspace = this.metaWorkspace == null || this.metaWorkspace == currentWorkspace;

        for (let i = 0; i < slots.length; i++) {
            let slot = slots[i];
            let [x, y, scale, clone] = slot;
            let metaWindow = clone.metaWindow;
            let overlay = clone.overlay;
            clone.slotId = i;

            // Positioning a window currently being dragged must be avoided;
            // we'll just leave a blank spot in the layout for it.
            if (clone.inDrag)
                continue;

            let cloneWidth = clone.actor.width * scale;
            let cloneHeight = clone.actor.height * scale;
            clone.slot = [x, y, cloneWidth, cloneHeight];

            if (overlay && (initialPositioning || !clone.positioned))
                overlay.hide();

            if (!clone.positioned) {
                // This window appeared after the overview was already up
                // Grow the clone from the center of the slot
                clone.actor.x = x + cloneWidth / 2;
                clone.actor.y = y + cloneHeight / 2;
                clone.actor.scale_x = 0;
                clone.actor.scale_y = 0;
                clone.positioned = true;
            }

            if (animate && isOnCurrentWorkspace) {
                if (!metaWindow.showing_on_its_workspace()) {
                    /* Hidden windows should fade in and grow
                     * therefore we need to resize them now so they
                     * can be scaled up later */
                    if (initialPositioning) {
                        clone.actor.opacity = 0;
                        clone.actor.scale_x = 0;
                        clone.actor.scale_y = 0;
                        clone.actor.x = x;
                        clone.actor.y = y;
                    }

                    Tweener.addTween(clone.actor,
                                     { opacity: 255,
                                       time: Overview.ANIMATION_TIME,
                                       transition: 'easeInQuad'
                                     });
                }

                this._animateClone(clone, overlay, x, y, scale);
            } else {
                // cancel any active tweens (otherwise they might override our changes)
                Tweener.removeTweens(clone.actor);
                clone.actor.set_position(x, y);
                clone.actor.set_scale(scale, scale);
                clone.actor.set_opacity(255);
                clone.overlay.relayout(false);
                this._showWindowOverlay(clone, overlay);
            }
        }
    },

});
