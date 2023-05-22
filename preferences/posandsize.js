'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var posAndSize = GObject.registerClass({
    GTypeName: 'posAndSize',
    Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'posandsize.ui'])}`,
}, class posAndSize extends Adw.PreferencesPage {
    constructor() {
        super({});
    }
});