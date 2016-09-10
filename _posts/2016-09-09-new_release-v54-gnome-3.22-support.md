---
layout: post
title: "v54: new version available supporting GNOME Shell 3.22"
author: Michele
date: Sat 10 Sep 00:24:51 BST 2016

category: Release
---

A new version of Dash to Dock (v54) introducing support for GNOME Shell 3.20 is available. This release contains various enhancements and new features and is also compatible with GNOME Shell 3.20 and 3.18.

<!--more-->

This version introduces support for the [upcoming GNOME Shell 3.22 release] (https://help.gnome.org/misc/release-notes/3.22/). As in the previous cycle, there have not been changes affecting the extension behaviour, therefore it has been possible to share the same codebase with the previous GNOME 3.20 and 3.18 release.

Most of the changes in this release have been possible thanks to the contribution of few enthusiast people. [Tliron](https://github.com/tliron), who helped cleaning up the code, and [Franglais125](https://github.com/franglais125) who implemented few important new features and bug fixes.

### New features

#### Dock background color

The background color of the dock can now be explicitly customised. 

<a href="/media/v54_background_color_settings.png"><img
src="/media/v54_background_color_settings.png" alt="Background color settings" class="center"></a>

Moreover, the transparency of the border is now synchronized with the dock transparency, and the  rendering of the "running dots" has been improved.

#### Workspace isolation

It is now possible to show only launcher of those applications running on the current workspace. 

<a href="/media/v54_workspace_isolation.png"><img
src="/media/v54_workspace_isolation.png" alt="Workspace isolation settings" class="center"></a>

#### Extended click behaviour options

The click action customization has been revamped and partially extended allowing the customization of the click, shift+click, middle-click and shift+middle-click behaviour. 

<a href="/media/v54_click_options.png"><img
src="/media/v54_click_options.png" alt="Extended click options  settings" class="center"></a>

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/), or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions.

If you are running the development version (3.21.9x), you can [disable the version check](https://www.maketecheasier.com/disable-extension-version-checks-gnome/) or add the version in the *metadata.json* file.

**Release notes**

* Add GNOME Shell 3.22 support [6e99713]
* Code reorganization and style clean up [f9b4bab, 8619591] 
* Implement more options for launcher clicks [08bc362]
* Implement option to set the Dash background color [7db860c]
* Implement workspace isolation option [7c5aa41]
* Allow for smaller minimum icon size [68c9951]
* Fix regression with inputRegions in fullscreen and fixed mode [42ee3ec]
* Intellihide fixes [f23a7f6, 28f7985]
* Improve theming [d23fe71, 19f825f, a0bab41, 87376ee, 067048f]
* Fix Wayland compatibility [c25ba27]
* Update Russian, Polish, French, Brazilian Portuguese, Japanese, Italian, Spanish, Simplified Chinese, Slovack and Turkish translations [c1e191d, f2b8f94, 4005eac, 4bb3f62, 8ef326f, 113b0ad, 7b76b1a, 0682d13, fb4946b, 70d3abe] Add Swedish translation [cd0d4bc]





