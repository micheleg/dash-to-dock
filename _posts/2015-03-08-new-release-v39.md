---
layout: post
title: "v39: new version released"
author: Michele
date: Sun 08 Mar 19:00:25 GMT 2015
category: Release
---

A new extension version (v39) supporting GNOME Shell 3.14 is now available. This
release introduces a series of bug fixes and minor visual improvements.

<!--more-->

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions. 

<a href="/media/v39.jpg"><img
src="/media/v39.jpg" alt="Preview screenshot of dash to dock running in GNOME 3.16" class="center"></a>

There are two main visible changes in this version: the running indicator in the built-in theme are now solid light grey dots in place of the old blurred spots and the animating in and out of the overview which now correctly run the spring animation for the application view. 

An option to make the message tray insensitive to mouse events has been added. This is a workaround waiting for the message tray complete removal in GNOME Shell 3.16.

Few bugs have been solved &ndash; see below for details &ndash; the most important is the one that was preventing a smooth update of the extension version which should have finally gone.

[_IT_](https://github.com/itprojects), who helped with the development, made a video showing the main Dash to Dock features developed so far.

<iframe width="560" height="315" src="https://www.youtube.com/embed/lcCOWNR-LW4" frameborder="0" allowfullscreen></iframe>

The next step will be the release of an updated version for 3.16 which is [almost ready]({% post_url 2015-03-01-approaching-gnome-3.16 %}), but I'm also try to find a workaround to make the notification and the dock coexist in GNOME Shell 3.14. Moreover, the video below shows a preview of some of the features IT is working on which will be integrated once tested and polished in the next releases. You can test them from IT's [experimental branch](https://github.com/itprojects/dash-to-dock).

<iframe width="560" height="315" src="https://www.youtube.com/embed/8K4vNbgE4hk" frameborder="0" allowfullscreen></iframe>


**Release notes**

* Improvement: various improvement to the startup animations.
* Bug fix: fix missing and broken spring animation.
* Improvement: improve animation in and out from the overview.
* New feature: add option for insensitive messageTray.
* Improvement: keep the dock actor below the modalDialogGroup.
* Bug fix:  solve bug with wrong icons size in hidpi screen.
* Fix: consider always on top windows for intellihide.
* New feature: embed quit from dash functionalities.
* Improvement: Update running dots style.
* Bug fix: Correct bug on extension update
* Improvement: "first" is "rigth" for RTL languages, this correct the settings effect.

