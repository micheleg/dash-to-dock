---
layout: post
title: "v56: new release available"
author: Michele
date: Sun  5 Feb 16:11:07 GMT 2017

category: Release
---

A new version of Dash to Dock (v56) is available, supporting GNOME Shell 3.18, 3.20 and 3.22. This release contains new long required features as well as bugfixes, in particular Wayland related.

<!--more-->

Few long required features have been implemented in this release.

### Windows previews (thumbnails)
Windows previews can now optionally be displayed in place of the windows list in the application popup menu,  similar to Microsoft Windows behaviour. At the moment the previews submenu is closed by default and opened on click. Few people have asked for the menu to be open by default, or the windows previews to be shown on mouse over. This will be considered for future releases.

<a href="/media/v56_windows_previews.jpg">
<img src='/media/v56_windows_previews.jpg' alt="Windows previews functionality" class="center"/></a>

Moreover, even with normal windows list, the popup menu maximum width is now limited, avoiding issues with very long window titles.

### Keyboard shortcuts 
Optional keyboard shortcuts are now available to launch and interact with application windows, thanks to the implementation by [franglais125](https://github.com/franglais125). Application launchers can be now activated with <code>&lt;Super&gt;1</code>..<code>&lt;Super&gt;0</code> shortcuts, following the order of appearance of the application launcher in the dock. The shortcut can be combined with the other keyboard modifiers, *e.g.* <code>&lt;Ctrl&gt;</code> and <code>&lt;Shift&gt;</code>. Further improvements are already being [developed]({{ site.github_project_url }}). 

### Cycle though windows by mouse scroll
The ability to cycle through open windows on mouse scroll has been asked for a long time. This behaviour is now available in the settings. Please note that it can conflict with the fixed-size/scrollable dock option. Thanks to [Gabriel Moreira](https://github.com/gabrielmoreira).

### Wayland support
Wayland is starting to replace X for more users and users, a couple of bugs affecting Wayland sessions have been fixed.

### Windows border customization
[gayanper](https://github.com/gayanper) has implemented an additional option to tweak the dock border style. This might be useful to fix the appearence of the dock with third parties themes.


As usual, the extension can be installed from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

**Release notes**

* Implement windows previews in the apps menu [446c8efe, e6598572, ce277ec6, a2132cf0, 4f1fb1af, 3a214e7f, 28cb2778, f6becc9c, 9e76b4bc]
* Add hotkeys option [franglais125: 938702ee].
* Add border style customization [71daa570].
* Autohide: the whole screen edge sensitive [39041f4f].
* Improve Wayland support [d553004e, 28c932d6].
* Add cycle through windows on scroll option [Gabriel Moreria: 0040c2af].
* Fix: set popup menu max width [f6bad6135c].
* Make INSTALLBASE a bit more flexible, remove trailing whitespace [Jonathan Carter: e97640ad]
* Update Simplified Chinese, Polish, French, and Brazilian translations [shlinux: 570882aa, Piotr Sokół: fec97e24, Léo Andrès: d18f2d6c, Fábio Nogueira: e2ec48f5].



