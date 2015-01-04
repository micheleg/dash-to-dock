---
layout: post
title: "v36: new version released with bottom dock support"
author: Michele
date: Mon  5 Jan 16:58:01 GMT 2015
category: Release
---

A new extension version (v36) supporting GNOME Shell 3.14 is now available. This
release introduces support for alternative dock positioning, including the **bottom side** of the screen.

<!--more-->

An option for positioning the dock at the bottom of the screen has been one of
the most requested features since the initial development of this extension a couple of years ago.

I finally had the time to implement the positioning of the dock on all the different
sides of the screen, inspired by the work of people who forked this extension
([ozonos](https://github.com/ozonos/), [Simple Dock](extensions://https.gnome.org/extension/815/simple-dock/) )
and helped with the development ([itproject](https://github.com/itprojects/gnome-dock/commits/master)).


<a href="/media/screenshot_bottom_dock.jpg"><img
src="/media/screenshot_bottom_dock.jpg" alt="Screenshot of the extension with bottom dock settings" class="center"></a>

It's possible to place the dock also on the right or top
edge of the screen. These have to be considered experimental and unsupported:
although usable, not too much effort has beeen put in making the result
aesthetically pleasing. On the other hand, multimonitor and RTL languages support
should have been maintaned as well as any other features available in previous releases in both the default and bottom
positioning. However, due to the limited test in these conditions, bugs could be presents.
Please [report any issue]({{ relative }}/development.html#bugreporting) you experience.

As usual the new version can be installed from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/)
upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}).
See also the [alternative installation methods]({{ relative }}/download.html) for instructions.

As the dock in bottom position interferes with the currrent gnome-shell notification,
the use of an extension to move the nofifications (for instance [Panel OSD](https://extensions.gnome.org/extension/708/panel-osd/))
is recommanded waiting for the  [new notification system](https://wiki.gnome.org/Design/OS/Notifications/Redux)
which is expected to be implemented in GNOME 3.16.

<a href="/media/screenshot_settingsmenu.jpg"><img
src="/media/screenshot_settingsmenu.jpg" alt="Screenshot of the extension settings menu" class="right"></a>

Other than few bug fixes, the improvements of this version are a better use of the overview space and the
addition of a right menu on the showApps icon to directly access the extension settings, which has been
improved in the section related to the theme customization for a better integration with custom themes.

If possible, these features will be backported to GNOME 3.12: an experimental
branch  named bottom\_dock\_3.12 is available on [Github]({{ site.github_project_url }}).


**Release notes**

* New feature: bottom positioning of the dock. Top and right are available too.
* New feature: add popupMenu with extension settings to the showAppsIcon.
* Improvement: rework workaround for compatibility with 3.14 and 3.14.1 to improve interoperability with other extensions.
* Improvement: reserve space for the dock in the overview.
* Bug fixes: solves bug caused by wrong hover status reported on the dash actor.
* Bug fixes: scrolling workspace break show/hide animation #109
* Bug fixes: remove 1px margin between fixed dock and windows (track structs of the outer dash.actor instead of the inner dash._box).



