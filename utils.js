
const Gi = imports._gi;

const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Docking = Me.imports.docking;

var SignalsHandlerFlags = {
    NONE: 0,
    CONNECT_AFTER: 1
};

/**
 * Simplify global signals and function injections handling
 * abstract class
 */
const BasicHandler = class DashToDock_BasicHandler {

    constructor(parentObject) {
        this._storage = new Object();

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
        this.addWithLabel('generic', ...args);
    }

    destroy() {
        this._parentObject?.disconnect(this._destroyId);
        this._parentObject = null;

        for( let label in this._storage )
            this.removeWithLabel(label);
    }

    addWithLabel(label, ...args) {
        let argsArray = [...args];
        if (argsArray.every(arg => !Array.isArray(arg)))
            argsArray = [argsArray];

        if (this._storage[label] == undefined)
            this._storage[label] = new Array();

        // Skip first element of the arguments
        for (const argArray of argsArray) {
            if (argArray.length < 3)
                throw new Error('Unexpected number of arguments');
            let item = this._storage[label];
            try {
                item.push(this._create(...argArray));
            } catch (e) {
                logError(e);
            }
        }
    }

    removeWithLabel(label) {
        if (this._storage[label]) {
            for (let i = 0; i < this._storage[label].length; i++)
                this._remove(this._storage[label][i]);

            delete this._storage[label];
        }
    }

    // Virtual methods to be implemented by subclass

    /**
     * Create single element to be stored in the storage structure
     */
    _create(_object, _element, _callback) {
        throw new GObject.NotImplementedError(`_create in ${this.constructor.name}`);
    }

    /**
     * Correctly delete single element
     */
    _remove(_item) {
        throw new GObject.NotImplementedError(`_remove in ${this.constructor.name}`);
    }
};

/**
 * Manage global signals
 */
var GlobalSignalsHandler = class DashToDock_GlobalSignalHandler extends BasicHandler {

    _create(object, event, callback, flags = SignalsHandlerFlags.NONE) {
        if (!object)
            throw new Error('Impossible to connect to an invalid object');

        let after = flags == SignalsHandlerFlags.CONNECT_AFTER;
        let connector = after ? object.connect_after : object.connect;

        if (!connector) {
            throw new Error(`Requested to connect to signal '${event}', ` +
                `but no implementation for 'connect${after ? '_after' : ''}' `+
                `found in ${object.constructor.name}`);
        }

        let id = connector.call(object, event, callback);

        return [object, id];
    }

    _remove(item) {
        const [object, id] = item;
        object.disconnect(id);
    }
};

/**
 * Color manipulation utilities
  */
var ColorUtils = class DashToDock_ColorUtils {

    // Darken or brigthen color by a fraction dlum
    // Each rgb value is modified by the same fraction.
    // Return "#rrggbb" string
    static ColorLuminance(r, g, b, dlum) {
        let rgbString = '#';

        rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(r*(1+dlum), 0), 255)), 2);
        rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(g*(1+dlum), 0), 255)), 2);
        rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(b*(1+dlum), 0), 255)), 2);

        return rgbString;
    }

    // Convert decimal to an hexadecimal string adding the desired padding
    static _decimalToHex(d, padding) {
        let hex = d.toString(16);
        while (hex.length < padding)
            hex = '0'+ hex;
        return hex;
    }

    // Convert hsv ([0-1, 0-1, 0-1]) to rgb ([0-255, 0-255, 0-255]).
    // Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
    // here with h = [0,1] instead of [0, 360]
    // Accept either (h,s,v) independently or  {h:h, s:s, v:v} object.
    // Return {r:r, g:g, b:b} object.
    static HSVtoRGB(h, s, v) {
        if (arguments.length === 1) {
            s = h.s;
            v = h.v;
            h = h.h;
        }

        let r,g,b;
        let c = v*s;
        let h1 = h*6;
        let x = c*(1 - Math.abs(h1 % 2 - 1));
        let m = v - c;

        if (h1 <=1)
            r = c + m, g = x + m, b = m;
        else if (h1 <=2)
            r = x + m, g = c + m, b = m;
        else if (h1 <=3)
            r = m, g = c + m, b = x + m;
        else if (h1 <=4)
            r = m, g = x + m, b = c + m;
        else if (h1 <=5)
            r = x + m, g = m, b = c + m;
        else
            r = c + m, g = m, b = x + m;

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    // Convert rgb ([0-255, 0-255, 0-255]) to hsv ([0-1, 0-1, 0-1]).
    // Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
    // here with h = [0,1] instead of [0, 360]
    // Accept either (r,g,b) independently or {r:r, g:g, b:b} object.
    // Return {h:h, s:s, v:v} object.
    static RGBtoHSV(r, g, b) {
        if (arguments.length === 1) {
            r = r.r;
            g = r.g;
            b = r.b;
        }

        let h,s,v;

        let M = Math.max(r, g, b);
        let m = Math.min(r, g, b);
        let c = M - m;

        if (c == 0)
            h = 0;
        else if (M == r)
            h = ((g-b)/c) % 6;
        else if (M == g)
            h = (b-r)/c + 2;
        else
            h = (r-g)/c + 4;

        h = h/6;
        v = M/255;
        if (M !== 0)
            s = c/M;
        else
            s = 0;

        return {
            h: h,
            s: s,
            v: v
        };
    }
};

/**
 * Manage function injection: both instances and prototype can be overridden
 * and restored
 */
var InjectionsHandler = class DashToDock_InjectionsHandler extends BasicHandler {

    _create(object, name, injectedFunction) {
        let original = object[name];

        if (!(original instanceof Function))
            throw new Error(`Virtual function ${name} is not available for ${prototype}`);

        object[name] = function(...args) { return injectedFunction.call(this, original, ...args) };
        return [object, name, original];
    }

    _remove(item) {
        const [object, name, original] = item;
        object[name] = original;
    }
};

/**
 * Manage vfunction injection: both instances and prototype can be overridden
 * and restored
 */
var VFuncInjectionsHandler = class DashToDock_VFuncInjectionsHandler extends BasicHandler {

    _create(prototype, name, injectedFunction) {
        const original = prototype[`vfunc_${name}`];
        if (!(original instanceof Function))
            throw new Error(`Virtual function ${name} is not available for ${prototype}`);
        prototype[Gi.hook_up_vfunc_symbol](name, injectedFunction);
        return [prototype, name];
    }

    _remove(item) {
        const [prototype, name] = item;
        const originalVFunc = prototype[`vfunc_${name}`];
        try {
            // This may fail if trying to reset to a never-overridden vfunc
            // as gjs doesn't consider it a function, even if it's true that
            // originalVFunc instanceof Function.
            prototype[Gi.hook_up_vfunc_symbol](name, originalVFunc);
        } catch {
            try {
                prototype[Gi.hook_up_vfunc_symbol](name, function (...args) {
                    return originalVFunc.call(this, ...args);
                });
            } catch (e) {
                logError(e, `Removing vfunc_${name}`);
            }
        }
    }
};

/**
 * Manage properties injection: both instances and prototype can be overridden
 * and restored
 */
var PropertyInjectionsHandler = class DashToDock_PropertyInjectionsHandler extends BasicHandler {

    _create(instance, name, injectedPropertyDescriptor) {
        if (!(name in instance))
            throw new Error(`Object ${instance} has no '${name}' property`);

        const prototype = instance.constructor.prototype;
        const originalPropertyDescriptor = Object.getOwnPropertyDescriptor(prototype, name) ??
            Object.getOwnPropertyDescriptor(instance, name);

        Object.defineProperty(instance, name, {
            ...originalPropertyDescriptor,
            ...injectedPropertyDescriptor,
            ...{ configurable: true },
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
};

/**
 * Return the actual position reverseing left and right in rtl
 */
function getPosition() {
    let position = Docking.DockManager.settings.get_enum('dock-position');
    if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        if (position == St.Side.LEFT)
            position = St.Side.RIGHT;
        else if (position == St.Side.RIGHT)
            position = St.Side.LEFT;
    }
    return position;
}

function getPreviewScale() {
    return Docking.DockManager.settings.get_double('preview-size-scale');
}

function drawRoundedLine(cr, x, y, width, height, isRoundLeft, isRoundRight, stroke, fill) {
    if (height > width) {
        y += Math.floor((height - width) / 2.0);
        height = width;
    }
    
    height = 2.0 * Math.floor(height / 2.0);
    
    var leftRadius = isRoundLeft ? height / 2.0 : 0.0;
    var rightRadius = isRoundRight ? height / 2.0 : 0.0;
    
    cr.moveTo(x + width - rightRadius, y);
    cr.lineTo(x + leftRadius, y);
    if (isRoundLeft)
        cr.arcNegative(x + leftRadius, y + leftRadius, leftRadius, -Math.PI/2, Math.PI/2);
    else
        cr.lineTo(x, y + height);
    cr.lineTo(x + width - rightRadius, y + height);
    if (isRoundRight)
        cr.arcNegative(x + width - rightRadius, y + rightRadius, rightRadius, Math.PI/2, -Math.PI/2);
    else
        cr.lineTo(x + width, y);
    cr.closePath();
    
    if (fill != null) {
        cr.setSource(fill);
        cr.fillPreserve();
    }
    if (stroke != null)
        cr.setSource(stroke);
    cr.stroke();
}

/**
 * Convert a signal handler with n value parameters (that is, excluding the
 * signal source parameter) to an array of n handlers that are each responsible
 * for receiving one of the n values and calling the original handler with the
 * most up-to-date arguments.
 */
function splitHandler(handler) {
    if (handler.length > 30) {
        throw new Error("too many parameters");
    }
    const count = handler.length - 1;
    let missingValueBits = (1 << count) - 1;
    const values = Array.from({ length: count });
    return values.map((_ignored, i) => {
        const mask = ~(1 << i);
        return (obj, value) => {
            values[i] = value;
            missingValueBits &= mask;
            if (missingValueBits === 0) {
                handler(obj, ...values);
            }
        };
    });
}

var IconTheme = class DashToDockIconTheme {
    constructor() {
        const settings = St.Settings.get();
        this._iconTheme = new Gtk.IconTheme();
        this._iconTheme.set_custom_theme(settings.gtkIconTheme);
        this._changesId = settings.connect('notify::gtk-icon-theme', () => {
            this._iconTheme.set_custom_theme(settings.gtkIconTheme);
        });
    }

    get iconTheme() {
        return this._iconTheme;
    }

    destroy() {
        St.Settings.get().disconnect(this._changesId);
        this._iconTheme = null;
    }
}
