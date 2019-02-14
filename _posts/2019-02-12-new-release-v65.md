---
layout: post
title: "v65: new release available (bug fixes and performance improvements)"
author: Michele
date: Tue 12 Feb 20:48:34 GMT 2019
category: Release
---

A new version of Dash to Dock (v65) supporting GNOME Shell from version 3.18 to 3.30
<!--more-->


### How to get the new release

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) (upon review), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

In this release there are few fixes and performance improvements (thanks in partcular to contributions by Ubuntu developers, see release notes below), while the only notable change is the behaviur of the windows previews (in the dedicated popup menu), now maintaining a stable order which seems a more intuitive then the previous behaviour.

**Release notes (v65)**
* Andrea Azzarone:
    - docking: Fix leaking signal connection
    - theming: Ensure _trackingWindows contains valid windows (#868)

* Daniel van Vugt:
    - Avoid repainting an unchanging dock.

* Marco Trevisan (Treviño):
    - dash, docking: remove Shell.GenericContainer.

* Michele Gaio:
    - Add a .default class to the appiconindicators.
    - Make window previews order stable in the dedicated popup.
    - Recreate windows preview whenever the popup is open.
    - Fix for border radius with adaptive/dynamic opacity.

* Rúben Lopes:
    - Update Portuguese translation (#878)

* Serdar Sağlam:
    - Update tr.po

* vantu5:
    - Update Russian translation.