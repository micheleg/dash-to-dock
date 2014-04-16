---
layout: post
title: "Longstanding bug affecting multimonitor solved"
author: Michele
date: Wed Apr 9 00:00:00 BST 2014
category: News
---

A longstanding bug affecting multimonitor configurarions ([issue 28]( {{ site.github_project_url }}/issues/28)) where the primary screen is not the leftmost one has finally been solved.

<!--more-->

This, combined with the optional [pressure sensitivity]({%post_url 2014-04-08-pressure-sensitivity-implemented%}), should allow to use the extension both with intellihide and autohide in all multimonitor configurations.

A new version including this fix targeting GNOME Shell 3.12 is going to be released soon. In the meantime you can try the master branch on [Github]({{ site.github_project_url }}). This feature is going to be backorted to GNOME Shell 3.10 too.


