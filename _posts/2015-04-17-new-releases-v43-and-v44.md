---
layout: post
title: "v43 and v44: new versions released with scrollable dock"
author: Michele
date: Fri 17 Apr 22:00:20 BST 2015
category: Release
---

A new version of Dash to Dock (v44) supporting GNOME Shell 3.16 is now available. This version introduces an optional scrollable behaviour with fixed icons <i>à la Unity</i>, in place of the default icon resize, and a renewed settings interface. All features to date have been backported to GNOME Shell 3.14 (v43).

<!--more-->

<a href="/media/v44.jpg"><img
src="/media/v44.jpg" alt="Dash to dock v44 screenshot" class="center"></a>

At a first glance no visible changes appear from the screenshot of the new version. However, a closer look at the settings panel reveals a complete overhaul of the settings UI. After stacking new options after new options for a couple of years, there was much need for a new UI. Options are more intelligible and this should avoid confusion.

<a href="/media/v44_settings.png"><img
src="/media/v44_settings.png" alt="Dash to dock v44 new settings" class="center"></a>

A drawback of these changes is that most strings changed and the corresponding translations are now missing. This might not be a huge drawback for the reader. However, if English is not your mother tongue you might consider providing [translations]({{ relative }}/localization.html) in your idiom to help non polyglot users. Even if English is your first language you might consider improving the current wording.

A closer look to the settings reveals a couple of new features. The extended option &ndash; now renamed **panel mode** &ndash; is now officially supported and the annoying [bug](({{ relative }}/download.html)) introduced in GNOME Shell 3.16 has been solved. The top panel is not shifted anymore to accommodate the side dock, as I found it a bit ugly and more difficult to maintain. I'm sure the new **scrollable** option with **fixed icon size** similar to Ubuntu's Unity behaviour will be much appreciated by people using the side panel mode.

<a href="/media/v44_scrollable.png"><img
src="/media/v44_scrollable.png" alt="Dash to dock v44 new scrollable dock" class="center"></a>

As it regards icon dimension, a size up to 128 px is now available as requested by people with  large hidpi screens. Moreover, the default icon size can be chosen continuously, although the predefined one will give a better effect. Icon scaling when the fixed option is not selected still uses only the predefined sizes. A smooth icon resize is under consideration if it turns out to not hurt my eyes too much. Renewing the settings interface also led to the simplification and removal of some sub-options which I hope nobody will notice.

On the not visible side, the autohide donesn't require having a one pixes transparent area at the screen edge. On one hand this prevent the dock from stealing the focus from the window below when hidden. On the other end, the switching of the workspace now only works when the dock is visible. Few other included fixes are listed below in the release notes.

As usual, the extension can be obtained from the [extension website](https://extensions.gnome.org/extension/307/dash-to-dock/) upon approval, or downloaded manually from the [release page]({{ site.release_page_url }}). See the [alternative installation methods]({{ relative }}/download.html) for instructions. 

**Release notes**

* Ensure labels stay inside the screen area. [e020c72] 
* Fix alignment in extended mode. [5be10ba, 3f81640]
* Add scrollview for overflowing dash [50741f, 24f85c7, 40fc92b, 9920979, 7b16423, bb7d074, b4e3742, d58b97c, 94dbd94, a898d55, c1c5416, 816f55c]
* Dock slide out completely (remove 1px transparent padding). [332ac4c]
* Improve and simplify autohide code [55c44bc3, 221701, ad5c50a, fdf04aa, 0c0e88d, f073d36, 97e4a2b, 653a4b9, 7ad6ca0]
* Do not shift main panel on extended mode. [02b0f67]
* Do not remove the external border in extended mode. [172c4aa]
* Hide both rounded corder in extended fixed mode. [7dea987]
* Increase maximum icon size to 128 px. [03fc047, 975d2d5]
* Add arabic translation. [ae8fdfc, c79d1bf]
* Drop option for edge only sensitivity to workspace switch. [b13eb49]
* Use a fixed icon option instead of minimum size. [3a19998, 12c5c6e, 12c5c6e]
* Fix wrong icon size on extension reload. [4617e35]
* Drop switch workspace deadtime options, always enable it. [33bfa1b]
* Renew settings UI. [7aad3b8, 11d21e9, eb2aaf8]
* Improve startup animation. [62f259b, 8a081e3]

