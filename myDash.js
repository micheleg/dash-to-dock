// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;

const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Dash = imports.ui.dash;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

const Overview = imports.ui.overview;

// This class extends the stock dash by slightly modifying some of it methods; 
// 
// The aim is:
// * control the icon max size;
// * control whether fovorites and running application are displyed;
// * enable animations also when not in overview mode.
//
// I'mnot sure it would have been a better to just 'forking' it...
const myDash = new Lang.Class({
    Name: 'dashToDock.myDash',
    Extends: Dash.Dash,

    _init: function(settings) {
        this.parent();

        this._settings = settings;
        this._allIconSize = [ 16, 22, 24, 32, 48, 64 ];
        this._avaiableIconSize = this._allIconSize ;

        this.setMaxIconSize(this._settings.get_int('dash-max-icon-size'));
    },

    setMaxIconSize: function(size) {

        if( size>=16 ){

            this._avaiableIconSize = this._allIconSize.filter(
                function(val){
                    return (val<=size);
                }
            );

            this._redisplay();
            return true;
        } else {
            return false
        }
    },

     // All copied from ui.dash.js version 3.4.2 with some minor customizations
     // marked with // MICHELE.
     // I just want to set if necessary a different maximum icon size and always
     // animate changed
     _adjustIconSize: function(){
        // For the icon size, we only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(function(actor) {
            return actor._delegate.child &&
                   actor._delegate.child._delegate &&
                   actor._delegate.child._delegate.icon &&
                   !actor._delegate.animatingOut;
        });

        if (iconChildren.length == 0) {
            this._box.add_style_pseudo_class('empty');
            return;
        }

        this._box.remove_style_pseudo_class('empty');

        if (this._maxHeight == -1)
            return;


        let themeNode = this._box.get_theme_node();
        let maxAllocation = new Clutter.ActorBox({ x1: 0, y1: 0,
                                                   x2: 42 /* whatever */,
                                                   y2: this._maxHeight });
        let maxContent = themeNode.get_content_box(maxAllocation);
        let availHeight = maxContent.y2 - maxContent.y1;
        let spacing = themeNode.get_length('spacing');


        let firstIcon = iconChildren[0]._delegate.child._delegate.icon;

        let minHeight, natHeight;

        // Enforce the current icon size during the size request if
        // the icon is animating
        if (firstIcon._animating) {
            let [currentWidth, currentHeight] = firstIcon.icon.get_size();

            firstIcon.icon.set_size(this.iconSize, this.iconSize);
            [minHeight, natHeight] = iconChildren[0].get_preferred_height(-1);

            firstIcon.icon.set_size(currentWidth, currentHeight);
        } else {
            [minHeight, natHeight] = iconChildren[0].get_preferred_height(-1);
        }


        // Subtract icon padding and box spacing from the available height
        availHeight -= iconChildren.length * (natHeight - this.iconSize) +
                       (iconChildren.length - 1) * spacing;

        let availSize = availHeight / iconChildren.length;

        // MICHELE START
        let iconSizes = this._avaiableIconSize;
        // MICHELE END 

        let newIconSize = 16;
        for (let i = 0; i < iconSizes.length; i++) {
            if (iconSizes[i] < availSize)
                newIconSize = iconSizes[i];
        }

        if (newIconSize == this.iconSize)
            return;

        let oldIconSize = this.iconSize;
        this.iconSize = newIconSize;
        this.emit('icon-size-changed');

        let scale = oldIconSize / newIconSize;
        for (let i = 0; i < iconChildren.length; i++) {
            let icon = iconChildren[i]._delegate.child._delegate.icon;

            // Set the new size immediately, to keep the icons' sizes
            // in sync with this.iconSize
            icon.setIconSize(this.iconSize);

            // Don't animate the icon size change when the overview
            // is not visible or when initially filling the dash

            // MICHELE always animate
            //if (!Main.overview.visible || !this._shownInitially)
            //    continue;
            if (!this._shownInitially)
                continue;

            let [targetWidth, targetHeight] = icon.icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            icon.icon.set_size(icon.icon.width * scale,
                               icon.icon.height * scale);

            icon._animating = true;
            Tweener.addTween(icon.icon,
                             { width: targetWidth,
                               height: targetHeight,
                               time: Dash.DASH_ANIMATION_TIME,
                               transition: 'easeOutQuad',
                               onComplete: function() {
                                   icon._animating = false;
                               }
                             });
        }
    },

    // All copied from ui.dash.js version 3.4.2 with some minor customizations
    // marked with // MICHELE.
    // Control whether favorites and running apps are shown or not
    _redisplay: function () {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();

        let children = this._box.get_children().filter(function(actor) {
                return actor._delegate.child &&
                       actor._delegate.child._delegate &&
                       actor._delegate.child._delegate.app;
            });
        // Apps currently in the dash
        let oldApps = children.map(function(actor) {
                return actor._delegate.child._delegate.app;
            });
        // Apps supposed to be in the dash
        let newApps = [];

        // MICHELE: settings showing/hiding running and favorites

        if( this._settings.get_boolean('show-favorites') ) {
            for (let id in favorites)
                newApps.push(favorites[id]);
        }

        if( this._settings.get_boolean('show-running') ) {
            for (let i = 0; i < running.length; i++) {
                let app = running[i];
                if (this._settings.get_boolean('show-favorites') && (app.get_id() in favorites) )
                    continue;
                newApps.push(app);
            }
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.
        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            // No change at oldIndex/newIndex
            if (oldApps[oldIndex] == newApps[newIndex]) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApps[oldIndex] &&
                newApps.indexOf(oldApps[oldIndex]) == -1) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApps[newIndex] &&
                oldApps.indexOf(newApps[newIndex]) == -1) {
                addedItems.push({ app: newApps[newIndex],
                                  item: this._createAppItem(newApps[newIndex]),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let insertHere = newApps[newIndex + 1] &&
                             newApps[newIndex + 1] == oldApps[oldIndex];
            let alreadyRemoved = removedActors.reduce(function(result, actor) {
                let removedApp = actor._delegate.child._delegate.app;
                return result || removedApp == newApps[newIndex];
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApps[newIndex]);
                addedItems.push({ app: newApps[newIndex],
                                  item: newItem,
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++)
            this._box.insert_child_at_index(addedItems[i].item.actor,
                                            addedItems[i].pos);

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i]._delegate;

            // Don't animate item removal when the overview is hidden

            // MICHELE always animate;

            // if (Main.overview.visible)
            //    item.animateOutAndDestroy();
            // else
            //    item.actor.destroy();

            item.animateOutAndDestroy();

        }

        this._adjustIconSize();

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once
        if (!this._shownInitially) {
            this._shownInitially = true;
            return;
        }

        // Don't animate item addition when the overview is hidden
        // MICHELE always animate;
        //if (!Main.overview.visible)
        //    return;

        for (let i = 0; i < addedItems.length; i++)
            addedItems[i].item.animateIn();
    },

    // I want to reset the displayed apps icon to mantain the correct order when changing
    // show favorites/show running settings
    resetAppIcons : function() {

        let children = this._box.get_children().filter(function(actor) {
            return actor._delegate.child &&
                   actor._delegate.child._delegate &&
                   actor._delegate.child._delegate.app;
        });
        for (let i = 0; i < children.length; i++) {
            let item = children[i]._delegate;

            // Do not animate, _redisplay should then be called
            // after animations ended.
            item.actor.destroy();
        }

        // TODO
        // to avoid ugly animations, just suppress them like when dash is first loaded.
        this._shownInitially = false;
        this._redisplay();

    },

    handleDragOver : function(source, actor, x, y, time) {

        // MICHELE: don't allow to add favourites if they are not displayed
        if( !this._settings.get_boolean('show-favorites') )
            return DND.DragMotionResult.NO_DROP;;

        return this.parent(source, actor, x, y, time);
    },

    acceptDrop : function(source, actor, x, y, time) {

        // MICHELE: don't allow to add favourites if they are not displayed
        if( !this._settings.get_boolean('show-favorites') )
            return true;

        return this.parent(source, actor, x, y, time);
    }

});

