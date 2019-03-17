---
layout: post
title: "v66: new release available (introducing support for GNOME Shell 3.32)"
author: Michele
date: Sun 17 Mar 20:55:27 GMT 2019
category: Release
---

A new version of Dash to Dock (v66) introducing support for GNOME Shell 3.32 has been released.
<!--more-->


### How to get the new release

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) (upon review), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

This release introduces support the recently released [Gnome 3.32](https://www.gnome.org/news/2019/03/gnome-3-32-released/), and mainly a port to modern ES6 language features. As such, support for previous Gnome shell versions has been dropped. I will try to backports fixis and features (gnome-3.30 branch) as much as possible.

Notable changes are the addition of a  "Focus or Previews click action", which will show windows previews only when clicking on an already focused application and the removal of the removal of the adaptive transparency mode, as the upstram behaviour of the top panel has been reverted to be always opaque.


**Release notes (v66)**

* Marco Trevisan (Treviño):
    - Introducing support for Gnome Shell 3.32 and dropping support for previous versions.
    - appIcons: Add Focus or Previews click action

* Michele Gaio:
    - AppIconIndicators: fix invalid dominant css color for certain icons (e.g Slack)
    - Remove the Adaptive transparency mode.

* Jeremy Bicha
    - Update Polish translation.

* Adolfo Jayme Barrientos
    - Update Spanish and Portuguese translations

* Serdar Sağlam:
    - Update Turkish translation.
