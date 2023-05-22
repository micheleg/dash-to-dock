'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var Behavior = GObject.registerClass({
    GTypeName: 'Behavior',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'behavior.ui'])}`,
}, class Behavior extends Adw.PreferencesPage {
    constructor() {
        super({});
    }
});