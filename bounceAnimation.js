// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    Clutter,
    GLib,
} from './dependencies/gi.js';

import {
    Main,
} from './dependencies/shell/ui.js';
import {
    St,
} from './dependencies/gi.js';

/**
 * Performs a bouncing animation on an icon
 * @param {Clutter.Actor} icon - The icon to animate
 */
export function startBounceAnimation(icon) {
    if (!icon) {
        return;
    }

    const BOUNCE_HEIGHT = 18;
    const BOUNCE_DURATION = 260;
    let running = true;
    let bounceCount = 0;
    const MAX_BOUNCES = 5;

    const wasReactive = icon.reactive;
    icon.reactive = false;

    icon.set_pivot_point(0.5, 0.5);

    let placeholder = null;
    let target = icon;
    let originalParent = icon.get_parent();
    let originalParentIndex = -1;
    let placeholderConnId = 0;
    let placeholderConnActor = null;
    let hasCompletedOneBounce = false;
    let shouldStop = false;

    try {
        const [gx, gy] = icon.get_transformed_position();
        const [gw, gh] = icon.get_transformed_size();

        // create placeholder to hold the icon's position in the dock
        placeholder = new St.Bin();
        placeholder.set_size(Math.max(1, Math.round(gw)), Math.max(1, Math.round(gh)));
        placeholder.set_pivot_point(0.5, 0.5);

        // get the icon's index in parent before reparenting
        if (originalParent) {
            const children = originalParent.get_children();
            originalParentIndex = children.indexOf(icon);

            // insert placeholder at the same position
            if (originalParentIndex >= 0) {
                originalParent.insert_child_at_index(placeholder, originalParentIndex);
            } else {
                originalParent.add_child(placeholder);
            }

            // listen to placeholder allocation changes to track dock reflows
            try {
                placeholderConnActor = placeholder;
                placeholderConnId = placeholder.connect('allocation-changed', () => {
                    try {
                        const [px, py] = placeholder.get_transformed_position();
                        const [currentX, currentY] = icon.get_position();
                        // sync icon position to follow placeholder when dock layout changes
                        icon.set_position(Math.round(px), currentY);
                    } catch (e) { /* ignore */ }
                });
            } catch (e) { /* ignore */ }
        }

        // reparent icon to Main.uiGroup for animation
        if (originalParent) {
            originalParent.remove_child(icon);
        }
        icon.set_position(Math.round(gx), Math.round(gy));
        Main.uiGroup.add_child(icon);
        target = icon;
    } catch (e) {
        placeholder = null;
        target = icon;
    }

    function syncPositionToPlaceholder() {
        if (!running || !placeholder || !icon || !originalParent) return;
        try {
            const [px, py] = placeholder.get_transformed_position();
            const [currentX, currentY] = icon.get_position();
            // sync icon x position to follow placeholder when dock layout changes
            icon.set_position(Math.round(px), currentY);
        } catch (e) { /* ignore */ }
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => { syncPositionToPlaceholder(); return GLib.SOURCE_REMOVE; });
    }

    function step() {
        if (!running) return;
        bounceCount++;
        try { target.remove_all_transitions(); } catch (e) { /* ignore */ }
        target.ease({
            translation_y: -BOUNCE_HEIGHT,
            scale_y: 1.08,
            duration: Math.floor(BOUNCE_DURATION / 2),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!running) return;
                target.ease({
                    translation_y: 0,
                    scale_y: 1.0,
                    duration: Math.floor(BOUNCE_DURATION / 2),
                    mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onComplete: () => {
                        if (!running) return;
                        // Mark that we've completed at least one bounce
                        hasCompletedOneBounce = true;

                        // If stop was requested while bouncing, honor it now
                        if (shouldStop) {
                            running = false;
                            handle.isActive = false;
                            cleanup();
                            return;
                        }

                        if (bounceCount >= MAX_BOUNCES) {
                            running = false;
                            handle.isActive = false;
                            cleanup();
                            return;
                        }
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => { step(); return GLib.SOURCE_REMOVE; });
                    },
                });
            },
        });
    }

    function cleanup() {
        try {
            running = false;
            // disconnect placeholder allocation listener
            if (placeholderConnActor && placeholderConnId) {
                try { placeholderConnActor.disconnect(placeholderConnId); } catch (e) { /* ignore */ }
                placeholderConnActor = null;
                placeholderConnId = 0;
            }
            // remove placeholder from dock
            if (placeholder) {
                try {
                    const parent = placeholder.get_parent();
                    if (parent) {
                        parent.remove_child(placeholder);
                    }
                } catch (e) { /* ignore */ }
                placeholder = null;
            }
            // reparent icon back to original parent
            if (originalParent && icon) {
                try {
                    // ensure icon is removed from Main.uiGroup first
                    if (Main.uiGroup.contains(icon)) {
                        Main.uiGroup.remove_child(icon);
                    }
                    // reparent back to original location
                    if (originalParentIndex >= 0 && originalParentIndex < originalParent.get_n_children()) {
                        originalParent.insert_child_at_index(icon, originalParentIndex);
                    } else {
                        originalParent.add_child(icon);
                    }
                } catch (e) {
                    // ignore
                }
                originalParent = null;
            }
            // always restore icon reactivity, regardless of reparent success
            if (icon) {
                try {
                    icon.reactive = wasReactive;
                } catch (e) {
                    // ignore
                }
            }
        } catch (e) { /* ignore */ }
    }

    step();
    syncPositionToPlaceholder();

    const handle = {
        isActive: true,
        stop() {
            // If we haven't completed one bounce yet, mark that we should stop after the first completes
            if (!hasCompletedOneBounce) {
                shouldStop = true;
                return;
            }
            // We've completed at least one bounce, so stop immediately
            running = false;
            handle.isActive = false;
            try { target.remove_all_transitions(); } catch (e) { /* ignore */ }
            try {
                target.ease({
                    translation_y: 0,
                    scale_y: 1.0,
                    duration: 120,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => { cleanup(); }
                });
            } catch (e) { cleanup(); }
        }
    };

    return handle;
}
