// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;

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
        let entry = array[a].split('|');
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
        for (let w = windows.length - 1; w >= 0; w--)  {
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
    for (let w = windows.length - 1; w >= 0; w--)  {
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
        this.parent({styleClass: 'run-dialog'});
        
        this._app = app;
        this._dtdSettings = settings;
        
        let value = '';
        
        let array = this._dtdSettings.get_strv('window-stealing') || [];
        for (let a in array) {
            let c = array[a].indexOf('|');
            if (c != -1) {
                if (this._app.id == array[a].substring(0, c)) {
                    value = array[a].substring(c + 1);
                    break;
                }
            }
        }
        
        let mainContentBox = new St.BoxLayout({vertical: true});
        this.contentLayout.add(mainContentBox, {
            x_fill: true,
            y_fill: true
        });
        
        // Title
        let appIdLabel = new St.Label({
            style_class: 'run-dialog-label',
            text: _("Application ID") + ': ' + app.id
        });
        mainContentBox.add(appIdLabel, {
            x_fill: true,
            x_align: St.Align.MIDDLE
        });

        // Instructions
        let wmClassLabel = new St.Label({
            style_class: 'run-dialog-label',
            text: _("Enter pipe-separated list of WM_CLASS names to steal")
        });
        mainContentBox.add(wmClassLabel, {
            x_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.START
        });
        
        // Entry
        this._entry = new St.Entry({
            style_class: 'run-dialog-entry',
            can_focus: true
        });
        ShellEntry.addContextMenu(this._entry); // adds copy/paste context menu
        this._entry.set_text(value);
        mainContentBox.add(this._entry, {
            y_align: St.Align.START
        });
        this.setInitialKeyFocus(this._entry.clutter_text);
        this._entry.clutter_text.connect('key-press-event', Lang.bind(this, function(owner, event) {
            let symbol = event.get_key_symbol();
            if ((symbol == Clutter.Return) || (symbol == Clutter.KP_Enter)) {
                this._onSave();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }));
        
        // Buttons
        this.setButtons([{
            label: _("Cancel"),
            action: Lang.bind(this, this._onCancel),
            key: Clutter.Escape
        }, {
            label: _("Save"),
            action: Lang.bind(this, this._onSave),
            default: true
        }]);
    },
    
    _onCancel: function() {
        this.close();
    },

    _onSave: function() {
        let value = this._entry.get_text();

        // Cleanup
        value = value.split('|');
        for (let v in value)
            value[v] = value[v].trim();
        value = value.join('|');

        let array = this._dtdSettings.get_strv('window-stealing') || [];
        
        if (value.length) {
            value = this._app.id + '|' + value;

            // Change
            let found = false;
            for (let a in array) {
                let entry = array[a].split('|', 2);
                if (entry.length == 2) {
                    if (this._app.id == entry[0]) {
                        array[a] = value;
                        found = true;
                        global.log('Changing window stealing: ' + value);
                        break;
                    }
                }
            }

            // Add
            if (!found) {
                array.push(value);
                global.log('Adding window stealing: ' + value);
            }
        }
        else {
            // Remove
            for (let a in array) {
                let entry = array[a].split('|', 2);
                if (entry.length == 2) {
                    if (this._app.id == entry[0]) {
                        array.splice(a, 1);
                        global.log('Removing window stealing: ' + this._app.id);
                        break;
                    }
                }
            }
        }

        this._dtdSettings.set_strv('window-stealing', array);
        Gio.Settings.sync();

        this.close();
    }   
});
