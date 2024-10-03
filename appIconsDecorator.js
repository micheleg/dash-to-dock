// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-


import {
    Docking,
    AppIconIndicators,
    Utils,
} from './imports.js';

import {
    Gio,
} from './dependencies/gi.js';

import {
    AppMenu,
    AppDisplay,
    Main,
    PopupMenu,
} from './dependencies/shell/ui.js';

const Labels = Object.freeze({
    GENERIC: Symbol('generic'),
    ICONS: Symbol('icons'),
});

export class AppIconsDecorator {
    constructor() {
        this._signals = new Utils.GlobalSignalsHandler();
        this._methodInjections = new Utils.InjectionsHandler();
        this._propertyInjections = new Utils.PropertyInjectionsHandler(
            null, {allowNewProperty: true});
        this._indicators = new Set();

        this._patchAppIcons();
        this._decorateIcons();
    }

    destroy() {
        this._signals?.destroy();
        delete this._signals;
        this._methodInjections?.destroy();
        delete this._methodInjections;
        this._propertyInjections?.destroy();
        delete this._propertyInjections;
        this._indicators?.forEach(i => i.destroy());
        this._indicators?.clear();
        delete this._indicators;
    }

    _decorateIcon(parentIcon, signalLabel = Labels.GENERIC) {
        const indicator = new AppIconIndicators.UnityIndicator(parentIcon);
        this._indicators.add(indicator);
        this._signals.addWithLabel(signalLabel, parentIcon, 'destroy', () => {
            this._indicators.delete(indicator);
            indicator.destroy();
        });
        return indicator;
    }

    _decorateIcons() {
        const {appDisplay} = Docking.DockManager.getDefault().overviewControls;

        const decorateAppIcons = () => {
            this._indicators.forEach(i => i.destroy());
            this._indicators.clear();
            this._signals.removeWithLabel(Labels.ICONS);

            const decorateViewIcons = view => {
                const items = view.getAllItems();
                items.forEach(i => {
                    if (i instanceof AppDisplay.AppIcon) {
                        this._decorateIcon(i, Labels.ICONS);
                    } else if (i instanceof AppDisplay.FolderIcon) {
                        decorateViewIcons(i.view);
                        this._signals.addWithLabel(Labels.ICONS, i.view,
                            'view-loaded', () => decorateAppIcons());
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

        this._methodInjections.add(AppDisplay.AppIcon.prototype,
            'activate', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                if (this.updating) {
                    const icon = Gio.Icon.new_for_string('action-unavailable-symbolic');
                    Main.osdWindowManager.show(-1, icon,
                        _('%s is updating, try again later').format(this.name),
                        null);
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
                    return !!this.__d2dUpdating;
                },
                set(updating) {
                    if (this.updating === updating)
                        return;
                    this.__d2dUpdating = updating;
                    if (updating)
                        this.add_style_class_name('updating');
                    else
                        this.remove_style_class_name('updating');
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
