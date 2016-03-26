// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;

// Example settings:
let exampleSettings = [
    'sapir-claws-mail.desktop Claws-mail',
    'sapir-pidgin.desktop Pidgin'
];

function getSettings(settings) {
    let table = {};
    if (!settings.get_strv('window-stealing').length) {
        settings.set_strv('window-stealing', exampleSettings);
        Gio.Settings.sync();
    }
    let array = settings.get_strv('window-stealing');
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
