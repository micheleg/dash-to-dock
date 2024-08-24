// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-


import {
    Docking,
    AppIconIndicators,
    Utils,
} from './imports.js';

import {
    AppDisplay,
} from './dependencies/shell/ui.js';

export class AppIconsDecorator {
    constructor() {
        this._signals = new Utils.GlobalSignalsHandler();
        this._iconSignals = new Utils.GlobalSignalsHandler();
        this._methodInjections = new Utils.InjectionsHandler();
        this._indicators = new Set();

        this._patchAppIcons();
        this._decorateIcons();
    }

    destroy() {
        this._signals?.destroy();
        delete this._signals;
        this._iconSignals?.destroy();
        delete this._iconSignals;
        this._methodInjections?.destroy();
        delete this._methodInjections;
        this._indicators?.clear();
        delete this._indicators;
    }

    _decorateIcon(parentIcon) {
        const indicator = new AppIconIndicators.UnityIndicator(parentIcon);
        this._indicators.add(indicator);
        this._signals.add(parentIcon, 'destroy', () => {
            this._indicators.delete(indicator);
            indicator.destroy();
        });
        return indicator;
    }

    _decorateIcons() {
        const {appDisplay} = Docking.DockManager.getDefault().overviewControls;

        const decorateAppIcons = () => {
            this._indicators.clear();
            this._iconSignals.clear();

            const decorateViewIcons = view => {
                const items = view.getAllItems();
                items.forEach(i => {
                    if (i instanceof AppDisplay.AppIcon) {
                        this._decorateIcon(i);
                    } else if (i instanceof AppDisplay.FolderIcon) {
                        decorateViewIcons(i.view);
                        this._iconSignals.add(i.view, 'view-loaded', () =>
                            decorateAppIcons());
                    }
                });
            };
            decorateViewIcons(appDisplay);
        };

        this._signals.add(appDisplay, 'view-loaded', () => decorateAppIcons());
        decorateAppIcons();
    }

    _patchAppIcons() {
        const self = this;

        this._methodInjections.add(AppDisplay.AppSearchProvider.prototype,
            'createResultObject', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                const result = originalFunction.call(this, ...args);
                if (result instanceof AppDisplay.AppIcon)
                    self._decorateIcon(result);
                return result;
                /* eslint-enable no-invalid-this */
            });
    }
}
