'use strict';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import Gio from 'gi://Gio'
import Adw from 'gi://Adw'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'

import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'
import { MonitorsConfig } from '../conveniences/monitorsconfig.js'
import { autoHidePageClass } from './_autohide.js'

const General = GObject.registerClass({
    GTypeName: 'General'
},
class General extends d2dprefsspage{
    constructor(settings,extPrefs){
        super(settings)
        this._settings = settings
        this._monitorsConfig = new MonitorsConfig()

        // Set headerbar page info
        this.title = _('General')
        this.icon_name = 'dash-symbolic'
        
        // ## Position preferences group
        const PosGroup = new Adw.PreferencesGroup({
            title: _('Position'),
            description: _('General position of the dock'),
        })
        this.add(PosGroup)
    
        // Dock Monitor Position
        const monitorSelector = new Adw.ActionRow({
            title: _('Show the dock on')
        })
        PosGroup.add(monitorSelector)

        const monitorSelectorList = new Gtk.ComboBoxText({
            valign: Gtk.Align.CENTER
        })
        monitorSelectorList.selected = this._settings.get_enum('dock-position')

        // monitorSelectorList.append('1',_('some translatebale item 1'))

        for (const monitor of this._monitorsConfig.monitors) {
            monitorSelectorList.append(monitor.index, monitor.displayName)
        }
        // this._monitors.forEach((value) => {
        //     monitorSelectorList.append(value.index, value.displayName)
        // })


        monitorSelector.add_suffix(monitorSelectorList)

        this._monitorsConfig.connect('updated',
            () => this._updateMonitorsSettings())
        this._settings.connect('changed::preferred-monitor',
            () => this._updateMonitorsSettings());
        this._settings.connect('changed::preferred-monitor-by-connector',
            () => this._updateMonitorsSettings());


        // Multi monitor toggle
        PosGroup.add(this._toggleRow(
            'multi-monitor',
            _('Show on all monitors')
        ));

        // Dock Screen Position
        PosGroup.add(this._listRow(
            'dock-position',
            [
                _('Top'),
                _('Right'),
                _('Bottom'),
                _('Left')
            ],
            _('Position on screen')
        ))

        // ## auto hide preferences group
        const AHGroup = new Adw.PreferencesGroup({
            title: _('Auto hide')
        })
        this.add(AHGroup)
    
        // Inteligent autohide
        const autoHideRow = new Adw.ActionRow({
            title: _('Inteligent autohide'),
            subtitle: _('Hide the dock when it obstrucs a windows of the current appliation.'),
            activatable: true
        })
        AHGroup.add(autoHideRow)

        autoHideRow.connect('activated', () => {
            this._autoHidePopup = new Adw.PreferencesWindow({
                title: _('Intelligent autohide customization'),
                transient_for: this.get_root(),
                defaultWidth: 380,
                defaultHeight: 460
            })

            this._autoHidePopup.set_search_enabled(false)
            this._autoHidePopup.add(new autoHidePageClass(settings))
            this._autoHidePopup.present()
        })

        const goNextImage = new Gtk.Image({
            gicon: Gio.icon_new_for_string('go-next-symbolic'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        })
        autoHideRow.add_suffix(goNextImage)

        // ## Dock scale and size group
        const sizeGroup = new Adw.PreferencesGroup({
            title: _('Dock scale and size')
        })
        this.add(sizeGroup)


        // dock size limit
        // Panel mode: extent to the screen edge
        const pannelMode = this._expandRow(
            'extend-height',
            _('Panel mode'),
            _('Extent dock to the screen edge')
        )
        // Put show Aplications in a doc edge when using pannel mode
        pannelMode.add_row(this._toggleRow(
            'show-apps-always-in-the-edge',
            _('Move edge of the dock'),
            _('Show application button on the edge when using centered panel mode')
        ))
        pannelMode.add_row(this._toggleRow(
            'show-apps-at-top',
            _('Move at biginning of the dock'),
            _('Show application button on the other side of the dock')
        ))
        // Place icons tot the center
        pannelMode.add_row(this._toggleRow(
            'always-center-icons',
            _('Place icons tot the center')
        ))
        sizeGroup.add(pannelMode)

        // icon side limt
        // fix icon size: scroll to reveal other icons
        sizeGroup.add(this._toggleRow(
            'icon-size-fixed',
            _('fix icon size'),
            _('scroll to reveal other icons')
        ))

        // preview scale
       
        return this
    }
})

export { General }