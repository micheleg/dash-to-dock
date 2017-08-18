# A Ubuntu Dock for the GNOME Shell
This extension enhances the dash moving it out of the overview and transforming it in a dock for an easier launching of applications and a faster switching between windows and desktops without having to leave the desktop view.

For installation instructions and more information visit [https://github.com/micheleg/dash-to-dock/tree/ubuntu-dock/](https://github.com/micheleg/dash-to-dock/tree/ubuntu-dock/).

This dock is a fork of the original [Dash to Dock](https://github.com/micheleg/dash-to-dock/) (master Branch) extension for GNOME. The original extension was very powerful, but we wanted a simpler, more integrated experience for general Ubuntu users. You can install the original extension for more (but not officially supported) features.

## Installation from source

The extension can be installed directly from source, either for the convenience of using git or to test the latest development version. Clone the desired branch with git

<pre>git clone -b ubuntu-dock https://git@github.com/micheleg/dash-to-dock.git --single-branch</pre>
or download the 'ubuntu-dock' branch from github. A simple Makefile is included.

Then run
<pre>make
make install
</pre>
to install the extension in your home directory. A Shell reload is required <code>Alt+F2 r Enter</code> and the extension has to be enabled  with *gnome-tweak-tool* or with *dconf*. Of course, Ubuntu 17.10 and up have the extension pre-installed.

## A note on Settings
You may notice that this release is very similar to the original [Dash to Dock](https://github.com/micheleg/dash-to-dock/) but with less features, no settings panel, and different defaults. This is on purpose, because we wanted to bring a simpler dock experience into GNOME Shell for Ubuntu users, and we didn't want to expose all of the settings that the original Dash to Dock had.

Some settings will be available through an add-on to the Settings program for Ubuntu, but not all. For those who do want all the available options, the original Dash to Dock extension is fully compatible with this dock. Simply install it from [GNOME Extensions](https://extensions.gnome.org/extension/307/dash-to-dock/) like normal.

## Bug Reporting

Bugs should be reported to the Github bug tracker for the original Dash to Dock extension at [https://github.com/micheleg/dash-to-dock/issues](https://github.com/micheleg/dash-to-dock/issues).

## License
Ubuntu Dock Gnome Shell extension is distributed under the terms of the GNU General Public License,
version 2 or later. See the COPYING file for details. This extension is based on the original [Dash to Dock](https://github.com/micheleg/dash-to-dock/).

## Donations

You can donate to the original [Dash to Dock](https://github.com/micheleg/dash-to-dock) extension at:

<a href="http://flattr.com/thing/1047592/" target="_blank">
<img src="http://api.flattr.com/button/flattr-badge-large.png" alt="Flattr this" title="Flattr this" border="0" /></a>

<a href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=3S5HFFG2BWGPL" target="_blank">
<img src="https://www.paypalobjects.com/en_US/GB/i/btn/btn_donateCC_LG.gif" alt="PayPal — The safer, easier way to pay online."/></a>

You can donate to [Ubuntu](https://ubuntu.com/) at:

<a href="https://www.ubuntu.com/download/desktop/contribute" target="_blank">Ubuntu Donations / Contribute</a>
