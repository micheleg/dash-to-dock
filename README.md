# Dash to Dock
### A Gnome Shell extension that transforms the dash into an intellihide dock.

The Gnome Shell *Dash* indicates currently running applications and acts as an optional quick launch and favourites facility. By default the Dash is shown only in the *Overview*. This extension moves the dash out of the overview transforming it in a dock that allows  an easier launching of applications and a faster switching between windows without having to leave the desktop view.

![screenshot](https://github.com/micheleg/dash-to-dock/raw/master/screenshots/screenshot.jpg)

The dock supports **intellihide/dodge** and **autohide** modes. In addition the following customization options and features have been added to the default dash:

1. Customization of the **maximum icon size**.
2. Customization of the vertical position and alignment.
3. Option to show only favourites or running applications.
4. Possibility to **switch workspace by scrolling** over the dock.
5. Optional **custom actions when clicking** on a running application icon: **minimize window**, **cycle through application windows**, or **launch new window**. Optional **minimize windows on Shift+click* (Shift+double click to close all the windows of the application.
6. Support for showing indicators of the number of windows for each application. This function has to be supported by the theme used. In the screenshot above an extended Adwaita theme is uses (see section below).

Many options can be tweaked and tuned (see section below). The extension supports **multi-monitor** configurations, **rtl languages**, **accessibility** via Ctrl-Alt-Tab shortcut, **localization** and it is **theme-friendly**. 

## Installation
### Gnome Shell 3.4 and above
The easiest and suggested way to install and keep the extension updated is through the official [Gnome Shell Extension site](https://extensions.gnome.org/extension/307/dash-to-dock/). The installation process is straightfoward. The extension can then be enabled and disabled through the same site or with *gnome-tweak-tool*.

### Gnome Shell 3.2
Due to incompatibilities between different Gnome Shell versions, the Gnome Shell 3.2 version uploaded on the extension site is outdated. An more updated version with almost the feautures of the master version can be downloaded from the [download section](https://github.com/micheleg/dash-to-dock/downloads) in the form of a *zip archive*. The extension can be installed by means of *gnome-tweak-tool*. 

You can alos manually install the extension by direcly extractig the *zip archive*. Create a directory named <code>dashtodock@micxgx.gmail.com</code> inside <code>/home/user/.local/share/gnome-shell/extensions/</code> and extract the archive content there. Shell reload can be required <code>Alt+F2 r Enter</code>. The extension can be enabled with *gnome-tweak-tool* or with *dconf* by adding 'dashtodock@micxgx.gmail.com' to the <code>/org/gnome/shell/enabled-extensions</code> key.

### Installation from source
The extension can be installed directly from source. Use the master branch for Gnome Shell 3.4 or the gnome-3.2 branch for Gnome Shell 3.2. A simple Makefile is included. Run 
<pre>make
make install
</pre>
to install the extension in your home directory. A Shell reload is required <code>Alt+F2 r Enter</code> and the extension has to be enabled  with *gnome-tweak-tool* or with *dconf*.

As an alternative the zip archive can be generated with 
<pre>
make
make zip-file
</pre>
Then follow the above instructions for Gnome Shell 3.2.

## Settings
### Gnome Shell 3.4 and above
The extension can be extensively configured by means of *gnome-shell-extension-prefs*. clicking the configure button on the extension page next to the enable/disable button or running <code>gnome-shell-extension-prefs</code> in a console. To open the Dash to Dock settings directly run 
<pre>
gnome-shell-extension-prefs dash-to-dock@micxgx.gmail.com
</pre>

![Settings window 1](https://github.com/micheleg/dash-to-dock/raw/master/screenshots/settings1.png)
![Settings window 2](https://github.com/micheleg/dash-to-dock/raw/master/screenshots/settings2.png)

### Gnome Shell 3.2
In Gnome Shell 3.2 the extension configuration although not difficult requires to modify the source code. Settings are both in <code>intellihide.js</code> and in<code>dockedDash.js</code> inside the installation directory <code>/home/user/.local/share/gnome-shell/extensions/</code>. At the top of these files there is a settings section with uppercase variables that can be easily set as preferred. They are mostly true/false variables and there are brief descriptions of the effect of each setting. Shell reload is required <code>Alt+F2 r Enter</code> after settings change.


#### Multi-monitor configuration
The extension support multi-monitor configurations. By default the dock is shown on the primary monitor that is the monitor where the overview an panel are shown, but the extension can be configured to show the dock on another monitor. If the dock is set to be shown on an external monitor, the dock position is automaticaly updated whenever the monitor is attached or removed: when the selected monitor is not attached the dock is shown on the primary monitor.

## Theming
The extension aims to be as **theme-friendly** as possible. The dock appearence is inherited from the default dash so basic theme support is always granted. However, some features has to be direclty supported by the theme. 

The following themes are known to support Dash to Dock extension:
 * An **extended Adwaita**, the default theme, can be found in the download section (https://github.com/downloads/micheleg/dash-to-dock/adwaita-dashtodock.zip). The theme appearence is shown in the above screenshot. 
 * **LittleBigMod 2nd**, http://gnome-look.org/content/show.php/?content=152088
 * **Energreen_Suiteby**  by Astral-1, http://astral-1.deviantart.com/art/Energreen-Suite-321855454
 
Adding support for the Dash to Dock extension to a theme is easy: the dash is put inside a container actor named <code>#dashtodockContainer</code> so the extended dash can be targeted without conflicting with the default dash. There is some additional css classes that theme writers can exploit in order to support the extension better:

 * <code>.running1</code>, <code>.running2</code>, <code>.running3</code>, <code>.running4</code>: like the default .running style but based on the number of windows of the application. The <code>.running4</code> class targets 4 and more windows. All classes are applied to the *app-well-app* actors.
 * <code>.focused</code>: applied to the <code>.app-well-app</code> actor of the currently focused application.
 * <code>.extended</code>: applied to the <code>#dashtodockContainer</code> actor when the dock height is extended to the whole vertical space.

Below is a css code snippet showing how the dock can be customized

```css
/* Add Dash to Dock Support */

/* Shrink the dash by reducing padding and border radius */
#dashtodockContainer #dash {
    padding: 1px 0px;
    border-radius: 0px 6px 6px 0px;
}

/* rtl support*/
#dashtodock #dash:rtl {
    border-radius: 6px 0px 0px 6px;
}

#dashtodockContainer .app-well-app {
   background-size: contain;
   padding: 1px 2px;
}

#dashtodockContainer.extended #dash {
    border:0;
    border-radius: 0;
}

/* Running and focused application style */

/* Remove default running style */
#dashtodockContainer .app-well-app.running > .overview-icon {
	background-image: none;
}

#dashtodockContainer .app-well-app.focused > .overview-icon {
    transition-duration: 250;
    background-gradient-start: rgba(255, 255, 255, .05);
    background-gradient-end: rgba(255, 255, 255, .15);
    background-gradient-direction: vertical;
    border-radius: 4px;
    box-shadow: inset 0px 1px 2px 0px rgba(0, 0, 0, 1);
}

#dashtodockContainer:ltr .running1 {
    background-image: url('one.svg');
}

#dashtodockContainer:rtl .running1 {
    background-image: url('one_rtl.svg');
}

#dashtodockContainer:ltr .running2 {
    background-image: url('two.svg');
}

#dashtodockContainer:rtl .running2 {
    background-image: url('two_rtl.svg');
}

#dashtodockContainer:ltr .running3 {
   background-image: url('three.svg');
}

#dashtodockContainer:rtl .running3 {
    background-image: url('three_rtl.svg');
}

#dashtodockContainer:ltr .running4 {
    background-image: url('four.svg');
}

#dashtodockContainer:rtl .running4 {
    background-image: url('four_rtl.svg');
}
```
## Localization
Localization is supported via *gettext*. The translatable strings are contained in the file <code>./po/dashtodock.pot</code> that is generated by the command:
<pre>
make potfile
</pre>
This file can be used to generate the po translation file for a specific language either with <code>msginit</code> or with a GUI tool such as *poedit* or *Gtranslator*.

Po files for already translated languages are found in the po directory. When the translatable strings change the command
<pre>
make mergepo
</pre>
can be used to update all po files before updating translations.

If you want to contribute, just send me the updated or new po file for your language. You can get in touch with me with a bug report either on github or on the extension site or even directly by mail (micxgx@gmail.com).

## Known Issues
 * Missing padding for dekstop icons with Nautilus show desktop enabled. See [Issue 17] (https://github.com/micheleg/dash-to-dock/issues/17).
 * In multimonitor configuration when the dock is hidden it slides in the adjacent monitor if any is present. Although the dock is not visible it still steals mouse clicks from other windows.

## Bug Reporting
If you experienced a bug please report it by opening an isssue on github or with a bug report message in the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/). Your help is very appreciated.

Please provide as many details as possible and all the steps to reproduce the bug. Include the following information:
 * Extension version
 * Gnome Shell version
 * Linux distribution and version
 * Whether you have a multi-monitor configuration
 * Your settings: include the output of the command <code>dconf dump /org/gnome/shell/extensions/dash-to-dock/</code>.

Before reporting a bug:
 * Check if the bug persists disabling all other extensions. If not, try to find the conflicting extension by enabling each extension one at a time.
 * Check if there are any relevant errors in Looking Glass (<code>ALt-F2 lg</code>, error panel).
 * Reload the shell by typing in a terminal (as normal user) <code>gnome-shell --replace</code> and look for relevant output in that terminal when the bug appears. 
 * Try to reset the extension settings to their default values with the command <code>dconf reset /org/gnome/shell/extensions/dash-to-dock/</code>

## Change log

Version numbering follows the uploads to the extension website.

**Version 18 (13-11-2012)**
  * Rebase the dash code adding the application button

**Version 17 (23-10-2012)**
 * First Gnome Shell 3.6 only release
 * Update to 3.6 API fixing a couple of bugs

**Version 16 (19-10-2012)**
 * Correct syntax error in the previous version

**Version 15 (19-10-2012)**
 * Initial Gnome Shell 3.6 support: just make the extension load

**Version 14 (04-09-2012)**
 * Extend app icons with running and focused indicators (require supporting theme)
 * Add customization of click action
 * Rework vertical positioning: drop uncentered alignment and add an experimental extended mode
 * Bug fixing

**Version 13 (14-08-2012)**
 * bug fixing for multimonitor support

**Version 12 (12-08-2012)**
 * RTL languages support.
 * Add Application based intellihide.
 * Minor improvements to the switch workspace on scroll feature.
 * Bug fixing.

**Version 11 (22-07-2012)**
 * Allow to choose the monitor where the dock is shown.
 * Enable dash accessibility via ctrlAltTab.
 * Directly customize the dash background opacity.

**Version 10 (09-07-2012)**
 * Option to center the dock vertically.
 * Option to increase the maximum dock height.
 * Settings GUI overhaul.

**Version 9 (24-06-2012)**
 * Basic Bolt extensions support.
 * Bug fixing.

**Version 8 (23-06-2012)**
 * Gnome Shell 3.4 only release.
 * Greatly improve multimonitor support.
 * Improve intellihide efficiency.
 * Improve autohide.
 * Improve settings GUI.
 * Add swith workspace on scroll feature.
 * Option to control the maximum icon size.
 * Option to show favorites and/or running application icons.
 * Bug fixing.

**Version 7 (12-06-2012)**
 * Gnome Shell 3.2 only release, last version supporting 3.2.
 * Greatly improve multimonitor support.
 * Bug fixing.

**Version 6 (03-06-2012)**
 * Bug fixing.

**Version 5 (02-06-2012)**
 * Move settings to a gschema for Gnome Shell 3.4.
 * Add settings GUI form Gnome Shell 3.4.
 * Minor improvements.

**Version 4 (29-05-2012)**
 * Minor improvements.
 * Bug fixing.

**Version 3 (23-05-2012)**
 * Basic theme indipendece.
 * Intellihide/autohide settings.
 * Minor improvements.
 * Bug fixing .

**Version 2 (20-05-2012)**
* Inline timing settings.
* Bug fixing.

**Version 1 (12-05-2012)**
* Initial release.
* Basic intellihide functionality.

## License
Dash to Dock Gnome Shell extension is distributed under the terms of the GNU General Public License,
version 2 or later. See the COPYING file for details.

## Donations

You can

<a href="http://flattr.com/thing/1047592/" target="_blank">
<img src="http://api.flattr.com/button/flattr-badge-large.png" alt="Flattr this" title="Flattr this" border="0" /></a>

or 

<a href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=3S5HFFG2BWGPL" target="_blank">
<img src="https://www.paypalobjects.com/en_US/GB/i/btn/btn_donateCC_LG.gif" alt="PayPal — The safer, easier way to pay online."/></a>
