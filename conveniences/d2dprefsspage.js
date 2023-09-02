import Adw from 'gi://Adw'
import GObject from 'gi://GObject';
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk'

const d2dprefsspage = GObject.registerClass({
    GTypeName: 'd2dprefsspage'
},class d2dprefsspage extends Adw.PreferencesPage{

    _toggleRow(title,subtitle,schmeaOBKJ){
        let row;
        if(subtitle == ''){
            row = new Adw.SwitchRow({
                title: title
            });
        }else{
            row = new Adw.SwitchRow({
                title: title,
                subtitle: subtitle,
            });
        }
        
        this._settings.bind(
            schmeaOBKJ, row, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        return row
    }

    _listRow(setting,items,title,subtitle = ''){
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
    
    constructor(settings){
        super()

        this._settings = settings

    }
})

export { d2dprefsspage }