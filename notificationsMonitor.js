// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {Gio} from './dependencies/gi.js';
import {Main} from './dependencies/shell/ui.js';

import {
    Docking,
    Utils,
} from './imports.js';

const {signals: Signals} = imports;

const Labels = Object.freeze({
    SOURCES: Symbol('sources'),
    NOTIFICATIONS: Symbol('notifications'),
});
export class NotificationsMonitor {
    constructor() {
        this._settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });

        this._appNotifications = Object.create(null);
        this._signalsHandler = new Utils.GlobalSignalsHandler(this);

        const getIsEnabled = () => !this.dndMode &&
            Docking.DockManager.settings.showIconsNotificationsCounter;

        this._isEnabled = getIsEnabled();
        const checkIsEnabled = () => {
            const isEnabled = getIsEnabled();
            if (isEnabled !== this._isEnabled) {
                this._isEnabled = isEnabled;
                this.emit('state-changed');

                this._updateState();
            }
        };

        this._dndMode = !this._settings.get_boolean('show-banners');
        this._signalsHandler.add(this._settings, 'changed::show-banners', () => {
            this._dndMode = !this._settings.get_boolean('show-banners');
            checkIsEnabled();
        });
        this._signalsHandler.add(Docking.DockManager.settings,
            'changed::show-icons-notifications-counter', checkIsEnabled);

        this._updateState();
    }

    destroy() {
        this.emit('destroy');
        this._signalsHandler?.destroy();
        this._signalsHandler = null;
        this._appNotifications = null;
        this._settings = null;
    }

    get enabled() {
        return this._isEnabled;
    }

    get dndMode() {
        return this._dndMode;
    }

    getAppNotificationsCount(appId) {
        return this._appNotifications[appId] ?? 0;
    }

    _updateState() {
        if (this.enabled) {
            this._signalsHandler.addWithLabel(Labels.SOURCES, Main.messageTray,
                'source-added', () => this._checkNotifications());
            this._signalsHandler.addWithLabel(Labels.SOURCES, Main.messageTray,
                'source-removed', () => this._checkNotifications());
        } else {
            this._signalsHandler.removeWithLabel(Labels.SOURCES);
        }

        this._checkNotifications();
    }

    _checkNotifications() {
        this._appNotifications = Object.create(null);
        this._signalsHandler.removeWithLabel(Labels.NOTIFICATIONS);

        if (this.enabled) {
            Main.messageTray.getSources().forEach(source => {
                this._signalsHandler.addWithLabel(Labels.NOTIFICATIONS, source,
                    'notification-added', () => this._checkNotifications());

                source.notifications.forEach(notification => {
                    const app = notification.source?.app ?? notification.source?._app;
                    const appId = app?.id ?? app?._appId;

                    if (appId) {
                        if (notification.resident) {
                            if (notification.acknowledged)
                                return;

                            this._signalsHandler.addWithLabel(Labels.NOTIFICATIONS,
                                notification, 'notify::acknowledged',
                                () => this._checkNotifications());
                        }

                        this._signalsHandler.addWithLabel(Labels.NOTIFICATIONS,
                            notification, 'destroy', () => this._checkNotifications());

                        this._appNotifications[appId] =
                            (this._appNotifications[appId] ?? 0) + 1;
                    }
                });
            });
        }

        this.emit('changed');
    }
}

Signals.addSignalMethods(NotificationsMonitor.prototype);
