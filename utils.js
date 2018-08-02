const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
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
            let item = this._storage[label];
            item.push(this._create(arguments[i]));
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
var GlobalSignalsHandler = new Lang.Class({
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
  */
var ColorUtils = {

    // Darken or brigthen color by a fraction dlum
    // Each rgb value is modified by the same fraction.
    // Return "#rrggbb" string
    ColorLuminance: function(r, g, b, dlum) {
        let rgbString = '#';

        rgbString += Math.round(Math.min(Math.max(r*(1+dlum), 0), 255)).toString(16);
        rgbString += Math.round(Math.min(Math.max(g*(1+dlum), 0), 255)).toString(16);
        rgbString += Math.round(Math.min(Math.max(b*(1+dlum), 0), 255)).toString(16);

        return rgbString;
    },

    // Convert hsv ([0-1, 0-1, 0-1]) to rgb ([0-255, 0-255, 0-255]).
    // Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
    // here with h = [0,1] instead of [0, 360]
    // Accept either (h,s,v) independently or  {h:h, s:s, v:v} object.
    // Return {r:r, g:g, b:b} object.
    HSVtoRGB: function(h, s, v) {
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
    },

    // Convert rgb ([0-255, 0-255, 0-255]) to hsv ([0-1, 0-1, 0-1]).
    // Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
    // here with h = [0,1] instead of [0, 360]
    // Accept either (r,g,b) independently or {r:r, g:g, b:b} object.
    // Return {h:h, s:s, v:v} object.
    RGBtoHSV: function (r, g, b) {
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
var InjectionsHandler = new Lang.Class({
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

// This is wrapper to maintain compatibility with GNOME-Shell 3.30+ as well as
// previous versions.
var DisplayWrapper = {
    getScreen: function() {
        return global.screen || global.display;
    },

    getWorkspaceManager: function() {
        return global.screen || global.workspace_manager;
    },

    getMonitorManager: function() {
        return global.screen || Meta.MonitorManager.get();
    }
};
