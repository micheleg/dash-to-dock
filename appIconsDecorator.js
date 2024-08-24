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

export class AppIconsDecorator {
    constructor() {
        this._signals = new Utils.GlobalSignalsHandler();
        this._iconSignals = new Utils.GlobalSignalsHandler();
        this._methodInjections = new Utils.InjectionsHandler();
        this._propertyInjections = new Utils.PropertyInjectionsHandler({allowNewProperty: true});
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
        this._propertyInjections?.destroy();
        delete this._propertyInjections;
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

        this._methodInjections.add(AppDisplay.AppIcon.prototype,
            'activate', function (originalFunction, ...args) {
                /* eslint-disable no-invalid-this */
                if (this.updating) {
                    const icon = Gio.Icon.new_for_string('action-unavailable-symbolic');
                    Main.osdWindowManager.show(-1, icon,
                        _('%s is currently updating, cannot launch it!').format(this.name),
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
                    // eslint-disable-line no-invalid-this
                    return !!this.__d2dUpdating;
                },
                set(updating) {
                    /* eslint-disable no-invalid-this */
                    if (this.updating === updating)
                        return;
                    this.__d2dUpdating = updating;
                    if (updating)
                        this.add_style_class_name('updating');
                    else
                        this.remove_style_class_name('updating');
                    /* eslint-enable no-invalid-this */
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

                // Temporarily hide all the menu items a part the Pinning one
                // while we're updating.
                const items = this._getMenuItems().filter(
                    i => i !== this._toggleFavoriteItem).map(i =>
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
