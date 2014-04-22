---
layout: post
title: "v29: new version released"
author: Michele
date: Tue 22 Apr 23:54:41 BST 2014
category: Release
---

A new extension version (v29) supporting GNOME Shell 3.12 has been released and 
can be found as usual from the [extension website]({{ site.extension_page_url }}) 
or downloaded manually from the [release page]({{ site.github_project_url }}/releases).
See also the [alternative installation methods](/download.html)

<!--more-->

This release includes some important changes, that is a rework of the dock
[sliding mechanism]({% post_url 2014-04-09-multimonitor-bug-solved %}) and the
introduction of [pressure sensitivity]({% post_url 2014-04-08-pressure-sensitivity-implemented %}).
These changes improve the extension behaviour particularly in multimonitor
configurations.

Moreover the [customized Adwaita theme](/themes.html) previously
released standalone is now built in the extension and can be enabled and
disabled in the extension settings.

**Release notes**

* Include optional custom theme for the dash replacing the Adwaita-dashtodock theme
* Rework dahs sliding: introduce custom container solving bugs:
  - Bug fixing: the dash doesn't steal anymore input events on the secondary monitor when slided out
* Add pressure sensitivity to show the dash
* Emit custom signals when showing/hiding for better extension interoperability

