// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    GLib,
    St,
} from './dependencies/gi.js';

import {
    Layout,
    Main,
} from './dependencies/shell/ui.js';

import {
    Signals,
} from './dependencies/shell/misc.js';

import * as Utils from './utils.js';

export class PressureBarrier extends Layout.PressureBarrier {
    destroy() {
        this._reset();
        super.destroy();
    }

    reset() {
        this._reset();
        this._isTriggered = false;
    }
}

export class FullscreenPressureBarrier extends PressureBarrier {
    static PRESSURE_MAX_GAP = 250;

    constructor(threshold, timeout, actionMode, duration) {
        super(threshold, Math.max(timeout, duration), actionMode);
        this._duration = duration;
    }

    _reset() {
        super._reset();

        if (this._triggerTimeoutId) {
            GLib.source_remove(this._triggerTimeoutId);
            delete this._triggerTimeoutId;
        }

        this._pressureStart = null;
        this._lastPressureHit = null;
    }

    _onBarrierHit(barrier, event) {
        const distance = this._getDistanceAcrossBarrier(barrier, event);
        if (!this._isTriggered && (this._actionMode & Main.actionMode) &&
            distance > 0 &&
            (distance >= this._threshold ||
                distance >= this._getDistanceAlongBarrier(barrier, event))) {
            if (this._lastPressureHit !== null &&
                event.time - this._lastPressureHit >
                FullscreenPressureBarrier.PRESSURE_MAX_GAP)
                this._reset();

            this._pressureStart ??= event.time;
            this._lastPressureHit = event.time;
        }

        super._onBarrierHit(barrier, event);
    }

    _trigger() {
        if (this._pressureStart === null ||
            this._lastPressureHit - this._pressureStart < this._duration) {
            this._scheduleTrigger();
            return;
        }

        super._trigger();
    }

    _scheduleTrigger() {
        if (this._triggerTimeoutId || this._pressureStart === null)
            return;

        const elapsed = this._lastPressureHit - this._pressureStart;
        const remaining = this._duration - elapsed;

        if (remaining <= 0)
            return;

        // The shell only reports motion events, so a push that is held still
        // does not reach us again: re-check once the hold is long enough.
        this._triggerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            remaining, () => {
                delete this._triggerTimeoutId;

                if (this._pressureStart !== null)
                    super._trigger();

                return GLib.SOURCE_REMOVE;
            });
    }
}

export class DwellingBarrier extends Signals.EventEmitter {
    static DOCK_DWELL_CHECK_INTERVAL = 100;

    constructor(dock, timeout) {
        super();

        this._dock = dock;
        this._timeout = timeout;

        this._dwelling = false;
        this._userTime = 0;

        this._cursorTracker = Utils.getCursorTracker();
        this._cursorTracker.connectObject('position-invalidated',
            () => this._checkDwellLater(...global.get_pointer()), this);
    }

    destroy() {
        this._cancelDwell();

        if (this._checkId) {
            GLib.source_remove(this._checkId);
            delete this._checkId;
        }

        this._cursorTracker.disconnectObject(this);
        delete this._cursorTracker;

        delete this._dock;
    }

    _checkDwellLater(x, y) {
        if (this._checkId)
            return;

        this._checkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            DwellingBarrier.DOCK_DWELL_CHECK_INTERVAL, () => {
                this._checkDwellNow(x, y);
                delete this._checkId;
                return GLib.SOURCE_REMOVE;
            });
    }

    _checkDwellNow(x, y) {
        const {monitor, position} = this._dock;
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        let shouldDwell;

        // Check for the correct screen edge, extending the sensitive area to
        // the whole workarea, minus 1 px to avoid conflicting with other
        // active corners.
        if (position === St.Side.LEFT) {
            shouldDwell = (x === monitor.x) && (y > workArea.y) &&
                (y < workArea.y + workArea.height);
        } else if (position === St.Side.RIGHT) {
            shouldDwell = (x === monitor.x + monitor.width - 1) &&
                (y > workArea.y) && (y < workArea.y + workArea.height);
        } else if (position === St.Side.TOP) {
            shouldDwell = (y === monitor.y) && (x > workArea.x) &&
                (x < workArea.x + workArea.width);
        } else if (position === St.Side.BOTTOM) {
            shouldDwell = (y === monitor.y + monitor.height - 1) &&
                (x > workArea.x) && (x < workArea.x + workArea.width);
        }

        if (shouldDwell) {
            // Set up the timeout only when the dock is not hovered already;
            // the _dwelling flag ensures that we only try to fire it once,
            // until the pointer leaves the edge and comes back.
            if (!this._dwelling && !this._dock.isHovered &&
                !this._dwellTimeoutId) {
                // Save the interaction timestamp so we can detect user input
                const {focusWindow} = global.display;
                this._userTime = focusWindow?.user_time ?? 0;

                this._dwellTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                    this._timeout, () => {
                        delete this._dwellTimeoutId;
                        this._onDwellTimeout();
                        return GLib.SOURCE_REMOVE;
                    });
                GLib.Source.set_name_by_id(this._dwellTimeoutId,
                    '[dash-to-dock] DwellingBarrier');
            }
            this._dwelling = true;
        } else {
            this._cancelDwell();
            this._dwelling = false;
        }
    }

    _cancelDwell() {
        if (this._dwellTimeoutId) {
            GLib.source_remove(this._dwellTimeoutId);
            delete this._dwellTimeoutId;
        }
    }

    _onDwellTimeout() {
        // We don't want to show the dock when a modal dialog is up, so we
        // check the modal count for that. When we are in the overview we
        // have to take the overview's modal push into account.
        if (Main.modalCount > (Main.overview.visible ? 1 : 0))
            return;

        // If the user interacted with the focus window since we started
        // dwelling (by clicking or typing), don't show the dock
        const {focusWindow} = global.display;
        const currentUserTime = focusWindow?.user_time ?? 0;
        if (currentUserTime !== this._userTime)
            return;

        this.emit('trigger');
    }
}
