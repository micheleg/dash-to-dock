# Dash to Dock - app expose fork

## Fork info

This is a fork of _Dash to dock_.
Includes the option 'minimize or app overview' aka app-expose.
Basically it provides something like this: https://www.omgubuntu.co.uk/2014/03/minimize-click-launcher-option-ubuntu-14-04

Will try to keep it in sync with the original/upstream version.

### Install:

* Disable 'Dash to dock' extension. _(if installed, as this is a fork)_
* Terminal:
    * `cd ~/.local/share/gnome-shell/extensions/`
    * `git clone https://github.com/ggcode/dash-to-dock.git dash-to-dock-app-exopse@fork.localhost`
* _Not sure, if needed. But, just in case .. Close 'extensions manager' (gnome tweaks or https://extensions.gnome.org/local/)_
* Restart gnome session: Hit Alt-F2 -> Type the letter 'r' -> Hit _Enter_
* Enable extension 'Dash to dock - app expose'

### And then, what?
* Where is that new option? 
    * 'Dash to dock - app expose' Settings -> _Behaviour_ -> _Click action_: 'Minimize or overview app'
* How to use?
    * Open mutliple windows of the same app. Click on the icon of that app in the dash. Then again. _app expose view_. Click again. Cycle.
    * Open multiple windows of different apps and switch between those via the dash.
    * Close apps in _app expose_view_
    * Move apps between workspaces in _app expose_view_



### Updates:

* You know, git pull
    * `cd ~/.local/share/gnome-shell/extensions/dash-to-dock-app-exopse@fork.localhost`
    * `git pull`

## A dock for the GNOME Shell
This extension enhances the dash moving it out of the overview and transforming it in a dock for an easier launching of applications and a faster switching between windows and desktops without having to leave the desktop view.

For installation instructions and more information visit [https://micheleg.github.io/dash-to-dock/](https://micheleg.github.io/dash-to-dock/).

## Installation from source

The extension can be installed directly from source, either for the convenience of using git or to test the latest development version. Clone the desired branch with git

<pre>git clone https://github.com/micheleg/dash-to-dock.git</pre>
or download the branch from github. A simple Makefile is included. Then run
<pre>make
make install
</pre>
to install the extension in your home directory. A Shell reload is required <code>Alt+F2 r Enter</code> and the extension has to be enabled  with *gnome-tweak-tool* or with *dconf*.

## Bug Reporting

Bugs should be reported to the Github bug tracker [https://github.com/micheleg/dash-to-dock/issues](https://github.com/micheleg/dash-to-dock/issues).

## License
Dash to Dock Gnome Shell extension is distributed under the terms of the GNU General Public License,
version 2 or later. See the COPYING file for details.
