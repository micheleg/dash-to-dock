// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {GObject} from './dependencies/gi.js';

import {SignalTracker} from './dependencies/shell/misc.js';

export class DestroyableIface extends GObject.Interface {
    static [GObject.signals] = {
        'destroy': {},
    };

    static [GObject.requires] = [
        GObject.Object,
    ];

    static {
        /* eslint-disable no-invalid-this */
        GObject.registerClass(this);
        SignalTracker.registerDestroyableType(this);
        /* eslint-enable no-invalid-this */
    }

    destroy() {
        this.emit('destroy');
    }
}

export class DestroyableObject extends GObject.Object {
    static [GObject.interfaces] = [DestroyableIface];

    static {
        /* eslint-disable no-invalid-this */
        GObject.registerClass(this);
        /* eslint-enable no-invalid-this */
    }
}
