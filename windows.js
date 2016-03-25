// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Shell = imports.gi.Shell;

let SETTINGS = {
	'sapir-claws-mail.desktop': ['Claws-mail'],
	'sapir-pidgin.desktop': ['Pidgin']
};

function isWindowStealer(app) {
	return SETTINGS[app.id] != null;
}

function isStolen(app) {
	return hasStolenWindows(app) && !getNonStolenWindows(app).length;
}

function isStealingFrom(app, stolenApp) {
	if (stolenApp !== null) {
		let windows = stolenApp.get_windows();
		for (let w in windows) {
			if (isStealingWindow(app, windows[w])) {
				return true;
			}
		}
	}
	return false;
}

function isStolenWindow(window) {
	let clazz = window.wm_class;
	for (let id in SETTINGS) {
		let classesToSteal = SETTINGS[id];
		for (let i in classesToSteal) {
			if (clazz == classesToSteal[i]) {
				return true;
			}
		}
	}
	return false;
}

function isStealingWindow(app, window) {
	let classesToSteal = SETTINGS[app.id];
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

function hasStolenWindows(app) {
	let windows = app.get_windows();
	for (let w in windows) {
		if (isStolenWindow(windows[w])) {
			return true;
		}
	}
	return false;
}

function getStolenWindows(app) {
	return app.get_windows().filter(function(w) {
		return isStolenWindow(w);
	});
}

function getNonStolenWindows(app) {
	return app.get_windows().filter(function(w) {
		return !isStolenWindow(w);
	});
}

// Includes stolen windows
function getAllWindows(app) {
	let windows = app.get_windows();
	let classesToSteal = SETTINGS[app.id];
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

// Filter out unnecessary windows, for instance
// nautilus desktop window.
function getInterestingWindows(app) {
    return getAllWindows(app).filter(function(w) {
        return !w.skip_taskbar;
    });
}
