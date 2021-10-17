---
layout: main
title: 'Releases'
description: 'Download all released versions of Dash to Dock, a GNOME Shell extension.'
section: download
order: 2
shell_versions: ["40", "3.38", "3.36", "3.34", "3.32", "3.30", "3.28", "3.26", "3.24", "3.22", "3.20", "3.18", "3.16", "3.14", "3.12", "3.10", "3.8", "3.6", "3.4", "3.2"]
---

## Releases

This page contains zip archives for all released versions of Dash to Dock. The preferred way to install Dash to Dock is through the extension websites. These zip archives are provided for manual installation. See [installation instructions](./download.html).

### Note about the version numbering
This project does not follow any sane version numbering! This is for reasons of laziness and to follow the versioning scheme of the [extension website]({{ site.extension_page_url }}). The releases are numbered with an integer progressive number according to the upload order to the [extension website]({{ site.extension_page_url }}). This means for instance that the latest release (higher number) might not be the supporting the latest GNOME Shell version. One day the project will embrace a reasonable versioning scheme. In the meantime, ensure you choose a release suitable for your GNOME Shell version.

{% for sv in page.shell_versions %}
<a name="{{sv}}"></a>

### GNOME Shell {{ sv }}
{% for release in site.data.releases %}
{% if release.shell_version contains sv %}
<p><strong>Version {{ release.version }}: </strong><a href="{{ release.zip_url }}" onClick="ga('send', 'event', 'Release', 'Download', 'v{{release.version}}');">download</a>,
<a href="./changelog.html#v{{ release.version }}">release notes</a>.
</p>
<!--<ul>
{% for rn in release.notes %}
<li>{{ rn }}</li>
{% endfor %}
</ul>-->
{% endif %}
{% endfor %}
{% endfor %}

