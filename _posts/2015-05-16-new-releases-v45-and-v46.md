---
layout: post
title: "v45 and v46: new versions released with improved minimize animation"
author: Michele
date: Sat 16 May 16:13:44 BST 2015
category: Release
---

A new version of Dash to Dock (v46) supporting GNOME Shell 3.16 is now available. The major change is this version is the iprovement of the minimize animation which is now targeting the application icon rather than the screen corner.
This feature and other bugfixes and translations of this release have been backported to GNOME Shell 3.14 (v45).

<!--more-->

This is mainly a maintenance release with a couple of bugfixes and new updated translations after the overhaul of the settings introduced in [version 44]({% post_url 2015-04-17-new-releases-v43-and-v44 %}).

There is only one new long awaited improvement: the windows minimize animation is finally towards the respective icon in the the dock rather than towards the screen corner, as shown in the video below.

<iframe width="560" height="315" src="https://www.youtube.com/embed/kba78_DsmIo" frameborder="0" allowfullscreen></iframe>

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions. 

**Release notes**

* Minimize windows to their respective dash icons [568294b, 08d760c, be8e941].
* Fix autohide bug with zero animation time #166 [fe038b3].
* Remove show-favorites option [727b909].
* Fix settings [4b08a7e, 3816b49].
* Update Russian, Arabic, Slovak, Japanese, and Dutchtranslations.
