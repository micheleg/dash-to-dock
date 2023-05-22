'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Apparence = GObject.registerClass({
    GTypeName: 'Apparence',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'apparence.ui'])}`,
}, class Apparence extends Adw.PreferencesPage {
    constructor() {
        super({});
    }
});