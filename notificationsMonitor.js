// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/* exported NotificationsMonitor */

const { signals: Signals } = imports;

const {
    Gio,
} = imports.gi;

const {
    main: Main,
} = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {
    utils: Utils,
} = Me.imports;


const Labels = Object.freeze({
    SOURCES: Symbol('sources'),
    NOTIFICATIONS: Symbol('notifications'),
});


var NotificationsMonitor = class NotificationsManagerImpl {
    constructor() {
        this._settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });

        this._appNotifications = Object.create(null);
        this._signalsHandler = new Utils.GlobalSignalsHandler(this);

        this._isEnabled = this._settings.get_boolean('show-banners');
        this._signalsHandler.add(this._settings, 'changed::show-banners', () => {
            const isEnabled = this._settings.get_boolean('show-banners');
            if (isEnabled !== this._isEnabled) {
                this._isEnabled = isEnabled;
                this.emit('state-changed');

                this._updateState();
            }
        });

        this._updateState();
    }

    destroy() {
        this.emit('destroy');
        this._signalsHandler.destroy();
        this._signalsHandler = null;
        this._appNotifications = null;
        this._settings = null;
    }

    get enabled() {
        return this._isEnabled;
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

                    if (app?.id) {
                        this._signalsHandler.addWithLabel(Labels.NOTIFICATIONS,
                            notification, 'destroy', () => this._checkNotifications());

                        this._appNotifications[app.id] =
                            (this._appNotifications[app.id] ?? 0) + 1;
                    }
                });
            });
        }

        this.emit('changed');
    }
};

Signals.addSignalMethods(NotificationsMonitor.prototype);
