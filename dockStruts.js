// Reserved-extent export for dash-to-dock.
//
// dash-to-dock publishes the space its dock occupies on each monitor so other
// extensions can avoid placing their own UI underneath it. The case that
// motivates this is a BOTTOM dock in auto-hide/overlay mode: it claims no
// mutter strut (so the work area does not shrink for it), yet it slides out
// over the bottom of the work area, so a pill or OSD placed at the work
// area's bottom edge ends up hidden behind the dock.
//
// While dash-to-dock is enabled, the read-only `DashToDockStruts` view is
// published as `Main.layoutManager.dashToDockStruts` (a property of the
// mutable LayoutManager singleton, not of the frozen `Main` module namespace)
// and nulled again on disable. Consumers:
//
//   - check for its presence;
//   - read `monitors`, keyed by monitor index, where each entry is
//     `{side, x, y, width, height, affectsStruts}`;
//   - connect to `updated`, which carries the changed monitor index (or -1
//     for all monitors), and rely on `connectObject()` to auto-disconnect
//     their handlers on `destroy`, since the type is registered with the
//     shell's SignalTracker as destroyable.
//
// `side` is the raw `St.Side` enum, never a string, and `affectsStruts` says
// whether the dock claims a real mutter strut (dock-fixed mode). A consumer
// should reserve the extent only when `affectsStruts` is false; otherwise the
// work area already excludes it.
//
// The published extent is the dock's full-size rectangle - where it would be
// when fully shown - regardless of whether it is currently auto-hidden, so
// consumers reserve the space even while the dock is hidden and are never
// covered when it slides out. A dock-fixed dock already claims a mutter
// strut, so its extent coincides with (or sits inside) the work-area edge;
// reserving it is harmless either way.

import GObject from 'gi://GObject';

import {registerDestroyableType} from 'resource:///org/gnome/shell/misc/signalTracker.js';

import {Main} from './dependencies/shell/ui.js';

/**
 * Read-only view of the space dash-to-dock reserves on each monitor.
 *
 * Published as `Main.layoutManager.dashToDockStruts` while the extension is
 * enabled. It is backed by a private {@link StrutsManager} owned by the
 * DockManager; consumers only read `monitors` and connect to `updated` and
 * `destroy`.
 */
export const DashToDockStruts = GObject.registerClass({
    Signals: {
        'updated': {param_types: [GObject.TYPE_INT]},
        'destroy': {},
    },
}, class DashToDockStruts extends GObject.Object {
    #manager;

    constructor(manager) {
        super();
        this.#manager = manager;
    }

    /**
     * The per-monitor reserved extents, keyed by monitor index.
     *
     * Each entry is `{side, x, y, width, height, affectsStruts}` in global
     * coordinates. The object is frozen and replaced whenever it changes.
     *
     * @type {Readonly<Record<number, object>>}
     */
    get monitors() {
        return this.#manager.monitors;
    }
});
registerDestroyableType(DashToDockStruts);

export class StrutsManager {
    #monitors = new Map();
    #frozenMonitors = Object.freeze({});
    #struts = new DashToDockStruts(this);

    constructor() {
        Main.layoutManager.dashToDockStruts = this.#struts;
    }

    /** The snapshot exposed through `this.struts.monitors`. */
    get monitors() {
        return this.#frozenMonitors;
    }

    /**
     * Set or clear the reserved extent for the dock on a monitor.
     *
     * The extent is the dock's full-size rectangle, independent of its
     * current slide offset, so callers may push it on every geometry update:
     * only genuine changes are published.
     *
     * @param {number} monitorIndex - the monitor the dock is on.
     * @param {object|null} extent - `{side, x, y, width, height,
     *     affectsStruts}` in global coordinates, or `null` to drop the entry.
     */
    setMonitorExtent(monitorIndex, extent) {
        const previous = this.#monitors.get(monitorIndex) ?? null;
        const unchanged = previous !== null && extent !== null &&
            previous.side === extent.side &&
            previous.x === extent.x && previous.y === extent.y &&
            previous.width === extent.width && previous.height === extent.height &&
            previous.affectsStruts === extent.affectsStruts;

        if (unchanged)
            return;

        if (extent === null)
            this.#monitors.delete(monitorIndex);
        else
            this.#monitors.set(monitorIndex, extent);

        this.#publish(monitorIndex);
    }

    clear() {
        if (this.#monitors.size === 0)
            return;

        this.#monitors.clear();
        this.#publish(-1);
    }

    destroy() {
        this.clear();
        if (Main.layoutManager.dashToDockStruts === this.#struts)
            delete Main.layoutManager.dashToDockStruts;

        this.#struts.emit('destroy');
    }

    /**
     * Rebuild the frozen snapshot and notify.
     *
     * @param {number} monitorIndex - the changed monitor, or -1 for all.
     */
    #publish(monitorIndex) {
        this.#frozenMonitors = Object.freeze(Object.fromEntries(this.#monitors));
        this.#struts.emit('updated', monitorIndex);
    }
}
