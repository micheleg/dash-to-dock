---
layout: post
title: "Problem opening settings in Ubuntu 17.04"
author: Michele
date: Sun 23 Apr 00:15:07 BST 2017
category: News
---

With the [announcement](https://insights.ubuntu.com/2017/04/05/growing-ubuntu-for-cloud-and-iot-rather-than-phone-and-convergence/) of Ubuntu dropping the Unity desktop in favor of upstream GNOME, plenty of people are trying GNOME Shell and Dash to Dock.
A number of people are experiencing a problem preventing them from opening the preferences dialog to access the settings. This can be fixed by the simple installation of the missing packages.

<!--more-->

The following is the error that has been reported [multiple](https://github.com/micheleg/dash-to-dock/issues/398) [times](https://github.com/micheleg/dash-to-dock/issues/480). I copy it here hoping for search engines crawlers to add it to their indexes.

<pre>
Error: Requiring Clutter, version none: Typelib file for namespace 'Clutter' (any version) no

Stack trace:
  @/home/steam/.local/share/gnome-shell/extensions/dash-to-dock@micxgx.gmail.com/convenience.js:8:7
  @/home/steam/.local/share/gnome-shell/extensions/dash-to-dock@micxgx.gmail.com/prefs.js:17:7
  Application<._getExtensionPrefsModule@resource:///org/gnome/shell/extensionPrefs/main.js:74:13
  wrapper@resource:///org/gnome/gjs/modules/lang.js:178:22
  Application<._selectExtension@resource:///org/gnome/shell/extensionPrefs/main.js:89:31
  wrapper@resource:///org/gnome/gjs/modules/lang.js:178:22
  Application<._onCommandLine@resource:///org/gnome/shell/extensionPrefs/main.js:243:17
  wrapper@resource:///org/gnome/gjs/modules/lang.js:178:22
  main@resource:///org/gnome/shell/extensionPrefs/main.js:399:5
  @&lt;main&gt;:1:49
</pre>

It turns out for some reason not all required dependencies are being installed in Ubuntu,  when manually installing GNOME shell or upon update to  Ubuntu 17.04.  The problem can be solved by simply installing some Clutter packages (gir1.2-clutter-1.0). The following terminal command should be enough:

<code>
sudo apt-get install gir1.2-clutter-1.0
</code>

If you are still experiencing the problem, feel free to file a bug on [GitHub](https://github.com/micheleg/dash-to-dock/issues/). Enjoy GNOME Shell, enjoy Dash to Dock!

