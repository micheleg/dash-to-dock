---
layout: post
title: "v61: new release available introducing support for GNOME Shell 3.26"
author: Michele
date: Wed  6 Sep 21:19:38 BST 2017
category: Release
---

A new version of Dash to Dock (v61) is available, introducing support for GNOME Shell 3.26. And some Ubuntu related news.

<!--more-->

This release provide support for the upcoming GNOME Shell 3.26, just ahead of its official release, and maintains support to previous versions back to GNOME Shell 3.18. Moreover, there are a bunch of Ubuntu related stuff going on. Let's look at them.

### Dash to dock and Ubuntu - collaboration

As you might already know, Dash to Dock will be used as part of the new GNOME Shell based interface of the [upcoming Ubuntu release](https://didrocks.fr/2017/08/17/ubuntu-gnome-shell-in-artful-day-4/), as shown in the screnshot below.

<a href="/media/dash-to-dock-in-ubuntu.jpg"><img
src="/media/dash-to-dock-in-ubuntu.jpg" alt="Unity launcher style" class="center"></a>

What will be included in Ubuntu is a full Dash to Dock, preconfigured according to the Ubuntu style, but with most [settings not exposed](https://didrocks.fr/2017/08/18/ubuntu-gnome-shell-in-artful-day-5/). I'd like to remark that it is not a fork but an upstream collaboration with the Ubuntu Desktop team. Users will be able to install Dash to Dock to get access to the additional configurability, or chose the additional layer of quality assurance provided by the Ubuntu distribution.

Nothing changes for Dash to Dock users, but it is a good news, as the project will benefit from the additional users, with new ideas, more testing, and new contributors (contributions from the Ubuntu Desktop team are already coming).

### New feature: Unity7 styled launchers

This was actually not driven by the Ubuntu team, but instead an independent effort by [Sven Hagemann](https://github.com/savagetiger) who proposed and implemented the feature, which was then refined with help from [Franglais125](https://github.com/franglais125). Applications launchers can optionally have a glossy finish with a background following to the dominant colour of the apllication icon, as shown in the screenshot below.

<a href="/media/v61-unity-style.jpg"><img
src="/media/v61-unity-style.jpg" alt="Unity launcher style" class="center"></a>

It will please "*nostalgic*" Unity users, and by those that appreciate the addition of a little bit of colour to their desktop.

### Additional changes

The shortcuts behaviour has been tweaked slightly. The &lt;Super&gt;1-10 shortcuts are now associated to the numbers keys on the top of the keyboards only, and not to the numeric keypad ones anymore. This was motivated by avoiding colliding with other shortcuts.

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) (upon review), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

**Release notes (v61)**

* Introduce GNOME Shell 3.26 support [44ed947e, 1e46e472, b91fa4fc, 87f46c7c].
* New feature: add glossy coloured (Ubuntu Unity like) launchers [Sven Hagemann: fe6dde50, 5533316b, 829d3982; franglais125: 89861fbb, eb832c34].
* Tweak shortcuts: remove keypad hotkeys (maintain top row keys shortcuts) [franglais125: 979b443f]
* Update Russian, Czech, Japanese, French, Simplified Chinese, Italian, Spanish [vantu5z: 8f4d78d6, e254b3d0; Pavel: 5928947b; Debonne Hooties: 2a44c38f; seb128: 184b150e; shlinux: 5d4029b7; Filippo Berto: 04bb0a90; Adolfo Jayme Barrientos: 6fb7327c].


