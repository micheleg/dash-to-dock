---
layout: main
title: 'Installation'
section: 'download'
order: 1
---


## Installation
### Extension website
The easiest and suggested way to install and keep the extension updated is through the official [Gnome Shell Extensions site](https://extensions.gnome.org/extension/307/dash-to-dock/).

<ul id="button">
<li>
  <p><a class="download" href="http://extensions.gnome.org/extension/307/dash-to-dock/">Try it out</a></p>
  <p>Install the extension through the <a href="http://extensions.gnome.org/extension/307/dash-to-dock/">extensions website</a>. The installation process is as simple as sliding a button.</p>
</li>
</ul>

The installation process is as simple as sliding a button. The extension can then be enabled and disabled through the same site or with *gnome-tweak-tool*.

### Manual installation
You can alos obtain the extension in the form of a *zip archive* from the [release page](https://github.com/micheleg/dash-to-dock/releases). The extension can be installed by means of *gnome-tweak-tool* o by direclty extreacting the archive in the a directory named <code>dashtodock@micxgx.gmail.com</code> inside <code>~/.local/share/gnome-shell/extensions/</code>

     unzip dash-to-dock@micxgx.gmail.com.zip \ 
    -d ~/.local/share/gnome-shell/extensions/dashtodock@micxgx.gmail.com/

Shell reload is required <code>Alt+F2 r Enter</code>. The extension can be enabled with *gnome-tweak-tool* or with *dconf* by adding 'dashtodock@micxgx.gmail.com' to the <code>/org/gnome/shell/enabled-extensions</code> key.

### Installation from source
The extension can be installed directly from source, either for the convenience of using *git* or to test the latest development version. Clone the desire branch with git

     git clone https://github.com/micheleg/dash-to-dock.git

or download the branch from github. A simple Makefile is included. Run

    make
    make install

to install the extension in your home directory. A Shell reload is required <code>Alt+F2 r Enter</code> and the extension has to be enabled  with *gnome-tweak-tool* or with *dconf*.

As an alternative the zip archive can be generated with 


    make
    make zip-file

Then follow the instructions above to install the zip-archive.
