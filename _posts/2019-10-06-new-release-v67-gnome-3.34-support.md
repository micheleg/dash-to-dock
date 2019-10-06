---
layout: post
title: "v67: new release available (introducing support for GNOME Shell 3.34)"
author: Michele
date: Sun  6 Oct 22:07:01 BST 2019
category: Release
---

A new version of Dash to Dock (v67) introducing support for GNOME Shell 3.34 has been released.
<!--more-->


### How to get the new release

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

### What’s new

This release introduces support the recently released [Gnome 3.34](https://www.gnome.org/news/2019/09/gnome-3-34-released/). Significant modernization of the code base was necessary. As such, support for previous Gnome shell versions has been dropped.

A notable addition in this release is support for the the trash and removable devices icons on the dock.

<a href="/media/v67_trash_icon.jpg"><img
src="/media/v67_trash_icon.jpg" alt="Trash icon support" class="center"></a>

**Release notes (v67)**

- Introducing support for Gnome Shell 3.34 and dropping support for previous versions (Marco Trevisan (Treviño))).
- Trash and removable devices launchers (Philip Langdale, Marco Trevisan (Treviño))
- Theme support: LauncherAPI: use CSS to style progress bar color (Carlo Lobrano)
- Theme support: Don't reset border-radius for shrinked dash (Joonas Henriksson)
- Bugfix: Fix regression with transparency settings UI.
