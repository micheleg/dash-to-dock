# Basic Makefile

UUID = dash-to-dock@micxgx.gmail.com
BASE_MODULES = extension.js \
               metadata.json \
               COPYING \
               README.md \
               $(NULL)

EXTRA_MODULES = \
                appSpread.js \
                dash.js \
                docking.js \
                appIcons.js \
                appIconIndicators.js \
                fileManager1API.js \
                imports.js \
                launcherAPI.js \
                locations.js \
                locationsWorker.js \
                notificationsMonitor.js \
                windowPreview.js \
                intellihide.js \
                prefs.js \
                theming.js \
                utils.js \
                dbusmenuUtils.js \
                desktopIconsIntegration.js \
				conveniences/d2dprefsspage.js \
				conveniences/monitorsconfig.js \
                preferences/about.js \
                preferences/appearance.js \
                preferences/behavior.js \
                preferences/general.js \
                preferences/launchers.js \
                $(NULL)

EXTRA_MEDIA = logo.svg \
              glossy.svg \
              highlight_stacked_bg.svg \
              highlight_stacked_bg_h.svg \
			  icons/hicolor/scalable/actions/dash-symbolic.svg
			  icons/hicolor/scalable/actions/general-symbolic.svg
			  icons/hicolor/scalable/apps/dash-to-dock.svg
              $(NULL)

TOLOCALIZE =  prefs.js \
              appIcons.js \
              locations.js \
              $(NULL)

MSGSRC = $(wildcard po/*.po)
ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif
INSTALLNAME = dash-to-dock@micxgx.gmail.com

# The command line passed variable VERSION is used to set the version string
# in the metadata and in the generated zip-file. If no VERSION is passed, the
# current commit SHA1 is used as version number in the metadata while the
# generated zip file has no string attached.
ifdef VERSION
	VSTRING = _v$(VERSION)
else
	VERSION = $(shell git rev-parse HEAD)
	VSTRING =
endif

all: extension

clean:
	rm -f ./schemas/gschemas.compiled
	rm -f stylesheet.css
	rm -rf _build

extension: ./schemas/gschemas.compiled ./stylesheet.css $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.dash-to-dock.gschema.xml
	glib-compile-schemas ./schemas/

potfile: ./po/dashtodock.pot

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -U $$l ./po/dashtodock.pot; \
	done;

./po/dashtodock.pot: $(TOLOCALIZE) Settings.ui
	mkdir -p po
	xgettext --keyword=__ --keyword=N__ --add-comments='Translators:' -o po/dashtodock.pot --package-name "Dash to Dock" --from-code=utf-8 $(TOLOCALIZE)
	intltool-extract --type=gettext/glade Settings.ui
	xgettext --keyword=_ --keyword=N_ --join-existing -o po/dashtodock.pot preferences/*.js

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

./stylesheet.css: ./_stylesheet.scss
ifeq ($(SASS), ruby)
	sass --sourcemap=none --no-cache --scss _stylesheet.scss stylesheet.css
else ifeq ($(SASS), dart)
	sass --no-source-map _stylesheet.scss stylesheet.css
else ifeq ($(SASS), sassc)
	sassc --omit-map-comment _stylesheet.scss stylesheet.css
else
	sassc --omit-map-comment _stylesheet.scss stylesheet.css
endif

install: install-local

install-local: _build
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME)
	cp -r ./_build/* $(INSTALLBASE)/$(INSTALLNAME)/
ifeq ($(INSTALLTYPE),system)
	# system-wide settings and locale files
	rm -r $(INSTALLBASE)/$(INSTALLNAME)/schemas $(INSTALLBASE)/$(INSTALLNAME)/locale
	mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas $(SHARE_PREFIX)/locale
	cp -r ./schemas/*gschema.* $(SHARE_PREFIX)/glib-2.0/schemas
	cp -r ./_build/locale/* $(SHARE_PREFIX)/locale
endif
	-rm -fR _build
	echo done

zip-file: _build check
	cd _build ; \
	zip -qr "$(UUID)$(VSTRING).zip" .
	mv _build/$(UUID)$(VSTRING).zip ./
	-rm -fR _build

_build: all
	-rm -fR ./_build
	mkdir -p _build
	cp $(BASE_MODULES) $(EXTRA_MODULES) _build
	cp -a dependencies _build
	cp stylesheet.css _build
	mkdir -p _build/media
	cd media ; cp $(EXTRA_MEDIA) ../_build/media/
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
	mkdir -p _build/locale
	for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`; \
		mkdir -p $$lf; \
		mkdir -p $$lf/LC_MESSAGES; \
		cp $$l $$lf/LC_MESSAGES/dashtodock.mo; \
	done;
	sed -i 's/"version": -1/"version": "$(VERSION)"/'  _build/metadata.json;

ifeq ($(strip $(ESLINT)),)
    ESLINT = eslint
endif

ifneq ($(strip $(ESLINT_TAP)),)
    ESLINT_ARGS = -f tap
endif

check:
	$(ESLINT) $(ESLINT_ARGS) .
