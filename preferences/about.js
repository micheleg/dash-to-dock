'use strict';

const { Adw, GLib, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

var About = GObject.registerClass(
    {
        GTypeName: 'About',
        Template: `file://${GLib.build_filenamev([Me.path, 'ui', 'about.ui'])}`,
        InternalChildren: [
            'name',
            'version',
            'author',
            'description'
        ]
    }, 
    class About extends Adw.PreferencesPage {
        constructor(settings) {
            super({});

            this._name.label = Me.metadata.name.toString();
            this._version.label = Me.metadata.version.toString();
            this._author.label = Me.metadata['original-author'].toString();
            this._description.set_subtitle(Me.metadata.description.toString());
            
        };
    }
);