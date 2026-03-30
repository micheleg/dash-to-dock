// Test helpers for creating mock GNOME Shell objects.

import {Meta} from './mocks/gi.js';

let _nextSignalId = 1000;

function createSignalMixin() {
    const signals = new Map();
    return {
        _signals: signals,
        connect(name, callback) {
            const id = _nextSignalId++;
            signals.set(id, {name, callback});
            return id;
        },
        disconnect(id) {
            signals.delete(id);
        },
        _emit(name, ...args) {
            for (const [, entry] of signals) {
                if (entry.name === name)
                    entry.callback(...args);
            }
        },
    };
}

export function createMetaWindow(opts = {}) {
    return {
        get_compositor_private: () => opts.actor ?? null,
        get_monitor: () => opts.monitor ?? 0,
        get_frame_rect: () => opts.rect ?? {x: 0, y: 0, width: 100, height: 100},
        get_window_type: () => opts.windowType ?? Meta.WindowType.NORMAL,
        get_workspace: () => ({index: () => opts.workspace ?? 0}),
        showing_on_its_workspace: () => opts.showing ?? true,
        get_gtk_application_id: () => opts.gtkAppId ?? null,
        get_wm_class: () => opts.wmClass ?? 'SomeApp',
        is_skip_taskbar: () => opts.skipTaskbar ?? false,
        is_above: () => opts.above ?? false,
        maximized_vertically: opts.maximizedVertically ?? false,
        maximized_horizontally: opts.maximizedHorizontally ?? false,
        fullscreen: opts.fullscreen ?? false,
    };
}

export function createWindowActor(opts = {}) {
    const mixin = createSignalMixin();
    const metaWindow = opts.metaWindow ?? createMetaWindow(opts);
    // Wire up the circular reference: metaWindow.get_compositor_private → actor
    const actor = {
        ...mixin,
        get_meta_window: () => metaWindow,
    };
    // Patch metaWindow to return this actor
    metaWindow.get_compositor_private = () => actor;
    return actor;
}

export function createTargetBox(x, y, width, height) {
    return {
        x1: x,
        y1: y,
        x2: x + width,
        y2: y + height,
    };
}

// Dock target box at bottom of a 1920x1080 screen, 48px tall
export function createDefaultTargetBox() {
    return createTargetBox(0, 1032, 1920, 48);
}
