---
layout: main
title: Development
description: 'Get involved in the development of Dash to Dock, report a bug, contribute!'
section: development
subsections: [Roadmap, Bug reporting, License]
subsectionsShort: [roadmap, bugreporting, license]
order: 1
side: '<ul id="button">
<li>
  <p><a class="star" href="{{ site.github_project_url }}">Get involved </a></p>
  <p>Browse the <a href="{{ site.github_project_url }}">GitHub development page</a> and get involved in the development.</p>
</li>
</ul>'
---

## Development

The code of the extension is hosted on [Github] ({{ site.extension_page_url }}): get involved in the development, report a bug, contribute!

The source code can be obtained from Github

     git clone https://github.com/micheleg/dash-to-dock.git

Here are the [Installation instructions](./download.html#installfromsource).

<a name="roadmap"></a>
### Roadmap

1. Keep the extension updated with new upstream versions.
2. Improve integration with the shell, avoiding inconsistencies and taking advantage of new features or design.
3. Add keyboard shortcuts
4. In the long term, rewrite and simplify the code.

There aren't mayor features planned, but many bugs that I would like to see fixed (see below).

Things I'm not going to do:

 * putting the dash at the bottom of the screen unless it proves to be feasible and compatible with the upstream Gnome Shell design) **UPDATE: I might reconsider a bottom dock**
 * adding random features unrelated to the dash

<a name="bugreporting"></a>
### Bug Reporting
If you experienced a bug please report it by opening an [isssue on github]({{ site.github_project_url }}/issues). You can also send a bug report message in the [extension website]({{ site.extension_page_url }}). Your help is very appreciated.

Please provide as many details as possible and all the steps to reproduce the bug. Include the following information:

 * Extension version
 * Gnome Shell version
 * Linux distribution and version
 * Whether you have a multi-monitor configuration
 * Your settings: include the output of the command <code>dconf dump /org/gnome/shell/extensions/dash-to-dock/</code>.

Before reporting a bug:

 * Check if the bug persists disabling all other extensions. If not, try to find the conflicting extension by enabling each extension one at a time.
 * Check if there are any relevant errors in Looking Glass (<code>ALt-F2 lg</code>, error panel).
 * Reload the shell by typing in a terminal (as normal user) <code>gnome-shell --replace</code> and look for relevant output in that terminal when the bug appears. 
 * Try to reset the extension settings to their default values with the command <code>dconf reset /org/gnome/shell/extensions/dash-to-dock/</code>


<a name="license"></a>
### License
Dash to Dock Gnome Shell extension is distributed under the terms of the GNU General Public License,
version 2 or later. See the COPYING file for details.

