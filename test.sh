#!/bin/bash
sassc _stylesheet.scss stylesheet.css

sleep 1 

env GNOME_SHELL_SLOWDOWN_FACTOR=2 MUTTER_DEBUG_DUMMY_MODE_SPECS=1680x600 dbus-run-session -- gnome-shell --nested --wayland
