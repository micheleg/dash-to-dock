---
layout: post
title: "v63: new release available introducing support for GNOME Shell 3.28"
author: Michele
date: Mon  2 Apr 20:30:54 BST 2018
category: Release
---

A new version of Dash to Dock (v63) supporting GNOME Shell from version 3.18 to 3.28, and introducing new launchers styles, is available.

<!--more-->

Although a bit late, this version introduces support for recently released [GNOME Shell 3.28](https://help.gnome.org/misc/release-notes/3.28/), and also brings few fixes and improvements as well as some new launcher styles.

### What's new

#### New launcher styles

<a href="/media/v63-new-launchers-styles.jpg"><img
src="/media/v63-new-launchers-styles.jpg" alt="New launcher styles" class="center"></a>

New launcher windows indicators have been introduced. These were strongly inspired and ported from [Jason DeRose's dash-to-panel](https://github.com/jderose9/dash-to-panel) extension. Beside the indicator style, now available in dots, squares, dashes, solid, segmented, ciliora and metro styles, the color can optionally be dynamically set based on the launcher icon dominant color, for a more colorful appearance.

#### Minimize-or-previews launcher action
A new click action "minimize-or-previews" has been added. As the name suggests, this results in the window being minimized when clicking on a running application launcher when only one window is present, or the windows previews being  showed when more than one windows is present.

### How to get the new release

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) (upon review), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

**Release notes (v63)**
* Introduce GNOME Shell 3.28 support.
* New feature: Implement new appIconIndicators styles.
* New feature: ClickAction: add minimize-or-previews option [veridiam: b2e9bb7c].
* Improvement: Add scrollbars to settings windows [bfc7cfb07f6e].
* Fix border in overview [Beidl: f87c2a996d].
* Fix stale barrier state (dock stuck hidden) with fast or no animations [13c2efc3d1].
* Add Galician translation [Xose: faafac2ebf].
* Update Czech [Pavel: 490ba7fa], Ukraininan [Valentine A.: 81202c45], Russian [vantu5z: f93ab8e8], Norwegian Bokmål [Harald H: a36c50be], Swedish [Morgan Antonsson: 310e5d20] translations.