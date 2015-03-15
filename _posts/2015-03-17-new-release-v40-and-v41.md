---
layout: post
title: "v40 and v41: new bugfix versions released, features backported to GNOME Shell 3.12"
author: Michele
date: Tue 17 Mar 21:45:53 GMT 2015
category: Release
---

A new extension version (v40) supporting GNOME Shell 3.14 is now available with minor fixes. All features to date have been backported to GNOME Shell 3.12 (v41).

<!--more-->

This release fixes a bug affecting authohide that was introduced in [version 39]({% post_url 2015-03-08-new-release-v39 %}). Beyond other minor fixes under the hood &ndash; see below for details &ndash; there is a minor visual improvement as shown in the screenshot below.

<a href="/media/v40.jpg"><img
src="/media/v40.jpg" alt="Dash to dock v40 massage indicators" class="center"></a>

The position of the message indicator is adjusted when the dock is placed on bottom edge of the screen. I still highly recommand the use of the [panel-osd](https://extensions.gnome.org/extension/708/panel-osd/) extension to move the notification on top when using the bottom placed dock untill the release of GNOME Shell 3.16 [solve the issue]({% post_url 2015-03-01-approaching-gnome-3.16 %}) with the message tray.

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions. 

**Release notes**

* Fix autohide. [88ed572]
* Fix drag and drop of appicons outside the overview. [ba6b01f]
* Update Russian translation.[3ed890c]
* Fix worng icon size on extension unload. [4972086]
* Force recalculation of the iconsise on theme changes. [702fd31]
* Adjust the overview message indicator in bottom mode. [d38f755]
* Stylesheet: makes vertical and horizontal padding equal. [016de0e]
