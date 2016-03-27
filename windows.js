// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const ModalDialog = imports.ui.modalDialog;

// Example settings:
let exampleSettings = [
    'sapir-claws-mail.desktop Claws-mail',
    'sapir-pidgin.desktop Pidgin'
];

function getSettings(settings) {
    if (!settings.get_boolean('support-window-stealing'))
        return {};
    
    let table = {};

    let array = settings.get_strv('window-stealing') || [];
    
    if ((array == null) || !array.length) {
        array = exampleSettings;
        settings.set_strv('window-stealing', array);
        Gio.Settings.sync();
    }
    
    for (let a in array) {
        let entry = array[a].split(' ');
        if (entry.length) {
            let key = entry[0];
            entry.splice(0, 1);
            table[key] = entry;
        }
    }
    return table;
}

function isWindowStealer(app, settings) {
    settings = getSettings(settings);
    return settings[app.id] != null;
}

function isStolen(app, settings) {
    return hasStolenWindows(app, settings) && !getNonStolenWindows(app, settings).length;
}

function isStealingFrom(app, stolenApp, settings) {
    if (stolenApp !== null) {
        let windows = stolenApp.get_windows();
        for (let w in windows) {
            if (isStealingWindow(app, windows[w], settings)) {
                return true;
            }
        }
    }
    return false;
}

function isStolenWindow(window, settings) {
    settings = getSettings(settings);
    let clazz = window.wm_class;
    for (let id in settings) {
        let classesToSteal = settings[id];
        for (let i in classesToSteal) {
            if (clazz == classesToSteal[i]) {
                return true;
            }
        }
    }
    return false;
}

function isStealingWindow(app, window, settings) {
    settings = getSettings(settings);
    let classesToSteal = settings[app.id];
    if (classesToSteal) {
        let clazz = window.wm_class;
        for (let c in classesToSteal) {
            if (classesToSteal[c] == clazz) {
                return true;
            }
        }
    }
    return false;
}

function hasStolenWindows(app, settings) {
    let windows = app.get_windows();
    for (let w in windows) {
        if (isStolenWindow(windows[w], settings)) {
            return true;
        }
    }
    return false;
}

function getStolenWindows(app, settings) {
    return app.get_windows().filter(function(w) {
        return isStolenWindow(w, settings);
    });
}

function getNonStolenWindows(app, settings) {
    return app.get_windows().filter(function(w) {
        return !isStolenWindow(w, settings);
    });
}

/**
 * Includes stolen windows
 */
function getAllWindows(app, settings) {
    settings = getSettings(settings);
    let windows = app.get_windows();
    let classesToSteal = settings[app.id];
    if (classesToSteal) {
        let running = Shell.AppSystem.get_default().get_running();
        running.forEach(function(r) {
            r.get_windows().forEach(function(window) {
                let clazz = window.wm_class;
                for (let c in classesToSteal) {
                    if (classesToSteal[c] == clazz) {
                        windows.push(window);
                    }
                }
            });
        });
    }
    return windows;
}

/**
 * Filter out unnecessary windows, for instance
 * nautilus desktop window.
 */
function getInterestingWindows(app, settings) {
    return getAllWindows(app, settings).filter(function(w) {
        return !w.skip_taskbar;
    });
}

/**
 * Window stealing settings
 */
const WindowStealingSettings = new Lang.Class({
    Name: 'DashToDock.WindowStealingSettings',
    Extends: ModalDialog.ModalDialog,
    
    _init: function(app, settings) {
        this.parent();
        
        this._app = app;
        this._dtdSettings = settings;
        
        let value = '';
        
        let array = this._dtdSettings.get_strv('window-stealing') || [];
        for (let a in array) {
            let entry = array[a].split(' ', 2);
            if (entry.length == 2) {
                if (this._app.id == entry[0]) {
                    value = entry[1];
                    break;
                }
            }
        }
        
        let mainContentBox = new St.BoxLayout({vertical: false});
        this.contentLayout.add(mainContentBox, {
            x_fill: true,
            y_fill: true
        });
        
        let messageBox = new St.BoxLayout({vertical: true});
        mainContentBox.add(messageBox, {
            expand: true,
            y_align: St.Align.START
        });
        
        let appIdLabel = new St.Label({text: _('App ID: ') + app.id});
        messageBox.add(appIdLabel, {
            expand: true,
            x_fill: true,
            x_align: St.Align.MIDDLE
        });

        let wmClassLabel = new St.Label({text: _('Space-separated list of WM_CLASS names')});
        messageBox.add(wmClassLabel, {
        });
        
        this._entry = new St.Entry({can_focus: true});
        this._entry.set_text(value);
        messageBox.add(this._entry, {
        });
        this.setInitialKeyFocus(this._entry.clutter_text);
        
        this._cancelButton = this.addButton({
            label: _('Cancel'),
            action: Lang.bind(this, this._onCancel),
            key: Clutter.Escape
        }, {
            expand: true
        });

        this._okButton = this.addButton({
            label: _('Save'),
            action: Lang.bind(this, this._onSave),
            key: Clutter.Escape
        }, {
            expand: false,
            x_fill: false,
            x_align: St.Align.END
        });
    },
    
    _onCancel: function() {
        this.close();
    },

    _onSave: function() {
        let value = this._entry.get_text();
        global.log('>>>>>>>>>> ' + value);
        value = this._app.id + ' ' + value;
        
        let array = this._dtdSettings.get_strv('window-stealing') || [];
        let found = false;
        for (let a in array) {
            let entry = array[a].split(' ', 2);
            if (entry.length == 2) {
                if (this._app.id == entry[0]) {
                    array[a] = value;
                    found = true;
                    break;
                }
            }
        }
        
        if (!found) {
            array.push(value);
        }

        this._dtdSettings.set_strv('window-stealing', array);
        Gio.Settings.sync();

        this.close();
    }   
});
