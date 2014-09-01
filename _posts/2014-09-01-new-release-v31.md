---
layout: post
title: "v31: new version released"
author: Michele
date: Mon  1 Sep 15:04:01 CEST 2014
category: Release
---

A new extension version (v31) supporting GNOME Shell 3.12 has been released and can be found as usual from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See also the [alternative installation methods]({{ relative }}/download.html) for instructions.

<!--more-->

The biggest visible change in this release is the dash sliding up upon messageTray showing. The workspaceSwitcherPopup is now shown when scrolling over the dash to switch workspace. These changes improve the extension integration and consistency with the default GNOME Shell behaviour.


**Release notes**

* Improvements:
    - Slide up the dash when the messageTray is snown
    - Show workspaceSwitcherPopup when scrolling over the dash to switch workspace
* Bug fixes:
    - tweak pressureBarriers behaviour with fullscreen apps
    - Apply custom theme only if the default Adwaita is used.
    - myDash: correct visual glitch due to animation not run outside the overview.


