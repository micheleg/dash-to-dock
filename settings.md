---
layout: main
title: 'Settings'

---

## Settings

### Customizing Dash to Dock
The extension can be extensively configured by means of *gnome-shell-extension-prefs*. clicking the configure button on the extension page next to the enable/disable button or running <code>gnome-shell-extension-prefs</code> in a console. To open the Dash to Dock settings directly run 
<pre>
gnome-shell-extension-prefs dash-to-dock@micxgx.gmail.com
</pre>

![Settings window 1](https://github.com/micheleg/dash-to-dock/raw/master/screenshots/settings1.png)
![Settings window 2](https://github.com/micheleg/dash-to-dock/raw/master/screenshots/settings2.png)


### Multi-monitor configuration
The extension support multi-monitor configurations. By default the dock is shown on the primary monitor that is the monitor where the overview an panel are shown, but the extension can be configured to show the dock on another monitor. If the dock is set to be shown on an external monitor, the dock position is automaticaly updated whenever the monitor is attached or removed: when the selected monitor is not attached the dock is shown on the primary monitor.
