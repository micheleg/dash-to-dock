import Adw from 'gi://Adw'
import GObject from 'gi://GObject';
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk'
import Gdk from 'gi://Gdk'

const d2dprefsspage = GObject.registerClass({
    GTypeName: 'd2dprefsspage'
}, class d2dprefsspage extends Adw.PreferencesPage {

    _toggleRow(setting, title, subtitle = '') {
        let row = new Adw.SwitchRow({
            title: title,
            subtitle: subtitle,
        })

        this._settings.bind(
            setting, row, 'active',
            Gio.SettingsBindFlags.DEFAULT
        )

        return row
    }

    _toggleInvRow(setting, title, subtitle = '') {
        let row = new Adw.SwitchRow({
            title: title,
            subtitle: subtitle,
        })

        this._settings.bind(
            setting, row, 'active',
            Gio.SettingsBindFlags.INVERT_BOOLEAN
        )

        return row
    }

    _listRow(setting, items, title, subtitle = '') {
        const myListrowdata = new Gtk.StringList()

        items.forEach((value) => {
            myListrowdata.append(value)
        })

        const myListrow = new Adw.ComboRow({
            title: title,
            subtitle: subtitle,
            model: myListrowdata,
            selected: this._settings.get_enum(setting)
        })
        myListrow.connect('notify::selected', widget => {
            this._settings.set_enum(setting, widget.selected)
        })

        return myListrow
    }

    _expandRow(setting, title, subtitle = '') {
        const row = new Adw.ExpanderRow({
            title: title,
            subtitle: subtitle,
            expanded: true,
            showEnableSwitch: true
        })
        this._settings.bind(
            setting, row, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT
        )
        return row
    }

    _colorRow(setting, title, subtitle = '') {
        const row = new Adw.ActionRow({
            title: title,
            subtitle: subtitle,
        })
        const color = new Gtk.ColorButton({
            use_alpha: false,
            valign: Gtk.Align.CENTER
        })
        const readColor = new Gdk.RGBA()
        readColor.parse(
            this._settings.get_string(setting)
        )
        color.set_rgba(readColor)
        color.connect('notify::rgba', button => {
            const colorString = button.get_rgba().to_string()
            this._settings.set_string(setting, colorString)
        })
        row.add_suffix(color);
        return row
    }

    _spinBTNRow(setting,adjustment, title, subtitle = '') {
        const row = new Adw.ActionRow({
            title: title,
            subtitle: subtitle
        })

        const rowScale = new Gtk.SpinButton({
            adjustment: adjustment,
            // adjustment: new Gtk.Adjustment({
            //     lower: 0,
            //     upper: 10000,
            //     step_increment: 250,
            //     page_increment: 1,
            //     page_size: 0,
            // }),
            digits: 0,
            valign: Gtk.Align.CENTER
        })
        rowScale.set_value(this._settings.get_double(setting))
        rowScale.connect('value-changed', () => {
            this._settings.set_int(setting, rowScale.get_double())
        })
        // paddingScale.set_value(this._settings.get_int('button-padding'));
        // paddingScale.connect('value-changed', () => {
        //     this._settings.set_int('button-padding', paddingScale.get_value());
        // });
        row.add_suffix(rowScale)

        return row
    }

    _inputRow(setting, title, subtitle = '') {
        const row = new Adw.ActionRow({
            title: title,
            subtitle: subtitle
        })
        // const textBox = new Gtk.Text({
        const textBox = new Gtk.Entry({
            placeholderText: 'some text',
            valign: Gtk.Align.CENTER
        })

        this._settings.bind(
            setting, row, 'text',
            Gio.SettingsBindFlags.DEFAULT
        )

        row.add_suffix(textBox);

        return row
    }

    constructor(settings) {
        super()

        this._settings = settings
    }
})

export { d2dprefsspage }