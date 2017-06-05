---
layout: post
title: "v59: new release available with improved multimonitor support"
author: Michele
date: Sun 04 Jun 17:20:39 BST 2017
category: Release
---

A new version of Dash to Dock (v59) is available, introducing the possibility of showing the dock on all monitors. This relase supports all recent of GNOME Shell releases (3.18, 3.20, 3.22 and 3.24)

<!--more-->

The most notable feature introduced in this release, thanks to the work of [Franglais125](https://github.com/franglais125), is the possibility of displaying the dock on all available screens. At the moment no strange combinations of dock positions are supported: the dock is replicated on each available screen. Workspace/monitor isolation is supported.

<a href="/media/v59_multimonitor_settings.png"><img
src="/media/v59_multimonitor_settings.png" alt="New multimonitor setttings" class="center"></a>

An additional click action was also introduced thanks to [Bertrand Chauvin](https://github.com/bchauvin). With the option "miminize or overview", the overview is shown when more than one windows for the selected application is present.

Further fixes and translations updates, including a solution for a [problem with the settings]({% post_url 2017-04-23-ubuntu-settings-error-clutter %}) which have affected quite a few people, are listed in the release notes below:

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

### Where's version 58?

Due to the (insane) way in which the extension version tracks the uploads to the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), v58 included a major regression preventing to open the settings panel, and has been therefore deactivated.

**Release notes (v58/v59)**

* New feature: Improve multimonitor support, with an option to show the dock on all monitors [Franglais125].
* New feature: Add minimize or overview click action [Bertrand Chauvin: 2102c77c].
* Fix bug in adjustPanelCorners [ef2a53cd].
* Fix HiDPI sopport for AppIcons shortcuts labels: consider scale factor [1144a398].
* Keep legacyTray above the dock [b9649137].
* "Fix regression preventing the opening og the settings panel [franglais125: 9350417f]
* Fix Translations of appicon popupmenus [51db80ab]
* Update French, Spanish and Italian translations.
* Add Greek translation [Δημήτριος-Ρωμανός Ησαΐας: c08f1239]. Update Spanish [franglais125: 9eec8d98, 47f27fbd, e11ba1f4], French [Bertrand Chauvin: abfe5dff, 612b6759, 5f928665; franglais125: e11ba1f4], Brazilian Portuguese [Fábio Nogueira: 0dec550c, 0a3b9346], Italian [Giuseppe PIgnataro: 387501e9; 59f8d36d], Hungarian [Balázs Úr, 4407bec6]
Polish [Piotr Sokół:, bfa646a2], and Russian translations [vantu5z: f140a140, 6a76c7e7].


