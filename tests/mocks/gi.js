// Mock for dependencies/gi.js
// Provides controllable stubs for GLib, Meta, and Shell GI bindings.

const _pendingTimeouts = new Map();
let _nextTimeoutId = 1;

export const GLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_CONTINUE: true,
    SOURCE_REMOVE: false,
    timeout_add(priority, interval, callback) {
        const id = _nextTimeoutId++;
        _pendingTimeouts.set(id, {interval, callback});
        return id;
    },
    source_remove(id) {
        _pendingTimeouts.delete(id);
    },
};

// Test helpers for controlling GLib timeouts
export function getPendingTimeouts() {
    return _pendingTimeouts;
}

export function fireTimeout(id) {
    const entry = _pendingTimeouts.get(id);
    if (!entry)
        return undefined;
    const result = entry.callback();
    if (result === GLib.SOURCE_REMOVE || result === false)
        _pendingTimeouts.delete(id);
    return result;
}

export function clearAllTimeouts() {
    _pendingTimeouts.clear();
    _nextTimeoutId = 1;
}

export const Meta = {
    WindowType: {
        NORMAL: 0,
        DESKTOP: 1,
        DOCK: 2,
        DIALOG: 3,
        MODAL_DIALOG: 4,
        TOOLBAR: 5,
        MENU: 6,
        UTILITY: 7,
        SPLASHSCREEN: 8,
        DROPDOWN_MENU: 9,
        POPUP_MENU: 10,
        TOOLTIP: 11,
        NOTIFICATION: 12,
        COMBO: 13,
        DND: 14,
        OVERRIDE_OTHER: 15,
    },
};

let _trackerInstance = null;

export const Shell = {
    WindowTracker: {
        get_default() {
            if (!_trackerInstance) {
                _trackerInstance = {
                    focus_app: null,
                    get_window_app: () => null,
                    connect: () => 0,
                    disconnect: () => {},
                };
            }
            return _trackerInstance;
        },
    },
};

export function getTracker() {
    return Shell.WindowTracker.get_default();
}

export function resetTracker() {
    _trackerInstance = null;
}
