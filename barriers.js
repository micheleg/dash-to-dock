// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    Layout,
} from './dependencies/shell/ui.js';

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
