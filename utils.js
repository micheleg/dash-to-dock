import {
    Clutter,
    GLib,
    Gio,
    GObject,
    Meta,
    Shell,
    St,
} from './dependencies/gi.js';

import {
    Docking,
} from './imports.js';

const {_gi: Gi} = imports;

export const SignalsHandlerFlags = Object.freeze({
    NONE: 0,
    CONNECT_AFTER: 1,
});

const GENERIC_KEY = Symbol('generic');

/**
 * Simplify global signals and function injections handling
 * abstract class
 */
const BasicHandler = class DashToDockBasicHandler {
    static get genericKey() {
        return GENERIC_KEY;
    }

    constructor(parentObject) {
        this._storage = Object.create(null);

        if (parentObject) {
            if (!(parentObject.connect instanceof Function))
                throw new TypeError('Not a valid parent object');

            if (!(parentObject instanceof GObject.Object) ||
                GObject.signal_lookup('destroy', parentObject.constructor.$gtype)) {
                this._parentObject = parentObject;
                this._destroyId = parentObject.connect('destroy', () => this.destroy());
            }
        }
    }

    add(...args) {
        // Convert arguments object to array, concatenate with generic
        // Call addWithLabel with ags as if they were passed arguments
        this.addWithLabel(GENERIC_KEY, ...args);
    }

    clear() {
        Object.getOwnPropertySymbols(this._storage).forEach(label =>
            this.removeWithLabel(label));
    }

    destroy() {
        this._parentObject?.disconnect(this._destroyId);
        this._parentObject = null;

        this.clear();
    }

    block() {
        Object.getOwnPropertySymbols(this._storage).forEach(label =>
            this.blockWithLabel(label));
    }

    unblock() {
        Object.getOwnPropertySymbols(this._storage).forEach(label =>
            this.unblockWithLabel(label));
    }

    addWithLabel(label, ...args) {
        if (typeof label !== 'symbol')
            throw new Error(`Invalid label ${label}, must be a symbol`);

        let argsArray = [...args];
        if (argsArray.every(arg => !Array.isArray(arg)))
            argsArray = [argsArray];

        if (this._storage[label] === undefined)
            this._storage[label] = [];

        // Skip first element of the arguments
        for (const argArray of argsArray) {
            if (argArray.length < 3)
                throw new Error('Unexpected number of arguments');
            const item = this._storage[label];
            try {
                item.push(this._create(...argArray));
            } catch (e) {
                logError(e);
            }
        }
    }

    removeWithLabel(label) {
        this._storage[label]?.reverse().forEach(item => this._remove(item));
        delete this._storage[label];
    }

    blockWithLabel(label) {
        (this._storage[label] || []).forEach(item => this._block(item));
    }

    unblockWithLabel(label) {
        (this._storage[label] || []).forEach(item => this._unblock(item));
    }

    _removeByItem(item) {
        Object.getOwnPropertySymbols(this._storage).forEach(label =>
            (this._storage[label] = this._storage[label].filter(it => {
                if (!this._itemsEqual(it, item))
                    return true;
                this._remove(item);
                return false;
            })));
    }

    // Virtual methods to be implemented by subclass

    /**
     * Create single element to be stored in the storage structure
     *
     * @param _object
     * @param _element
     * @param _callback
     */
    _create(_object, _element, _callback) {
        throw new GObject.NotImplementedError(`_create in ${this.constructor.name}`);
    }

    /**
     * Correctly delete single element
     *
     * @param _item
     */
    _remove(_item) {
        throw new GObject.NotImplementedError(`_remove in ${this.constructor.name}`);
    }

    /**
     * Block single element
     *
     * @param _item
     */
    _block(_item) {
        throw new GObject.NotImplementedError(`_block in ${this.constructor.name}`);
    }

    /**
     * Unblock single element
     *
     * @param _item
     */
    _unblock(_item) {
        throw new GObject.NotImplementedError(`_unblock in ${this.constructor.name}`);
    }

    _itemsEqual(itemA, itemB) {
        if (itemA === itemB)
            return true;

        if (itemA.length !== itemB.length)
            return false;

        return itemA.every((_, idx) => itemA[idx] === itemB[idx]);
    }
};

/**
 * Manage global signals
 */
export class GlobalSignalsHandler extends BasicHandler {
    _create(object, event, callback, flags = SignalsHandlerFlags.NONE) {
        if (!object)
            throw new Error('Impossible to connect to an invalid object');

        const after = flags === SignalsHandlerFlags.CONNECT_AFTER;
        const connector = after ? object.connect_after : object.connect;

        if (!connector) {
            throw new Error(`Requested to connect to signal '${event}', ` +
                `but no implementation for 'connect${after ? '_after' : ''}' ` +
                `found in ${object.constructor.name}`);
        }

        const item = [object];
        const isDestroy = event === 'destroy';
        const isParentObject = object === this._parentObject;

        if (isDestroy && !isParentObject) {
            const originalCallback = callback;
            callback = () => {
                this._removeByItem(item);
                originalCallback();
            };
        }
        const id = connector.call(object, event, callback);
        item.push(id);

        if (isDestroy && isParentObject) {
            this._parentObject.disconnect(this._destroyId);
            this._destroyId =
                this._parentObject.connect('destroy', () => this.destroy());
        }

        return item;
    }

    _remove(item) {
        const [object, id] = item;
        object.disconnect(id);
    }

    _block(item) {
        const [object, id] = item;

        if (object instanceof GObject.Object)
            GObject.Object.prototype.block_signal_handler.call(object, id);
    }

    _unblock(item) {
        const [object, id] = item;

        if (object instanceof GObject.Object)
            GObject.Object.prototype.unblock_signal_handler.call(object, id);
    }
}

/**
 * Color manipulation utilities
 */
export class ColorUtils {
    // Darken or brigthen color by a fraction dlum
    // Each rgb value is modified by the same fraction.
    // Return "#rrggbb" string
    static ColorLuminance(r, g, b, dlum) {
        let rgbString = '#';

        rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(r * (1 + dlum), 0), 255)), 2);
        rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(g * (1 + dlum), 0), 255)), 2);
        rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(b * (1 + dlum), 0), 255)), 2);

        return rgbString;
    }

    // Convert decimal to an hexadecimal string adding the desired padding
    static _decimalToHex(d, padding) {
        let hex = d.toString(16);
        while (hex.length < padding)
            hex = `0${hex}`;
        return hex;
    }

    // Convert hsv ([0-1, 0-1, 0-1]) to rgb ([0-255, 0-255, 0-255]).
    // Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
    // here with h = [0,1] instead of [0, 360]
    // Accept either (h,s,v) independently or  {h:h, s:s, v:v} object.
    // Return {r:r, g:g, b:b} object.
    static HSVtoRGB(h, s, v) {
        if (arguments.length === 1)
            ({s, v, h} = h);

        let r, g, b;
        const c = v * s;
        const h1 = h * 6;
        const x = c * (1 - Math.abs(h1 % 2 - 1));
        const m = v - c;

        if (h1 <= 1) {
            r = c + m;
            g = x + m;
            b = m;
        } else if (h1 <= 2) {
            r = x + m;
            g = c + m;
            b = m;
        } else if (h1 <= 3) {
            r = m;
            g = c + m;
            b = x + m;
        } else if (h1 <= 4) {
            r = m;
            g = x + m;
            b = c + m;
        } else if (h1 <= 5) {
            r = x + m;
            g = m;
            b = c + m;
        } else {
            r = c + m;
            g = m;
            b = x + m;
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
    }

    // Convert rgb ([0-255, 0-255, 0-255]) to hsv ([0-1, 0-1, 0-1]).
    // Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
    // here with h = [0,1] instead of [0, 360]
    // Accept either (r,g,b) independently or {r:r, g:g, b:b} object.
    // Return {h:h, s:s, v:v} object.
    static RGBtoHSV(r, g, b) {
        if (arguments.length === 1)
            ({r, g, b} = r);

        let h, s;

        const M = Math.max(r, g, b);
        const m = Math.min(r, g, b);
        const c = M - m;

        if (c === 0)
            h = 0;
        else if (M === r)
            h = ((g - b) / c) % 6;
        else if (M === g)
            h = (b - r) / c + 2;
        else
            h = (r - g) / c + 4;

        h /= 6;
        const v = M / 255;
        if (M !== 0)
            s = c / M;
        else
            s = 0;

        return {
            h,
            s,
            v,
        };
    }
}

/**
 * Manage function injection: both instances and prototype can be overridden
 * and restored
 */
export class InjectionsHandler extends BasicHandler {
    _create(object, name, injectedFunction) {
        const original = object[name];

        if (!(original instanceof Function))
            throw new Error(`Function ${name}() is not available for ${object}`);

        object[name] = function (...args) {
            return injectedFunction.call(this, original, ...args);
        };
        return [object, name, original];
    }

    _remove(item) {
        const [object, name, original] = item;
        object[name] = original;
    }
}

/**
 * Manage vfunction injection: both instances and prototype can be overridden
 * and restored
 */
export class VFuncInjectionsHandler extends BasicHandler {
    _create(prototype, name, injectedFunction) {
        const original = prototype[`vfunc_${name}`];
        if (!(original instanceof Function))
            throw new Error(`Virtual function ${name} is not available for ${prototype}`);
        this._replaceVFunc(prototype, name, injectedFunction);
        return [prototype, name];
    }

    _remove(item) {
        const [prototype, name] = item;
        const originalVFunc = prototype[`vfunc_${name}`];
        try {
            // This may fail if trying to reset to a never-overridden vfunc
            // as gjs doesn't consider it a function, even if it's true that
            // originalVFunc instanceof Function.
            this._replaceVFunc(prototype, name, originalVFunc);
        } catch {
            try {
                this._replaceVFunc(prototype, name, function (...args) {
                    // eslint-disable-next-line no-invalid-this
                    return originalVFunc.call(this, ...args);
                });
            } catch (e) {
                logError(e, `Removing vfunc_${name}`);
            }
        }
    }

    _replaceVFunc(prototype, name, func) {
        if (Gi.gobject_prototype_symbol && Gi.gobject_prototype_symbol in prototype)
            prototype = prototype[Gi.gobject_prototype_symbol];

        return prototype[Gi.hook_up_vfunc_symbol](name, func);
    }
}

/**
 * Manage properties injection: both instances and prototype can be overridden
 * and restored
 */
export class PropertyInjectionsHandler extends BasicHandler {
    constructor(parentObject, params) {
        super(parentObject);
        this._params = params;
    }

    _create(instance, name, injectedPropertyDescriptor) {
        if (!this._params?.allowNewProperty && !(name in instance))
            throw new Error(`Object ${instance} has no '${name}' property`);

        const {prototype} = instance.constructor;
        const originalPropertyDescriptor = Object.getOwnPropertyDescriptor(prototype, name) ??
            Object.getOwnPropertyDescriptor(instance, name);

        Object.defineProperty(instance, name, {
            ...originalPropertyDescriptor,
            ...injectedPropertyDescriptor,
            ...{configurable: true},
        });
        return [instance, name, originalPropertyDescriptor];
    }

    _remove(item) {
        const [instance, name, originalPropertyDescriptor] = item;
        if (originalPropertyDescriptor)
            Object.defineProperty(instance, name, originalPropertyDescriptor);
        else
            delete instance[name];
    }
}

/**
 * Return the actual position reverseing left and right in rtl
 */
export function getPosition() {
    const position = Docking.DockManager.settings.dockPosition;
    if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL) {
        if (position === St.Side.LEFT)
            return St.Side.RIGHT;
        else if (position === St.Side.RIGHT)
            return St.Side.LEFT;
    }
    return position;
}

/**
 * @param cr
 * @param x
 * @param y
 * @param width
 * @param height
 * @param isRoundLeft
 * @param isRoundRight
 * @param stroke
 * @param fill
 */
export function drawRoundedLine(cr, x, y, width, height, isRoundLeft, isRoundRight, stroke, fill) {
    if (height > width) {
        y += Math.floor((height - width) / 2.0);
        height = width;
    }

    height = 2.0 * Math.floor(height / 2.0);

    const leftRadius = isRoundLeft ? height / 2.0 : 0.0;
    const rightRadius = isRoundRight ? height / 2.0 : 0.0;

    cr.moveTo(x + width - rightRadius, y);
    cr.lineTo(x + leftRadius, y);
    if (isRoundLeft)
        cr.arcNegative(x + leftRadius, y + leftRadius, leftRadius, -Math.PI / 2, Math.PI / 2);
    else
        cr.lineTo(x, y + height);
    cr.lineTo(x + width - rightRadius, y + height);
    if (isRoundRight)
        cr.arcNegative(x + width - rightRadius, y + rightRadius, rightRadius, Math.PI / 2, -Math.PI / 2);
    else
        cr.lineTo(x + width, y);
    cr.closePath();

    if (fill) {
        cr.setSource(fill);
        cr.fillPreserve();
    }
    if (stroke)
        cr.setSource(stroke);
    cr.stroke();
}

/**
 * Convert a signal handler with n value parameters (that is, excluding the
 * signal source parameter) to an array of n handlers that are each responsible
 * for receiving one of the n values and calling the original handler with the
 * most up-to-date arguments.
 *
 * @param handler
 */
export function splitHandler(handler) {
    if (handler.length > 30)
        throw new Error('too many parameters');

    const count = handler.length - 1;
    let missingValueBits = (1 << count) - 1;
    const values = Array.from({length: count});
    return values.map((_ignored, i) => {
        const mask = ~(1 << i);
        return (obj, value) => {
            values[i] = value;
            missingValueBits &= mask;
            if (missingValueBits === 0)
                handler(obj, ...values);
        };
    });
}

/**
 * Construct a map of gtk application window object paths to MetaWindows.
 */
export function getWindowsByObjectPath() {
    const windowsByObjectPath = new Map();
    const {workspaceManager} = global;
    const workspaces = [...new Array(workspaceManager.nWorkspaces)].map(
        (_c, i) => workspaceManager.get_workspace_by_index(i));

    workspaces.forEach(ws => {
        ws.list_windows().forEach(w => {
            const path = w.get_gtk_window_object_path();
            if (path)
                windowsByObjectPath.set(path, w);
        });
    });

    return windowsByObjectPath;
}

/**
 * Re-implements shell_app_compare so that can be used to resort running apps
 *
 * @param appA
 * @param appB
 */
export function shellAppCompare(appA, appB) {
    if (appA.state !== appB.state) {
        if (appA.state === Shell.AppState.RUNNING)
            return -1;
        return 1;
    }

    const windowsA = appA.get_windows();
    const windowsB = appB.get_windows();

    const isMinimized = windows => !windows.some(w => w.showing_on_its_workspace());
    const minimizedB = isMinimized(windowsB);
    if (isMinimized(windowsA) !== minimizedB) {
        if (minimizedB)
            return -1;
        return 1;
    }

    if (appA.state === Shell.AppState.RUNNING) {
        if (windowsA.length && !windowsB.length)
            return -1;
        else if (!windowsA.length && windowsB.length)
            return 1;

        const lastUserTime = windows =>
            Math.max(...windows.map(w => w.get_user_time()));
        return lastUserTime(windowsB) - lastUserTime(windowsA);
    }

    return 0;
}

/**
 * Re-implements shell_app_compare_windows
 *
 * @param winA
 * @param winB
 */
export function shellWindowsCompare(winA, winB) {
    const activeWorkspace = global.workspaceManager.get_active_workspace();
    const wsA = winA.get_workspace() === activeWorkspace;
    const wsB = winB.get_workspace() === activeWorkspace;

    if (wsA && !wsB)
        return -1;
    else if (!wsA && wsB)
        return 1;

    const visA = winA.showing_on_its_workspace();
    const visB = winB.showing_on_its_workspace();

    if (visA && !visB)
        return -1;
    else if (!visA && visB)
        return 1;

    return winB.get_user_time() - winA.get_user_time();
}

export const CancellableChild = GObject.registerClass({
    Properties: {
        'parent': GObject.ParamSpec.object(
            'parent', 'parent', 'parent',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Cancellable.$gtype),
    },
},
class CancellableChild extends Gio.Cancellable {
    _init(parent) {
        if (parent && !(parent instanceof Gio.Cancellable))
            throw TypeError('Not a valid cancellable');

        super._init({parent});

        if (parent?.is_cancelled()) {
            this.cancel();
            return;
        }

        this._connectToParent();
    }

    _connectToParent() {
        this._connectId = this.parent?.connect(() => {
            this._realCancel();

            if (this._disconnectIdle)
                return;

            this._disconnectIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                delete this._disconnectIdle;
                this._disconnectFromParent();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _disconnectFromParent() {
        if (this._connectId && !this._disconnectIdle) {
            this.parent.disconnect(this._connectId);
            delete this._connectId;
        }
    }

    _realCancel() {
        Gio.Cancellable.prototype.cancel.call(this);
    }

    cancel() {
        this._disconnectFromParent();
        this._realCancel();
    }
});

/**
 *
 */
export function getMonitorManager() {
    return global.backend.get_monitor_manager?.() ?? Meta.MonitorManager.get();
}

/**
 * @param laterType
 * @param callback
 */
export function laterAdd(laterType, callback) {
    return global.compositor?.get_laters?.().add(laterType, callback) ??
        Meta.later_add(laterType, callback);
}

/**
 * @param id
 */
export function laterRemove(id) {
    if (global.compositor?.get_laters)
        global.compositor?.get_laters().remove(id);
    else
        Meta.later_remove(id);
}

/**
 * Up to Gnome Shell 45, the Cairo Context object didn't export the
 * `setSourceColor()` method, so Clutter included a function call for
 * that, written in C. In Gnome Shell 46, the method was finally exported,
 * so that function was removed.
 *
 * This function is, thus, required for Gnome Shell 45 compatibility.
 *
 * @param {*} cr A cairo context
 * @param {*} sourceColor The new color for source
 */
export function cairoSetSourceColor(cr, sourceColor) {
    if (Clutter.cairo_set_source_color)
        Clutter.cairo_set_source_color(cr, sourceColor);
    else
        cr.setSourceColor(sourceColor);
}

/**
 * Specifies if the system supports extended barriers. This function
 * is required for Gnome Shell 45 compatibility, which used
 * `global.display.supports_extended_barriers`. Gnome Shell 46 moved
 * that into global.backend.capabilities.
 *
 * @returns True if the system supports extended barriers.
 */
export function supportsExtendedBarriers() {
    if (global.display.supports_extended_barriers)
        return global.display.supports_extended_barriers();
    return !!(global.backend.capabilities & Meta.BackendCapabilities.BARRIERS);
}

export function addActor(element, actor) {
    if (element.add_actor)
        element.add_actor(actor);
    else
        element.add_child(actor);
}

export const clamp = (v, m, M) => Math.min(Math.max(v, m), M);
export const clampDouble = v => clamp(v, 0, 1);
