'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var About = GObject.registerClass(
    {
        GTypeName: 'About',
        Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'about.ui'])}`,
        InternalChildren: [
            'version',
            'author'
        ]
    }, 
    class About extends Adw.PreferencesPage {
        constructor(settings) {
            super({});
        };
    }
);