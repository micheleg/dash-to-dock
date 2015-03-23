---
layout: post
title: "v42: updated version for GNOME Shell 3.16"
author: Michele
date: Mon 23 Mar 20:21:06 GMT 2015
category: Release
---

A new extension version (v42) is available. This version introduces support for GNOME Shell 3.16.

<!--more-->

As anticipated in a [previous post]({% post_url 2015-03-01-approaching-gnome-3.16 %}), the port to GNOME 3.16 has been a quite straightforward process. No big changes have been introduced in this version, while few details have been adapted following the upstream changes.

The dropping of the message tray in which has been integrated into the calendar and moving of the notifications on the top side greatly improved the integration of dash-to-dock out of the box even when when placed on the bottom of the screen. However, the legacy tray is no "in the way" on the bottom left corner. Keeping the maximum dash size below 90% is suggested, while for people using the dock in extended vertical mode the installation of the [topicon extension](https://extensions.gnome.org/extension/495/topicons/) might be a better option.

<a href="/media/v42.jpg"><img
src="/media/v42.jpg" alt="Dash to dock v42 screenshot, GNOME Shell 3.16" class="center"></a>

On the aesthetic side, the default theme follow the new blue-grey style of Adwaita 3.16. This might be welcome or not, but any customisation is easily achievable and and is left to [theme developers]({{ relative }}/theming.html).

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions. 

**Release notes**

* Port to GNOME Shell 3.16 [88ed572].
* Fix icon size calculation with unequal vertical/horizontal icons padding [d12e710].

