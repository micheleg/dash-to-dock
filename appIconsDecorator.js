// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    AppIconIndicators,
    AppIcons,
    Docking,
    Utils,
} from './imports.js';

import {
    AppMenu,
    AppDisplay,
    Main,
    PopupMenu,
} from './dependencies/shell/ui.js';

import {SignalTracker} from './dependencies/shell/misc.js';

const Labels = Object.freeze({
    RESULTS: Symbol('results'),
    ICONS: Symbol('icons'),
});

export class AppIconsDecorator {
    constructor() {
        this._signals = new SignalTracker.TransientSignalHolder();
        this._methodInjections = new Utils.InjectionsHandler();
        this._propertyInjections = new Utils.PropertyInjectionsHandler(
            null, {allowNewProperty: true});
        this._indicators = new Set();
        this._resultIndicators = new Set();
        this._updatingIcons = new WeakSet();

        this._patchAppIcons();
        this._decorateIcons();
    }

    destroy() {
        this._icons?.destroy();
        this._signals.destroy();
        this._methodInjections?.destroy();
        delete this._methodInjections;
        this._propertyInjections?.destroy();
        delete this._propertyInjections;
        Object.values(Labels).forEach(label => this._clearIndicators(label));
        delete this._indicators;
        delete this._resultIndicators;
        delete this._updatingIcons;
        delete this._appDisplay;
    }

    _indicatorsSet(label) {
        return {
            [Labels.ICONS]: this._indicators,
            [Labels.RESULTS]: this._resultIndicators,
        }[label];
    }

    _clearIndicators(label) {
        const indicatorsSet = this._indicatorsSet(label);
        indicatorsSet.forEach(i => i.destroy());
        indicatorsSet.clear();
    }

    _decorateIcon(parentIcon, signalLabel) {
        const indicator = new AppIconIndicators.UnityIndicator(parentIcon);
        const indicatorsSet = this._indicatorsSet(signalLabel);
        indicatorsSet.add(indicator);
        // the result icons live as long as the decorator, while the app
        // display ones are decorated again on each view reload
        const tracker = signalLabel === Labels.ICONS ? this._icons : this._signals;
        parentIcon.connectObject('destroy', () => {
            indicatorsSet.delete(indicator);
        }, tracker);
    }

    _decorateIcons() {
        const {appDisplay} = Docking.DockManager.getDefault().overviewControls;
        this._appDisplay = appDisplay;

        const decorateAppIcons = () => {
            this._icons?.destroy();
            this._icons = new SignalTracker.TransientSignalHolder(this._signals);
            this._clearIndicators(Labels.ICONS);

            const decorateViewIcons = view => {
                const items = view.getAllItems();
                items.forEach(i => {
                    if (i instanceof AppDisplay.AppIcon) {
                        this._decorateIcon(i, Labels.ICONS);
                    } else if (i instanceof AppDisplay.FolderIcon) {
                        decorateViewIcons(i.view);
                        i.view.connectObject('view-loaded',
                            () => decorateAppIcons(), this._icons);
                    }
                });
            };
            decorateViewIcons(appDisplay);
        };

        appDisplay.connectObject('view-loaded',
            () => decorateAppIcons(), this._signals);
        decorateAppIcons();
    }

    _patchAppIcons() {
        const self = this;

        this._methodInjections.add(AppDisplay.AppSearchProvider.prototype,
            'createResultObject', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                const result = originalFunction.call(this, ...args);
                if (result instanceof AppDisplay.AppIcon)
                    self._decorateIcon(result, Labels.RESULTS);
                return result;
                /* eslint-enable no-invalid-this */
            });

        this._methodInjections.add(AppDisplay.AppIcon.prototype,
            'activate', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                if (this.updating) {
                    const {notifyAppIconUpdating} = AppIcons.DockAbstractAppIcon.prototype;
                    notifyAppIconUpdating.call(this,
                        Main.layoutManager.primaryMonitor.index);
                    return;
                }

                originalFunction.call(this, ...args);
                /* eslint-enable no-invalid-this */
            });

        const appIconsTypes = [
            AppDisplay.AppSearchProvider,
            AppDisplay.AppIcon,
        ];
        appIconsTypes.forEach(type =>
            this._propertyInjections.add(type.prototype, 'updating', {
                get() {
                    return self._updatingIcons.has(this);
                },
                set(updating) {
                    if (this.updating === updating)
                        return;

                    if (updating) {
                        self._updatingIcons.add(this);
                        this.add_style_class_name('updating');
                    } else {
                        self._updatingIcons.delete(this);
                        this.remove_style_class_name('updating');
                    }
                },
            }));

        this._methodInjections.add(AppMenu.AppMenu.prototype,
            'open', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                if (!this.sourceActor.updating) {
                    originalFunction.call(this, ...args);
                    return;
                }

                if (this.isOpen)
                    return;

                if (this.isEmpty())
                    return;

                // Temporarily hide all the menu items a part the Pinning and
                // the details one while we're updating.
                const validItems = [
                    this._toggleFavoriteItem,
                    this._detailsItem,
                ];
                const items = this._getMenuItems().filter(
                    i => !validItems.includes(i)).map(i =>
                    i instanceof PopupMenu.PopupMenuBase ? i.actor : i);
                const itemsVisibility = items.map(i => i.visible);
                items.forEach(i => (i.visible = false));
                const menuClosedId = this.connect('menu-closed', () => {
                    this.disconnect(menuClosedId);
                    items.forEach((i, idx) => (i.visible = itemsVisibility[idx]));
                });
                originalFunction.call(this, ...args);
                /* eslint-enable no-invalid-this */
            });
    }
}
