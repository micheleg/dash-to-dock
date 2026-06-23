# Dash to Dock — Community Edition

![screenshot](https://github.com/micheleg/dash-to-dock/raw/master/media/screenshot.jpg)

> A maintained fork of [dash-to-dock](https://github.com/micheleg/dash-to-dock) incorporating community bug fixes and feature contributions that have been awaiting review upstream.

## What's different here

This fork merges the most impactful open pull requests from the upstream project. Changes are focused on stability on GNOME 48/49 and quality-of-life improvements.

### Bug fixes merged

| PR | Description | Status |
|----|-------------|--------|
| [#2552](https://github.com/micheleg/dash-to-dock/pull/2552) | `intellihide`: Fix overlap check permanently stuck after null workspace on GNOME 48 | ✅ Merged |
| [#2511](https://github.com/micheleg/dash-to-dock/pull/2511) | Fix autohide not working when panel mode is disabled | ✅ Merged |
| [#2506](https://github.com/micheleg/dash-to-dock/pull/2506) | Fix 2–4 px icon offset in fixed dock mode | ✅ Merged |
| [#2467](https://github.com/micheleg/dash-to-dock/pull/2467) | Fix crash in Metro indicator (`Clutter.Color.shade` removed in GNOME 49) | ✅ Merged |
| [#2244](https://github.com/micheleg/dash-to-dock/pull/2244) | Prevent `wl-clipboard` from appearing in the dock on Wayland | ✅ Merged |

### Features merged

| PR | Description | Status |
|----|-------------|--------|
| [#2390](https://github.com/micheleg/dash-to-dock/pull/2390) | **Dock margin size** — new slider in settings (0–300 px) to add space between the dock and the screen edge when using extended/panel mode | ✅ Merged |

## GNOME Shell compatibility

| GNOME | Status |
|-------|--------|
| 45–50 | ✅ Supported |

## Installation from source

```bash
git clone https://github.com/YOUR_USERNAME/dash-to-dock.git
make -C dash-to-dock install
```

Then reload GNOME Shell:
- **Xorg**: <kbd>Alt</kbd>+<kbd>F2</kbd> → type `r` → <kbd>Enter</kbd>
- **Wayland**: Log out and log back in

Enable the extension with *GNOME Extensions* app or with:

```bash
gnome-extensions enable dash-to-dock@micxgx.gmail.com
```

### Build dependencies

You need one of: `dart-sass` (`sass`), `sassc`, or `ruby-sass` to compile the stylesheet.

```bash
# Arch
sudo pacman -S sassc

# Ubuntu / Debian
sudo apt install sassc

# Fedora
sudo dnf install sassc
```

If `msgfmt` is missing, install `gettext` from your distribution.

## Reporting issues

Please open issues on this repository. When reporting a bug, include:

- GNOME Shell version (`gnome-shell --version`)
- Extension version (visible in GNOME Extensions app)
- Steps to reproduce
- Any errors from `journalctl -f -o cat /usr/bin/gnome-shell` while reproducing

## Contributing

Pull requests are welcome. If you want to include an upstream PR that has been waiting for a while, link it in the PR description so we can track attribution.

## Credits

- Original author: [Michele G (micheleg)](https://github.com/micheleg)
- All upstream contributors whose PRs are merged here (see table above)

## License

GPL-2.0 — see [COPYING](COPYING).
