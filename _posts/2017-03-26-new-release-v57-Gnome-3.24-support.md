---
layout: post
title: "v57: new release available supporting GNOME 3.24"
author: Michele
date: Sun 26 Mar 18:57:36 BST 2017
category: Release
---

A new version of Dash to Dock (v57) is available, introducing support for GNOME Shell 3.24, as well as supporting GNOME Shell 3.18, 3.20 and 3.22. This release a couple of new features and improvements and the usual bugfixes.

<!--more-->




### Number overlays for keyboard shortcuts

The major feature of this release is the implementation of number overlays on the dock launchers. These are shown when the keyboard shortcut which were introduce in the [previous release]({% post_url 2017-02-05-new-release-v56 %}) is activated (<code>&lt;Super&gt;1</code>..<code>&lt;Super&gt;0</code>) to provide feedback to the triggered shortcut, and with a dedicated and customizable keyboard shortcut (have a look at the settings).

<a href="/media/v57_number_overlays.jpg">
<img src='/media/v57_number_overlays.jpg' alt="Number overlays functionality" class="center"/></a>

Additional bug-fixes and improvements are listed below in the release notes.

As usual, the extension can be installed from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

**Release notes**

* Add GNOME Shell 3.125 support [Janez Troha: 97f6a0bb]
* Implement number overlay for the icons for hotkeys [franglais125: 578481c1, 73f5c147, 1781a3f7, def86c47, 04e64ca5, 0aa48a1a, 578481c1]
* Fix bug with autohide sensitive area interfering with the Activities hotcorner [393c4acc, 0f2fa2fd, bb271989]
* Update Hungarian, Spanish,[Romhányi Viktor: 9c232f3d, Hugo Olabera: 0cbea131]
* Fix bug with certain fullscreen application [a1f63c70, 1af73c03]
* Fix bug with application overview panel when  show-apps animation is disabled [franglais125, jderose9: 51b709cb]
* Add discrete GPU launch menu item [8c981726]
* Improve new window opening actions for single-window application (activate applicatoin instead) and certain applications (e.g. Nautilus) [168e7eb4, f415fa86, a69c77cf, 85b89b4b]
* ScrollCycleWindows: never open new windows [a168e2f5]
