// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {Gio} from './dependencies/gi.js';
import {Main} from './dependencies/shell/ui.js';

import {
    Docking,
} from './imports.js';

import {
    EventEmitter,
    SignalTracker,
} from './dependencies/shell/misc.js';

export class NotificationsMonitor extends EventEmitter {
    constructor() {
        super();

        this._settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });

        this._appNotifications = Object.create(null);
        this._signals = new SignalTracker.TransientSignalHolder();
        this._notificationSignals = new SignalTracker.TransientSignalHolder();

        const getIsEnabled = () => !this.dndMode &&
            Docking.DockManager.settings.showIconsNotificationsCounter;

        this._isEnabled = getIsEnabled();
        const checkIsEnabled = () => {
            const isEnabled = getIsEnabled();
            if (isEnabled !== this._isEnabled) {
                this._isEnabled = isEnabled;
                this.emit('state-changed');

                this._checkNotifications();
            }
        };

        this._dndMode = !this._settings.get_boolean('show-banners');
        this._settings.connectObject('changed::show-banners', () => {
            this._dndMode = !this._settings.get_boolean('show-banners');
            checkIsEnabled();
        }, this._signals);
        Docking.DockManager.settings.connectObject(
            'changed::show-icons-notifications-counter', checkIsEnabled, this._signals);
        Main.messageTray.connectObject(
            'source-added', () => this._onSourcesChanged(),
            'source-removed', () => this._onSourcesChanged(),
            this._signals);

        this._checkNotifications();
    }

    destroy() {
        this.emit('destroy');
        this._signals.destroy();
        this._notificationSignals.destroy();
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

    _onSourcesChanged() {
        if (this.enabled)
            this._checkNotifications();
    }

    _checkNotifications() {
        this._appNotifications = Object.create(null);
        this._notificationSignals.destroy();
        this._notificationSignals = new SignalTracker.TransientSignalHolder();

        if (this.enabled) {
            Main.messageTray.getSources().forEach(source => {
                source.connectObject('notification-added',
                    () => this._checkNotifications(), this._notificationSignals);

                source.notifications.forEach(notification => {
                    const app = notification.source?.app ?? notification.source?._app;
                    const appId = app?.id ?? app?._appId;

                    if (appId) {
                        if (notification.resident) {
                            if (notification.acknowledged)
                                return;

                            notification.connectObject('notify::acknowledged',
                                () => this._checkNotifications(),
                                this._notificationSignals);
                        }

                        notification.connectObject('destroy',
                            () => this._checkNotifications(),
                            this._notificationSignals);

                        this._appNotifications[appId] =
                            (this._appNotifications[appId] ?? 0) + 1;
                    }
                });
            });
        }

        this.emit('changed');
    }
}


