const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;

/**
 * Simplify global signals and function injections handling
 * abstract class
 */
const BasicHandler = new Lang.Class({
    Name: 'DashToDock.BasicHandler',

    _init: function() {
        this._storage = new Object();
    },

    add: function(/* unlimited 3-long array arguments */) {
        // Convert arguments object to array, concatenate with generic
        let args = Array.concat('generic', Array.slice(arguments));
        // Call addWithLabel with ags as if they were passed arguments
        this.addWithLabel.apply(this, args);
    },

    destroy: function() {
        for( let label in this._storage )
            this.removeWithLabel(label);
    },

    addWithLabel: function(label /* plus unlimited 3-long array arguments*/) {
        if (this._storage[label] == undefined)
            this._storage[label] = new Array();

        // Skip first element of the arguments
        for (let i = 1; i < arguments.length; i++) {
            this._storage[label].push( this._create(arguments[i]));
        }
    },

    removeWithLabel: function(label) {
        if (this._storage[label]) {
            for (let i = 0; i < this._storage[label].length; i++)
                this._remove(this._storage[label][i]);

            delete this._storage[label];
        }
    },

    // Virtual methods to be implemented by subclass

    /**
     * Create single element to be stored in the storage structure
     */
    _create: function(item) {
        throw new Error('no implementation of _create in ' + this);
    },

    /**
     * Correctly delete single element
     */
    _remove: function(item) {
        throw new Error('no implementation of _remove in ' + this);
    }
});

/**
 * Manage global signals
 */
const GlobalSignalsHandler = new Lang.Class({
    Name: 'DashToDock.GlobalSignalHandler',
    Extends: BasicHandler,

    _create: function(item) {
        let object = item[0];
        let event = item[1];
        let callback = item[2]
        let id = object.connect(event, callback);

        return [object, id];
    },

    _remove: function(item) {
         item[0].disconnect(item[1]);
    }
});

/**
 * Color manipulation utilities
 * 
 * Most of this code comes from reposts on stackoverflow, I was unable to trace the
 * original authors, otherwise I would have credited them here.
 */
const ColorUtils = new Lang.Class({
    Name: 'DashToDock.ColorUtils',
    
    ColorLuminance: function(r, g, b, lum) {
        var hex = b | (g << 8) | (r << 16);
        
        hex = (0x1000000 + hex).toString(16).slice(1);

        // convert to decimal and change luminosity
        var rgb = "#", c, i;
        for (i = 0; i < 3; i++) {
            c = parseInt(hex.substr(i*2,2), 16);
            c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
            rgb += ("00"+c).substr(c.length);
        }

        return rgb;
    },

    HSVtoRGB: function(h, s, v) {
        var r, g, b, i, f, p, q, t;
        if (arguments.length === 1) {
            s = h.s, v = h.v, h = h.h;
        }
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    },

    RGBtoHSV: function (r, g, b) {
        if (arguments.length === 1) {
            g = r.g, b = r.b, r = r.r;
        }
        var max = Math.max(r, g, b), min = Math.min(r, g, b),
            d = max - min,
            h,
            s = (max === 0 ? 0 : d / max),
            v = max / 255;

        switch (max) {
            case min: h = 0; break;
            case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
            case g: h = (b - r) + d * 2; h /= 6 * d; break;
            case b: h = (r - g) + d * 4; h /= 6 * d; break;
        }

        return {
            h: h,
            s: s,
            v: v
        };
    }
});

/**
 * Manage function injection: both instances and prototype can be overridden
 * and restored
 */
const InjectionsHandler = new Lang.Class({
    Name: 'DashToDock.InjectionsHandler',
    Extends: BasicHandler,

    _create: function(item) {
        let object = item[0];
        let name = item[1];
        let injectedFunction = item[2];
        let original = object[name];

        object[name] = injectedFunction;
        return [object, name, injectedFunction, original];
    },

    _remove: function(item) {
        let object = item[0];
        let name = item[1];
        let original = item[3];
        object[name] = original;
    }
});

/**
 * Return the actual position reverseing left and right in rtl
 */
function getPosition(settings) {
    let position = settings.get_enum('dock-position');
    if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        if (position == St.Side.LEFT)
            position = St.Side.RIGHT;
        else if (position == St.Side.RIGHT)
            position = St.Side.LEFT;
    }
    return position;
}
