---
layout: post 
title: "What about a bottom dock?"
author: Michele
date: Mon 6 Oct 22:38:36 BST 2014
category: News
---

Many people have been asking for a bottom dock instead of the default side 
positioning. Even tough I was very reluctant at the beginning for a variety of reasons, including lazyness and lack of personal interest for this particular design choice, I recently reconsidered this option.

<!--more-->

Few people tried to adapt this extension to obtain a bottom dock, with a major
working fork by the [ozonos](https://github.com/ozonos/) and
[Numix](https://numixproject.org/) people that also landed on the extension
website as [Simple Dock](https://extensions.gnome.org/extension/815/simple-dock/). I'm going to reintegrate back their work.

<a href="/media/screenshot_preview_bottom_dock.jpg"><img
src="/media/screenshot_preview_bottom_dock.jpg" alt="Preview screenshot of the
bottom dock" class="center"></a>

Some initial attempts thanks to the contribution of
[itproject](https://github.com/itprojects/gnome-dock/commits/master) are on the
experimental_bottom_dock branch on [Github]({{ site.github_project_url }}).
This has to be considered hightly experimental. It will take some time to land
into the master branch, after a careful review and cleaning up of the code, the
priority being the long term maintenability of the extension over new features.
This work is slowly being carried out in the bottom_dock branch, from where the
screenshot above come from.

These changes will allow the placementt of the dock also on the right edge of
the screen, although I'll take care of it later.

Follow the development on the [Github projet page]({{ site.github_project_url}})

