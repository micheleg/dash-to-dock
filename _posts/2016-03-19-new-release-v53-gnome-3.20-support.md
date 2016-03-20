---
layout: post
title: "v53: new version available supporting GNOME Shell 3.20"
author: Michele
date: Sun 20 Mar 13:20:53 GMT 2016

category: Release
---

A new version of Dash to Dock (v53) introducing support for GNOME Shell 3.20 is available. This release containing enhancements to the intellihide and minor bug-fixes is already updated on the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/). This version is also compatible with GNOME Shell 3.18.

<!--more-->

This version introduces support for the [upcoming GNOME Shell 3.20 release] (https://help.gnome.org/misc/release-notes/3.20/). In this cycle there have not been changes affecting the extension behaviour, therefore it has been possible to share the same codebase with the previous GNOME 3.18 release. Backported versions back to GNOME Shell 3.14 will be uploaded soon, but impatient people can already retrieve the updated code from the relevant branches on the [GitHub repository]({{ site.github_project_url }}).

The major changes in this version regard the intellihide behaviour. The machinery checking for the overlapping between the windows and the dock has been reworked going back to the original idea of tracking windows position and size changes directly rather than relying on indirect signals. This should makes the whole thing more reliable, in particular in certain side cases like windows being moved by custom shortcuts or with other not traditional windows as in the case of [on-screen keyboards](https://github.com/micheleg/dash-to-dock/issues/252), without any performance penalty.

Finally, an option to enable the autohide even with fullscreen windows has been added. This might be useful for instance [working with virtual machines](https://github.com/micheleg/dash-to-dock/pull/284).

<a href="/media/v53_autohide_in_fullscreen.jpg"><img
src="/media/v53_autohide_in_fullscreen.jpg" alt="New intellihide settings" class="center"></a>

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

If you are running the development version (3.19.9x), you can [disable the version check](https://www.maketecheasier.com/disable-extension-version-checks-gnome/) or add the version in the *metadata.json* file.

**Release notes**

* Introduce GNOME Shell 3.20 support [69c0527]
* Improvements to the intellihide [23d8463, 23d8463, 3989272, 8bd833f, 033a81b]
* Fix dock visibility on start with open overview [28978cf]
* Fix bug on pressure-threshold settings change [7a547d4]
* Add option to enable autohide in fullscreen [9161851, 63c6f9f]
* Fix dock input region tracking [700a4d0]
* Update Russian, Polish, Brazilian Portuguese, and French translations [b368801, 95cfd6f, 59bbb94, 12f319f]

