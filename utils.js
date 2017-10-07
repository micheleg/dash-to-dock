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
