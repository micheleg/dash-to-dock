# Dash to Dock for Pop!_OS's Cosmic
![screenshot](https://github.com/halfmexican/dash-to-dock-pop/blob/master/screenshot.jpg)


# Installation

Go to releases and download the code. A simple Makefile is included. Extract the file.

[<img src="https://micheleg.github.io/dash-to-dock/media/get-it-on-ego.png" height="100">](https://extensions.gnome.org/extension/5004/dash-to-dock-for-cosmic/)

or click above to download from gnome extensions
### Build Dependencies

To compile the stylesheet you'll need an implementation of SASS. Dash to Dock supports `dart-sass` (`sass`), `sassc`, and `ruby-sass`. Every distro should have at least one of these implementations, we recommend using `dart-sass` (`sass`) or `sassc` over `ruby-sass` as `ruby-sass` is deprecated.

By default, Dash to Dock will attempt to build with `sassc`. To change this behavior set the `SASS` environment variable to either `dart` or `ruby`.

```bash
export SASS=dart
# or...
export SASS=ruby
```
make sure you have gettext installed with

```bash
sudo apt install gettext
```

### Building

Next use `make` to install the extension into your home directory. A Shell reload is required `Alt+F2 r Enter` under Xorg or under Wayland you may have to logout and login. The extension has to be enabled  with *gnome-extensions-app* (GNOME Extensions) or with *dconf*.

```bash
make
make install
```

## License
Dash to Dock for Cosmic Gnome Shell extension is distributed under the terms of the GNU General Public License,
version 2 or later. See the COPYING file for details.
