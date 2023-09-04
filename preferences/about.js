'use strict';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js'

import Gio from 'gi://Gio'
import GLib from 'gi://GLib';
import Adw from 'gi://Adw'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'
import Gdk from 'gi://Gdk'

import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'

const About = GObject.registerClass({
    GTypeName: 'About'
},
class About extends d2dprefsspage{

    constructor(settings,metadata){
        super(settings)

        this._settings = settings

        // Set headerbar page info
        this.title = _('About')
        this.icon_name = 'help-about-symbolic'
        

        // Project Logo, title, description
        const projectHeaderGroup = new Adw.PreferencesGroup()
        const projectHeaderBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: false,
            vexpand: false,
        })

        const projectImage = new Gtk.Image({
            margin_bottom: 5,
            icon_name: 'dash-to-dock',
            pixel_size: 100,
        })

        const projectTitleLabel = new Gtk.Label({
            label: _('Dash to Dock'),
            css_classes: ['title-1'],
            vexpand: true,
            valign: Gtk.Align.FILL,
        })

        const projectDescriptionLabel = new Gtk.Label({
            label: 'A dock for the Gnome Shell.',
            hexpand: false,
            vexpand: false,
        })
        projectHeaderBox.append(projectImage)
        projectHeaderBox.append(projectTitleLabel)
        projectHeaderBox.append(projectDescriptionLabel)
        projectHeaderGroup.add(projectHeaderBox)

        this.add(projectHeaderGroup)
        
        // details

        const details = new Adw.PreferencesGroup()
        this.add(details)

        const versionRow = new Adw.ActionRow({
            title: _('Dash to Dock Version')
        })
        details.add(versionRow)
        versionRow.add_suffix(new Gtk.Label({
            label: metadata.version.toString(),
            css_classes: ['dim-label']
        }))
        
        const gnomeVersionRow = new Adw.ActionRow({
            title: _('Gnome Version')
        })
        details.add(gnomeVersionRow)
        gnomeVersionRow.add_suffix(new Gtk.Label({
            label: Config.PACKAGE_VERSION.toString(),
            css_classes: ['dim-label']
        }));

        const osRow = new Adw.ActionRow({
            title: _('OS Name')
        })
        details.add(osRow)
        const name = GLib.get_os_info('NAME')
        const prettyName = GLib.get_os_info('PRETTY_NAME')

        osRow.add_suffix(new Gtk.Label({
            label: prettyName ? prettyName : name,
            css_classes: ['dim-label']
        }))

        const windowVersionRow = new Adw.ActionRow({
            title: _('Windowsing System')
        })
        details.add(windowVersionRow)
        windowVersionRow.add_suffix(new Gtk.Label({
            label: GLib.getenv('XDG_SESSION_TYPE') === 'wayland' ? 'Wayland' : 'X11',
            css_classes: ['dim-label']
        }))


        // Links
        const websiteLinkRow = new Adw.ActionRow({
            title: _('Website'),
            activatable: true
        })
        websiteLinkRow.connect('activated', () => {
            Gtk.show_uri(this.get_root(), metadata.url, Gdk.CURRENT_TIME)
        })

        const sourceLinkRow = new Adw.ActionRow({
            title: _('Source code'),
            activatable: true
        })
        sourceLinkRow.connect('activated', () => {
            Gtk.show_uri(this.get_root(), 'https://github.com/micheleg/dash-to-dock', Gdk.CURRENT_TIME)
        })

        // link row stuff
        const linkImage = new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER
        })
        websiteLinkRow.add_suffix(linkImage)
        sourceLinkRow.add_suffix(linkImage)
        details.add(websiteLinkRow)        
        details.add(sourceLinkRow)

        
        return this
    }
})

export { About }