---
layout: post
title: "v47 and v48: new versions released: minor fixes and improvements."
author: Michele
date: Mon  3 Aug 19:12:44 BST 2015

category: Release
---

A new version of Dash to Dock (v47) supporting GNOME Shell 3.16 is now available. This releases contain few bug-fizes; few options have been restored. This feature and other bugfixes and translations of this release have been backported to GNOME Shell 3.14 (v48).

<!--more-->

This is mainly a maintenance release with a couple of bugfixes and new updated translations. The main changes are the restoring of the option to hide the *Favorite*, and the addition of an option to hide the *"Show apps icon"* has been added. Moreover the whole dock is sensitive to scrolling for switching workspaces as in old versions.

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions. 

**Release notes**

* Fix bugs with fullscreen [91e79136, 8210bd0a].
* Fix bug due to padding in the dock container [cbcc067c].
* Restore show/hide favorites option [9cbec67c,02fbe389].
* Allow workspace switch scrolling all over the dock [64b30ca7].
* Add function to show/hide 'show applications' button [51f037e4, 82b2e7ca].
* Update Russian, Serbian, Brazilian, Czech, and German translations.
