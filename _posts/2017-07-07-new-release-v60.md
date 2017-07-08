---
layout: post
title: "v60: new release available"
author: Michele
date: Sat  8 Jul 19:21:48 BST 2017
category: Release
---

A new version of Dash to Dock (v60) is available, introducing a dedicated windows thumbnails popup menu and monitor isolation. This release supports all recent of GNOME Shell releases (3.18, 3.20, 3.22 and 3.24)

<!--more-->

The most notable feature introduced in this release, thanks to the work of [Franglais125](https://github.com/franglais125) and inspired by the [dash-to-panel project](https://github.com/jderose9/dash-to-panel), is an optional popupmenu showing the thumbnails preview of the open windows.

Windows thumbnails were already available inside the default launcher menu (right click menu), but a new dedicated popup menu more easily accessible has been now introduced.

<a href="/media/v60-windows-thumbnails-popup-menu.jpg"><img
src="/media/v60-windows-thumbnails-popup-menu.jpg" alt="Windows thumbnails popup menu" class="center"></a>

The thumnbails menu can be associated to any of the available click options (but not to the mouseover yet).

Additionally, when using multi-monitor docks, it is now possible to show only the applications of each individual monitor (_isolate monitor_ option).
Further fixes and translations updates, are listed in the release notes below.

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

**Release notes (v60)**

* New feature: implement windows thumbnails popup menu [franglais125: c7108993, 9a4e2f5d, 31fb0597, 3c9f7f3b].
* New feature: implement monitor isolation for multi-monitor dock [franglais125: 93c5a7a9, 503b0081].
* Bugfix: Fix mouse trapped in monitor with fullscreen windows [fcbfccf9].
* Fix regression with click options [franglais125: 877cbd98].
* Tweak click action behaviour [5003841b, 7bd08718].
* Improve translations machinery [franglais125: 3fd4bdc9].
* Improve extension inter-compatibility [passingthru67: 4c9480a4]
* Update German translation [Christian González: 28d765a2].


