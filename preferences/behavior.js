// behavior.js
'use strict'
// Import dependencies
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'
import Adw from 'gi://Adw'
import Gtk from 'gi://Gtk'
import GObject from 'gi://GObject'
import { d2dprefsspage } from '../conveniences/d2dprefsspage.js'

// register Behavior Page
const Behavior = GObject.registerClass({
    GTypeName: 'Behavior'
}, class Behavior extends d2dprefsspage {
    constructor(settings) {
        super(settings)

        this._settings = settings
        // Set page Title and icon
        this.title = _('Behavior')
        this.icon_name = 'general-symbolic'

        // ## keyboardGroup
        const keyboardGroup = new Adw.PreferencesGroup({
            title: _('Keyboard shortcuts')
        })
        this.add(keyboardGroup)

        // keyboardGroup.add(this._toggleRow(
        //     'multi-monitor',
        //     _('use keyboard shortcuts to activate apps')
        // ))

        keyboardGroup.add(this._toggleRow(
            'hot-keys',
            _('use keyboard shortcuts to activate apps'),
            _('Launch and switch between dash items using Super+(0-9)')
        ))

        // Aplication number shortcut group
        const ANSGroup = new Adw.PreferencesGroup({
            title: _('Aplication Number Shortcut')
        })
        this.add(ANSGroup)

        // ANSGroup.add(this._toggleRow(
        //     'hot-keys',
        //     _('Super Hot-Keys'),
        //     _('Launch and switch between dash items using Super+(0-9)')
        // ))
        ANSGroup.add(this._toggleRow(
            'hotkeys-overlay',
            _('Number overlay'),
            _('The dock will be quickly shown so that the number-overlay is visible and app activation is easier')
        ))

        ANSGroup.add(this._toggleRow(
            'hotkeys-show-dock',
            _('Show the dock when using the hotkeys'),
            _('The dock will be quickly shown so that the number-overlay is visible and app activation is easier')
        ))

        ANSGroup.add(this._inputRow(
            'shortcut-text',
            _('Shortcut key'),
            _('Syntax: <Shift>,<Ctrl>,<Alt>,<Super>')
        ))

        ANSGroup.add(this._spinBTNRow(
            'shortcut-timeout',
            new Gtk.Adjustment({
                lower: 0,
                upper: 10000,
                step_increment: 250,
                page_increment: 3,
                page_size: 0
            }),
            _('Hide timeout')
        ))

        // ## mouseGroup
        const mouseGroup = new Adw.PreferencesGroup({
            title: _('Mouse Actions')
        })
        this.add(mouseGroup)

        const clickActionArray = [
            _('Raise window'),
            _('Minimize'),
            _('Launch new instance'),
            _('Cycle through windows'),
            _('Minimize or overview'),
            _('Show window previews'),
            _('Minimize or show previews'),
            _('Focus or show previews'),
            _('Focus or app spread'),
            _('Focus, minimize or show previews'),
            _('Focus, minimize or app spread'),
            _('Quit application')
        ]

        // click action
        mouseGroup.add(this._listRow(
            'click-action',
            clickActionArray,
            _('Action when clicking on a running app'),
            _('Set the action that is executed when clicking on the icon of a running application')
        ))
        // Shift+click action
        mouseGroup.add(this._listRow(
            'shift-click-action',
            clickActionArray,
            _('Action when shift+clicking on a running app'),
            _('Set the action that is executed when shift+clicking on the icon of a running application')
        ))
        // Middle-click action
        mouseGroup.add(this._listRow(
            'middle-click-action',
            clickActionArray,
            _('Action when clicking on a running app'),
            _('Set the action that is executed when middle-clicking on the icon of a running application')
        ))
        // Shift+Middle-click action
        mouseGroup.add(this._listRow(
            'shift-middle-click-action',
            clickActionArray,
            _('Action when clicking on a running app'),
            _('Set the action that is executed when shift+middle-clicking on the icon of a running application')
        ))

        // mouseScrollGroup
        const mouseScrollGroup = new Adw.PreferencesGroup()
        this.add(mouseScrollGroup)

        // scroll action
        mouseScrollGroup.add(this._listRow(
            'scroll-action',
            [
                _('Do noting'),
                _('Cycle trough windows'),
                _('Switch workspace')
            ],
            _('Scroll action'),
            _('Set the action that is executed when scrolling on the application icon')
        ))

        return this
    }
})

export { Behavior }