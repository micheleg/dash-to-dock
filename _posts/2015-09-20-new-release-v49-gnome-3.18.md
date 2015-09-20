---
layout: post
title: "v49: new version introducing support for GNOME Shell 3.18"
author: Michele
date: Sun 20 Sep 15:16:06 BST 2015

category: Release
---

A new version of Dash to Dock (v49) supporting GNOME Shell 3.18 is now available. Beside the update to the forthcoming GNOME release, this version contains a couple of bug-fixes and a new intellide option.

<!--more-->

This version introduces support for the [forthcoming GNOME Release](https://help.gnome.org/misc/release-notes/3.18/). The main changes are related to the intellihide heuristics in application-based dodge windows mode:

* The dock is hidden when half-maximized and fully maximized windows are overlapping with the dock, regardless of them being focused or not.
* Similar, with mutliple screens, the topmost window on the dock screen is always kept visible, avoiding to slide in and out the dock at each focus change between the tow monitors.

Moreover, a new option is now available ((*only maximized windows*)) from the intellihide settings panel, which hides the dock only when there is a maximized window.

<a href="/media/v49_new_intellihide_settings.jpg"><img
src="/media/v49_new_intellihide_settings.jpg" alt="New intellihide settings" class="center"></a>

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

If yuo are running the development version (3.17), you can [disable the version check](https://www.maketecheasier.com/disable-extension-version-checks-gnome/) or change the version in the *metadata.json* file.

Versions for Gnome Shell 3.14 and 3.16 with backported intellihide tweaks will follow soon.

**Release notes**

* Port to GNOME Shell 3.18 [788fc6, 4eadd6].
* Update Italian and French translations [bd0adb, 1b3473].
* Improve intellihide heuristics  [62b836, acf12a, 4eabe6, eca036].
* Bugfix: skip nautilus desktop window in the quit menu [13d9fe].
* Bugfix: prevent errors when updating minimize targets [8d5415].
