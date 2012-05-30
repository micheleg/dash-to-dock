# Basic Makefile

UUID = dash-to-dock@micxgx.gmail.com
BASE_MODULES = extension.js stylesheet.css metadata.json
EXTRA_MODULES = dockedDash.js intellihide.js convenience.js

all: extension

extension: ./schemas/gschemas.compiled

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.dash-to-dock.gschema.xml
	glib-compile-schemas ./schemas/

zip-file: all
	-rm -fR ./_build 
	mkdir -p _build 
	cp $(BASE_MODULES) $(EXTRA_MODULES) _build
	cp -r schemas _build
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



