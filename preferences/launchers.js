'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Launchers = GObject.registerClass({
    GTypeName: 'Launchers',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'launchers.ui'])}`,
}, class Launchers extends Adw.PreferencesPage {
    constructor() {
        super({});
    }
});