---
layout: post
title: "v62: new release available introducing support for GNOME Shell 3.26"
author: Michele
date: Mon 25 Dec 16:01:09 GMT 2017
category: Release
---

A new version of Dash to Dock (v62) supporting GNOME Shell from 3.18 to 3.26 and introducing support for Ubuntu launchers notification badges and progress bars is available.

<!--more-->

### New feature: Ubuntu Unity launchers API

Following the collaboration with the Ubuntu Team, and in particular thanks to the work of [Andrea Azzarone](https://plus.google.com/u/0/+AndreaAzzarone), the dock now supports the unity launcher API as explained by [Didier Roche's post](https://didrocks.fr/2017/09/25/ubuntu-gnome-shell-in-artful-day-14/).

<a href="/media/v62_ubuntu_API.png"><img
src="/media/v62_ubuntu_API.png" alt="Unity launcher API support" class="center"></a>

These features are already available in Ubuntu dock which is included in Ubuntu 17.10. It is worth noting that although the API are supported by default on all platforms, they require explicit application support, that is they typically work in Ubuntu and its derivatives.

### New feature: dynamic transparency

Following the upstream design change introducing the dynamically transparent panel and thanks to the work of [Fran Glais](https://github.com/franglais125), a new feature to adapt the dock transparency has been introduced. Four modes are supported:

1. Default: nothing is changed, the dock background colour and transparency is controlled by the theme used.
2. Fixed:  Tte dock opacity can be controlled to a fixed static opacity level.
3. Dynamic: the dock transparency is set to either a transparent and an opaque state (customizable by the user) depending on the distance of the windows from the dock: the dock becomes opaque when windows are close or overlaping with the dock.
4. Adaptive: as dynamic, but the opacity levels are kept in sync with the top panel (In GNOME Shell 3.24 and before dynamic and adaptive are the same).

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) (upon review), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

**Release notes (v62)**

* New feature: implement dynamic transparency [franglais125: ef8ee93c, d0533418, 99d8e2d6, 5c81fb38, f9af5893, c1e1b8e3, 132de68d, 88a2c9c4, 81a93aeb, a8872313, 545286e4, de314e21, 4583248c, 225b51dd].
* New feature: implement Ubuntu Unity Launcher API (notifications and progress bar) [Andrea Azzarone: 5ef239de, 184b26b1, 8111665d, 8d2ee8d1, 8174ef18]
* Enhancement: make focused app highlight more prominent [68a6ede7]
* Update Tawainese [zerng07: b8ce545c], Serbian [Xabre: b8562126, 4f430509], Czech [Pavel: 78387686], Greek [Vangelis: 62342f71], French [Peter: 2f9379ef], Arabic [Ahmad: a6afd137], German [0f2c9498] translations.
