# Basic Makefile

UUID = dash-to-dock@micxgx.gmail.com
BASE_MODULES = extension.js stylesheet.css metadata.json
EXTRA_MODULES = dockedDash.js intellihide.js myDash.js convenience.js prefs.js
INSTALLBASE = ~/.local/share/gnome-shell/extensions
INSTALLNAME = dash-to-dock@micxgx.gmail.com

all: extension

clean:
	rm -f ./schemas/gschemas.compiled

extension: ./schemas/gschemas.compiled

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.dash-to-dock.gschema.xml
	glib-compile-schemas ./schemas/

install: install-local
install-local:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir $(INSTALLBASE)/$(INSTALLNAME)
	cp $(BASE_MODULES) $(EXTRA_MODULES) $(INSTALLBASE)/$(INSTALLNAME)/
	mkdir $(INSTALLBASE)/$(INSTALLNAME)/schemas
	cp schemas/*.xml $(INSTALLBASE)/$(INSTALLNAME)/schemas/
	cp schemas/gschemas.compiled $(INSTALLBASE)/$(INSTALLNAME)/schemas/
	echo done

zip-file: all
	-rm -fR ./_build 
	mkdir -p _build 
	cp $(BASE_MODULES) $(EXTRA_MODULES) _build
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
	cd _build ; \
	zip -qr "$(UUID).zip" .
	mv _build/$(UUID).zip ./ 
	-rm -fR _build 


#What does the first "-" mean at the beginning of the line in a Makefile ? 
#It means that make itself will ignore any error code from rm. 
#In a makefile, if any command fails then the make process itself discontinues 
#processing. By prefixing your commands with -, you notify make that it should 
#continue processing rules no matter the outcome of the command.

#mkdir -p, --parents no error if existing, make parent directories as needed 



