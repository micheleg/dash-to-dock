---
layout: main
title: 'Changelog'
description: 'Changelog for all versions of Dash to Dock'
section: 'development'
order: 2
---

<a name="changelog"></a>
## Change log

Version numbering follows the uploads to the extension website.

{% for release in site.data.releases %}
<a name="v{{ release.version }}"></a>
<p><strong>Version {{ release.version }} ({{ release.date }})</strong></p>
<p>Compatible with GNOME Shell: {{ release.shell_version | join: ', ' }} </p>
<ul>
{% for rn in release.notes %}
<li>{{ rn }}</li>
{% endfor %}
</ul>
{% endfor %}

