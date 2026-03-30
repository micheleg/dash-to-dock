import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert/strict';

import {
    GLib,
    Meta,
    Shell,
    clearAllTimeouts,
    fireTimeout,
    getPendingTimeouts,
    getTracker,
    resetTracker,
} from './mocks/gi.js';
import {Docking, Utils} from './mocks/imports.js';
import {
    createWindowActor,
    createMetaWindow,
    createTargetBox,
    createDefaultTargetBox,
} from './helpers.js';

// -- GJS globals (must exist before intellihide.js module evaluation) --

const _signalKey = Symbol('_signals');
let _nextSignalId = 1;

globalThis.imports = {
    signals: {
        addSignalMethods(proto) {
            proto.connect = function (name, callback) {
                if (!this[_signalKey])
                    this[_signalKey] = new Map();
                const id = _nextSignalId++;
                this[_signalKey].set(id, {name, callback});
                return id;
            };
            proto.disconnect = function (id) {
                this[_signalKey]?.delete(id);
            };
            proto.emit = function (name, ...args) {
                if (!this[_signalKey])
                    return;
                for (const [, entry] of this[_signalKey]) {
                    if (entry.name === name)
                        entry.callback(...args);
                }
            };
        },
    },
};

globalThis.global = {
    display: {
        connect: () => 0,
        disconnect: () => {},
        get_focus_window: () => null,
    },
    get_window_actors: () => [],
    workspace_manager: {
        get_active_workspace_index: () => 0,
    },
    backend: {
        get_monitor_manager: () => ({connect: () => 0, disconnect: () => {}}),
    },
};

globalThis.logError = () => {};
globalThis.log = () => {};

// -- Mock the GJS dependency modules --

mock.module('../dependencies/gi.js', {
    namedExports: {GLib, Meta, Shell},
});

mock.module('../imports.js', {
    namedExports: {Docking, Utils},
});

// -- Import module under test --

const {Intellihide} = await import('../intellihide.js');

// -- Helpers --

function createIntellihide(monitorIndex = 0) {
    const ih = new Intellihide(monitorIndex);
    ih.updateTargetBox(createDefaultTargetBox());
    return ih;
}

// -- Tests --

describe('Intellihide', () => {
    let ih;

    beforeEach(() => {
        clearAllTimeouts();
        resetTracker();
        global.get_window_actors = () => [];
        global.display.get_focus_window = () => null;
        global.workspace_manager.get_active_workspace_index = () => 0;
        Docking.DockManager.settings.intellihideMode = 0;
        getTracker().focus_app = null;
        getTracker().get_window_app = () => null;
    });

    afterEach(() => {
        ih?.destroy();
        ih = null;
        clearAllTimeouts();
    });

    // ---------------------------------------------------------------
    // Bug fix: _windowCreated null compositor private
    // ---------------------------------------------------------------

    describe('_windowCreated null safety', () => {
        it('does not crash when compositor private is null', () => {
            ih = createIntellihide();
            ih.enable();
            clearAllTimeouts();

            const metaWindow = createMetaWindow();
            metaWindow.get_compositor_private = () => null;

            assert.doesNotThrow(() => {
                ih._windowCreated(global.display, metaWindow);
            });
        });

        it('still runs overlap check when compositor private is null', () => {
            ih = createIntellihide();
            ih.enable();
            clearAllTimeouts();

            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
            });
            global.get_window_actors = () => [actor];

            const metaWindow = createMetaWindow();
            metaWindow.get_compositor_private = () => null;

            ih._windowCreated(global.display, metaWindow);

            assert.equal(ih.getOverlapStatus(), true,
                '_doCheckOverlap should still run and detect existing windows');
        });

        it('tracks window when compositor private is valid', () => {
            ih = createIntellihide();
            ih.enable();
            clearAllTimeouts();

            const actor = createWindowActor();
            const metaWindow = actor.get_meta_window();

            ih._windowCreated(global.display, metaWindow);

            assert.equal(ih._trackedWindows.has(actor), true);
        });
    });

    // ---------------------------------------------------------------
    // Bug fix: deferred re-check in enable()
    // ---------------------------------------------------------------

    describe('deferred re-check', () => {
        it('schedules a deferred timeout on enable()', () => {
            ih = createIntellihide();
            ih.enable();

            assert.notEqual(ih._deferredCheckId, 0);
            assert.ok(getPendingTimeouts().has(ih._deferredCheckId));
        });

        it('picks up windows missed during initial scan', () => {
            ih = createIntellihide();

            const actorNotReady = {
                get_meta_window: () => null,
                connect: () => 0,
                disconnect: () => {},
            };
            global.get_window_actors = () => [actorNotReady];

            ih.enable();
            assert.equal(ih._trackedWindows.has(actorNotReady), false,
                'unready window should not be tracked');
            assert.equal(ih.getOverlapStatus(), false);

            // XWayland window becomes ready
            const readyMeta = createMetaWindow({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
            });
            actorNotReady.get_meta_window = () => readyMeta;

            fireTimeout(ih._deferredCheckId);

            assert.equal(ih._trackedWindows.has(actorNotReady), true,
                'window should be tracked after deferred check');
            assert.equal(ih.getOverlapStatus(), true,
                'overlap should be detected after deferred check');
        });

        it('does not double-track already-tracked windows', () => {
            ih = createIntellihide();

            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
            });
            global.get_window_actors = () => [actor];

            ih.enable();
            const signalId = ih._trackedWindows.get(actor);

            fireTimeout(ih._deferredCheckId);

            assert.equal(ih._trackedWindows.get(actor), signalId,
                'signal ID should be unchanged');
        });

        it('cancels deferred check on disable()', () => {
            ih = createIntellihide();
            ih.enable();

            const deferredId = ih._deferredCheckId;
            ih.disable();

            assert.equal(ih._deferredCheckId, 0);
            assert.equal(getPendingTimeouts().has(deferredId), false);
        });

        it('cancels deferred check on destroy()', () => {
            ih = createIntellihide();
            ih.enable();

            const deferredId = ih._deferredCheckId;
            ih.destroy();
            ih = null;

            assert.equal(getPendingTimeouts().has(deferredId), false);
        });

        it('resets deferredCheckId to 0 when timeout fires', () => {
            ih = createIntellihide();
            ih.enable();

            fireTimeout(ih._deferredCheckId);

            assert.equal(ih._deferredCheckId, 0);
        });
    });

    // ---------------------------------------------------------------
    // XWayland startup race (the actual bug scenario)
    // ---------------------------------------------------------------

    describe('XWayland startup race', () => {
        it('detects overlap after XWayland window becomes ready', () => {
            ih = createIntellihide();

            const xwaylandActor = {
                get_meta_window: () => null,
                connect: () => 0,
                disconnect: () => {},
            };
            global.get_window_actors = () => [xwaylandActor];

            ih.enable();
            assert.equal(ih.getOverlapStatus(), false);
            assert.equal(ih._trackedWindows.size, 0);

            const meta = createMetaWindow({
                rect: {x: 0, y: 800, width: 1920, height: 280},
                monitor: 0,
            });
            xwaylandActor.get_meta_window = () => meta;

            fireTimeout(ih._deferredCheckId);

            assert.equal(ih.getOverlapStatus(), true);
            assert.equal(ih._trackedWindows.has(xwaylandActor), true);
        });
    });

    // ---------------------------------------------------------------
    // Core overlap detection
    // ---------------------------------------------------------------

    describe('overlap detection', () => {
        it('detects overlap when window covers dock area', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih.enable();

            assert.equal(ih.getOverlapStatus(), true);
        });

        it('no overlap when window is above dock area', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 500},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih.enable();

            assert.equal(ih.getOverlapStatus(), false);
        });

        it('no overlap when window is on different monitor', () => {
            ih = createIntellihide(0);
            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 1,
            });
            global.get_window_actors = () => [actor];

            ih.enable();

            assert.equal(ih.getOverlapStatus(), false);
        });

        it('detects overlap when window edge touches dock', () => {
            ih = createIntellihide();
            // Window bottom at y=1032, dock top at y=1032
            const actor = createWindowActor({
                rect: {x: 0, y: 500, width: 1920, height: 532},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih.enable();

            assert.equal(ih.getOverlapStatus(), true);
        });

        it('no overlap with empty window list', () => {
            ih = createIntellihide();
            global.get_window_actors = () => [];

            ih.enable();

            assert.equal(ih.getOverlapStatus(), false);
        });
    });

    // ---------------------------------------------------------------
    // Window type filtering (_handledWindow)
    // ---------------------------------------------------------------

    describe('window type filtering', () => {
        it('handles NORMAL window type', () => {
            ih = createIntellihide();
            const actor = createWindowActor({windowType: Meta.WindowType.NORMAL});
            assert.equal(ih._handledWindow(actor), true);
        });

        it('handles DIALOG window type', () => {
            ih = createIntellihide();
            const actor = createWindowActor({windowType: Meta.WindowType.DIALOG});
            assert.equal(ih._handledWindow(actor), true);
        });

        it('handles DOCK window type', () => {
            ih = createIntellihide();
            const actor = createWindowActor({windowType: Meta.WindowType.DOCK});
            assert.equal(ih._handledWindow(actor), true);
        });

        it('rejects DESKTOP window type', () => {
            ih = createIntellihide();
            const actor = createWindowActor({windowType: Meta.WindowType.DESKTOP});
            assert.equal(ih._handledWindow(actor), false);
        });

        it('rejects TOOLTIP window type', () => {
            ih = createIntellihide();
            const actor = createWindowActor({windowType: Meta.WindowType.TOOLTIP});
            assert.equal(ih._handledWindow(actor), false);
        });

        it('rejects actor with null meta window', () => {
            ih = createIntellihide();
            const actor = {get_meta_window: () => null};
            assert.equal(ih._handledWindow(actor), false);
        });

        it('excludes DING desktop icons extension', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                gtkAppId: 'com.rastersoft.ding',
                skipTaskbar: true,
            });
            assert.equal(ih._handledWindow(actor), false);
        });

        it('does not exclude DING app if not skip-taskbar', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                gtkAppId: 'com.rastersoft.ding',
                skipTaskbar: false,
            });
            assert.equal(ih._handledWindow(actor), true);
        });

        it('always includes DropDownTerminal windows', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                wmClass: 'DropDownTerminalWindow',
                windowType: Meta.WindowType.POPUP_MENU,
            });
            assert.equal(ih._handledWindow(actor), true);
        });
    });

    // ---------------------------------------------------------------
    // Status change signals
    // ---------------------------------------------------------------

    describe('status-changed signal', () => {
        it('emits on overlap state change', () => {
            ih = createIntellihide();
            const events = [];
            ih.connect('status-changed', status => events.push(status));

            global.get_window_actors = () => [];
            ih.enable();
            clearAllTimeouts();

            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];
            ih._doCheckOverlap();

            assert.ok(events.includes(1), 'should emit TRUE (1)');
        });

        it('does not emit when status is unchanged', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih.enable();
            clearAllTimeouts();

            const events = [];
            ih.connect('status-changed', status => events.push(status));

            ih._doCheckOverlap();

            assert.equal(events.length, 0);
        });
    });

    // ---------------------------------------------------------------
    // Enable / Disable lifecycle
    // ---------------------------------------------------------------

    describe('enable/disable lifecycle', () => {
        it('enable sets _isEnabled to true', () => {
            ih = createIntellihide();
            assert.equal(ih._isEnabled, false);
            ih.enable();
            assert.equal(ih._isEnabled, true);
        });

        it('disable sets _isEnabled to false', () => {
            ih = createIntellihide();
            ih.enable();
            ih.disable();
            assert.equal(ih._isEnabled, false);
        });

        it('enable tracks existing window actors', () => {
            ih = createIntellihide();
            const actor = createWindowActor();
            global.get_window_actors = () => [actor];

            ih.enable();

            assert.equal(ih._trackedWindows.has(actor), true);
        });

        it('disable clears tracked windows', () => {
            ih = createIntellihide();
            const actor = createWindowActor();
            global.get_window_actors = () => [actor];

            ih.enable();
            assert.equal(ih._trackedWindows.size, 1);
            ih.disable();
            assert.equal(ih._trackedWindows.size, 0);
        });

        it('disable cancels throttle timeout', () => {
            ih = createIntellihide();
            ih.enable();
            clearAllTimeouts();

            ih._checkOverlap();
            assert.notEqual(ih._checkOverlapTimeoutId, 0);

            ih.disable();
            assert.equal(ih._checkOverlapTimeoutId, 0);
        });

        it('_checkOverlap is no-op when disabled', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih._checkOverlap();

            assert.equal(ih.getOverlapStatus(), false);
        });

        it('_checkOverlap is no-op when targetBox is null', () => {
            const ih2 = new Intellihide(0);
            ih2.enable();
            clearAllTimeouts();

            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih2._checkOverlap();

            assert.equal(ih2.getOverlapStatus(), false);
            ih2.destroy();
        });
    });

    // ---------------------------------------------------------------
    // Throttling
    // ---------------------------------------------------------------

    describe('_checkOverlap throttling', () => {
        it('first call runs immediately', () => {
            ih = createIntellihide();
            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];
            ih.enable();
            clearAllTimeouts();

            ih._status = -1; // UNDEFINED
            ih._checkOverlap();

            assert.equal(ih.getOverlapStatus(), true);
        });

        it('second call within throttle window is deferred', () => {
            ih = createIntellihide();
            global.get_window_actors = () => [];
            ih.enable();
            clearAllTimeouts();

            ih._checkOverlap();
            assert.notEqual(ih._checkOverlapTimeoutId, 0);

            ih._checkOverlap();
            assert.equal(ih._checkOverlapTimeoutContinue, true);
        });

        it('throttle timer cleans up after no more calls', () => {
            ih = createIntellihide();
            global.get_window_actors = () => [];
            ih.enable();
            clearAllTimeouts();

            ih._checkOverlap();
            const timeoutId = ih._checkOverlapTimeoutId;

            ih._checkOverlapTimeoutContinue = false;
            fireTimeout(timeoutId);

            assert.equal(ih._checkOverlapTimeoutId, 0);
        });
    });

    // ---------------------------------------------------------------
    // updateTargetBox / forceUpdate
    // ---------------------------------------------------------------

    describe('updateTargetBox', () => {
        it('stores the target box', () => {
            ih = new Intellihide(0);
            const box = createTargetBox(100, 200, 300, 50);
            ih.updateTargetBox(box);
            assert.equal(ih._targetBox, box);
        });

        it('triggers overlap check', () => {
            ih = createIntellihide();
            ih.enable();
            clearAllTimeouts();

            const actor = createWindowActor({
                rect: {x: 0, y: 0, width: 1920, height: 1080},
                monitor: 0,
            });
            global.get_window_actors = () => [actor];

            ih.updateTargetBox(createDefaultTargetBox());

            assert.equal(ih.getOverlapStatus(), true);
        });
    });

    describe('forceUpdate', () => {
        it('resets status to UNDEFINED before checking', () => {
            ih = createIntellihide();
            global.get_window_actors = () => [];
            ih.enable();
            clearAllTimeouts();

            const events = [];
            ih.connect('status-changed', status => events.push(status));

            ih._status = -1; // UNDEFINED
            ih.forceUpdate();

            assert.deepEqual(events, [0]);
        });
    });

    // ---------------------------------------------------------------
    // Window tracking
    // ---------------------------------------------------------------

    describe('window tracking', () => {
        it('_removeWindowSignals disconnects and untracks', () => {
            ih = createIntellihide();
            const actor = createWindowActor();
            global.get_window_actors = () => [actor];

            ih.enable();
            assert.equal(ih._trackedWindows.has(actor), true);

            ih._removeWindowSignals(actor);
            assert.equal(ih._trackedWindows.has(actor), false);
        });

        it('_removeWindowSignals is safe for untracked actor', () => {
            ih = createIntellihide();
            const actor = createWindowActor();

            assert.doesNotThrow(() => ih._removeWindowSignals(actor));
        });
    });

    // ---------------------------------------------------------------
    // Intellihide filter (workspace/visibility)
    // ---------------------------------------------------------------

    describe('_intellihideFilterInteresting', () => {
        it('includes window on current workspace that is showing', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            const actor = createWindowActor({workspace: 0, showing: true});
            assert.equal(ih._intellihideFilterInteresting(actor), true);
        });

        it('excludes window on different workspace', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            const actor = createWindowActor({workspace: 1, showing: true});
            assert.equal(ih._intellihideFilterInteresting(actor), false);
        });

        it('excludes window not showing on workspace', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            const actor = createWindowActor({workspace: 0, showing: false});
            assert.equal(ih._intellihideFilterInteresting(actor), false);
        });
    });

    // ---------------------------------------------------------------
    // Intellihide modes
    // ---------------------------------------------------------------

    describe('intellihide modes', () => {
        it('MAXIMIZED_WINDOWS mode excludes non-maximized', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            Docking.DockManager.settings.intellihideMode = 2;

            const actor = createWindowActor({workspace: 0, showing: true});
            assert.equal(ih._intellihideFilterInteresting(actor), false);
        });

        it('MAXIMIZED_WINDOWS mode includes maximized', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            Docking.DockManager.settings.intellihideMode = 2;

            const actor = createWindowActor({
                workspace: 0,
                showing: true,
                maximizedVertically: true,
                maximizedHorizontally: true,
            });
            assert.equal(ih._intellihideFilterInteresting(actor), true);
        });

        it('MAXIMIZED_WINDOWS mode includes fullscreen', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            Docking.DockManager.settings.intellihideMode = 2;

            const actor = createWindowActor({
                workspace: 0,
                showing: true,
                fullscreen: true,
            });
            assert.equal(ih._intellihideFilterInteresting(actor), true);
        });

        it('ALWAYS_ON_TOP mode excludes non-fullscreen', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            Docking.DockManager.settings.intellihideMode = 3;
            global.display.focusWindow = {fullscreen: false};

            const actor = createWindowActor({workspace: 0, showing: true});
            assert.equal(ih._intellihideFilterInteresting(actor), false);

            delete global.display.focusWindow;
        });

        it('ALWAYS_ON_TOP mode includes when focus is fullscreen', () => {
            ih = createIntellihide();
            ih._focusApp = 'app1';
            Docking.DockManager.settings.intellihideMode = 3;
            global.display.focusWindow = {fullscreen: true};

            const actor = createWindowActor({workspace: 0, showing: true});
            assert.equal(ih._intellihideFilterInteresting(actor), true);

            delete global.display.focusWindow;
        });
    });
});
