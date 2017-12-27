const Cairo = imports.cairo;
const Clutter = imports.gi.Clutter;
const GdkPixbuf = imports.gi.GdkPixbuf
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Util = imports.misc.util;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

let tracker = Shell.WindowTracker.get_default();

const RunningIndicatorStyle = {
    DEFAULT: 0,
    RUNNING_DOTS: 1,
    GLOSSY_COLORED_BACKLIT: 2
};

const MAX_WINDOWS_CLASSES = 4;


/*
 * This is the main indicator class to be used. The desired bahviour is
 * obtained by composing the desired classes below based on the settings.
 *
 */
var AppIconIndicator = new Lang.Class({

    Name: 'DashToDock.AppIconIndicator',

    _init: function(source, settings) {
        this._indicators = [];

        // Unity indicators always enabled for now
        let unityIndicator = new UnityIndicator(source, settings);
        this._indicators.push(unityIndicator);

        // Choose the style for the running indicators
        let runningIndicator = null;
        let runningIndicatorStyle = RunningIndicatorStyle.DEFAULT;
        if (settings.get_boolean('unity-backlit-items')) {
            runningIndicatorStyle = RunningIndicatorStyle.GLOSSY_COLORED_BACKLIT;
        } else if ( settings.get_boolean('custom-theme-running-dots') ||
                    settings.get_boolean('apply-custom-theme' )
        ){
            runningIndicatorStyle = RunningIndicatorStyle.RUNNING_DOTS;
        }

        switch (runningIndicatorStyle) {
            case RunningIndicatorStyle.DEFAULT:
                runningIndicator = new RunningIndicatorBase(source, settings);
                break;

            case RunningIndicatorStyle.RUNNING_DOTS:
                runningIndicator = new RunningIndicatorDots(source, settings);
                break;

            case RunningIndicatorStyle.GLOSSY_COLORED_BACKLIT:
                runningIndicator = new RunningIndicatorColoredBacklit(source, settings);
                break;
            }

        this._indicators.push(runningIndicator);
    },

    update: function() {
        for (let i=0; i<this._indicators.length; i++){
            let indicator = this._indicators[i];
            indicator.update();
        }
    },

    destroy: function() {
        for (let i=0; i<this._indicators.length; i++){
            let indicator = this._indicators[i];
            indicator.destroy();
        }
    }
});

/*
 * Base class to be inherited by all indicators of any kind
*/
const IndicatorBase = new Lang.Class({

    Name: 'DashToDock.IndicatorBase',

    _init: function(source, settings) {
        this._settings = settings;
        this._source = source;
        this._signalsHandler = new Utils.GlobalSignalsHandler();
    },

    update: function() {
    },

    destroy: function() {
        this._signalsHandler.destroy();
    }
});

/*
 * A base indicator class for running style, from which all other EunningIndicators should derive,
 * providing some basic methods, variables definitions and their update,  css style classes handling.
 *
 */
const RunningIndicatorBase = new Lang.Class({

    Name: 'DashToDock.RunningIndicatorBase',
    Extends: IndicatorBase,

    _init: function(source, settings) {

        this.parent(source, settings)

        this._side =  Utils.getPosition(this._settings);
        this._nWindows = 0;
        // These statuse take into account the workspace/monitor isolation
        this._isFocused = false;
        this._isRunning = false;
    },

    update: function() {
        // Limit to 1 to MAX_WINDOWS_CLASSES  windows classes
        this._nWindows = Math.min(this._source.getInterestingWindows().length, MAX_WINDOWS_CLASSES);

        // We need to check the number of windows, as the focus might be
        // happening on another monitor if using isolation
        if (tracker.focus_app == this._source.app && this._nWindows > 0)
            this._isFocused = true;
        else
            this._isFocused = false;

        // In the case of workspace isolation, we need to hide the dots of apps with
        // no windows in the current workspace
        if (this._source.app.state != Shell.AppState.STOPPED  && this._nWindows > 0)
            this._isRunning = true;
        else
            this._isRunning = false;

        this._updateCounterClass();
        this._updateFocusClass();
        this._updateDefaultDot();
    },

    _updateCounterClass: function() {
        for (let i = 1; i <= MAX_WINDOWS_CLASSES; i++) {
            let className = 'running' + i;
            if (i != this._nWindows)
                this._source.actor.remove_style_class_name(className);
            else
                this._source.actor.add_style_class_name(className);
        }
    },

    _updateFocusClass: function() {
        if (this._isFocused)
            this._source.actor.add_style_class_name('focused');
        else
            this._source.actor.remove_style_class_name('focused');
    },

    _updateDefaultDot: function() {
        if (this._isRunning)
            this._source._dot.show();
        else
            this._source._dot.hide();
    },

    _hideDefaultDot: function() {
        // I use opacity to hide the default dot because the show/hide function
        // are used by the parent class.
        this._source._dot.opacity = 0;
    },

    _restoreDefaultDot: function() {
        this._source._dot.opacity = 255;
    },

    destroy: function() {
        this.parent();
        this._restoreDefaultDot();
    }
});


const RunningIndicatorDots = new Lang.Class({

    Name: 'DashToDock.RunningIndicatorDots',
    Extends: RunningIndicatorBase,

    _init: function(source, settings) {

        this.parent(source, settings)

        this._hideDefaultDot();

        this._area = new St.DrawingArea({x_expand: true, y_expand: true});
        this._area.connect('repaint', Lang.bind(this, this._updateIndicator));
        this._source._iconContainer.add_child(this._area);

        let keys = ['custom-theme-running-dots-color',
                   'custom-theme-running-dots-border-color',
                   'custom-theme-running-dots-border-width'];

        keys.forEach(function(key) {
            this._signalsHandler.add([
                this._settings,
                'changed::' + key,
                Lang.bind(this, this.update)
            ]);
        }, this);
    },

    update: function() {
        this.parent();
        if (this._area)
            this._area.queue_repaint();
    },

     _computeStyle: function() {

        let [width, height] = this._area.get_surface_size();
        // As the canvas is rotated, invert width and height
        if (this._side == St.Side.LEFT || this._side == St.Side.RIGHT){
            this._width = height;
            this._height = width;
        } else {
            this._width = width;
            this._height = height;
        }

        if (!this._settings.get_boolean('apply-custom-theme')
            && this._settings.get_boolean('custom-theme-running-dots')
            && this._settings.get_boolean('custom-theme-customize-running-dots')) {
            this._borderColor = Clutter.color_from_string(this._settings.get_string('custom-theme-running-dots-border-color'))[1];
            this._borderWidth = this._settings.get_int('custom-theme-running-dots-border-width');
            this._bodyColor =  Clutter.color_from_string(this._settings.get_string('custom-theme-running-dots-color'))[1];
        }
        else {
            // Re-use the style - background color, and border width and color -
            // of the default dot
            let themeNode = this._source._dot.get_theme_node();
            this._borderColor = themeNode.get_border_color(this._side);
            this._borderWidth = themeNode.get_border_width(this._side);
            this._bodyColor = themeNode.get_background_color();
        }

        // Define the radius as an arbitrary size, but keep large enough to account
        // for the drawing of the border.
        this._radius = Math.max(this._width/22, this._borderWidth/2);
        this._padding = 0; // distance from the margin
        this._spacing = this._radius + this._borderWidth; // separation between the dots
     },

    _updateIndicator: function() {

        let area = this._area;
        let cr = this._area.get_context();

        this._computeStyle();

        // draw for the bottom case, rotate the canvas for other placements
        switch (this._side) {
        case St.Side.TOP:
            cr.rotate(Math.PI);
            cr.translate(-this._width, -this._height);
            break;

        case St.Side.BOTTOM:
            // nothing
            break;

        case St.Side.LEFT:
            cr.rotate(Math.PI/2);
            cr.translate(0, -this._height);
            break;

        case St.Side.RIGHT:
            cr.rotate(-Math.PI/2);
            cr.translate(-this._width, 0);
        }

        this._drawIndicator(cr);
        cr.$dispose();
    },

    _drawIndicator: function(cr) {
        // Draw the required numbers of dots
        let n = this._nWindows;

        cr.setLineWidth(this._borderWidth);
        Clutter.cairo_set_source_color(cr, this._borderColor);

        // draw for the bottom case:
        cr.translate((this._width - (2*n)*this._radius - (n-1)*this._spacing)/2, this._height - this._padding);
        for (let i = 0; i < n; i++) {
            cr.newSubPath();
            cr.arc((2*i+1)*this._radius + i*this._spacing, -this._radius - this._borderWidth/2, this._radius, 0, 2*Math.PI);
        }

        cr.strokePreserve();
        Clutter.cairo_set_source_color(cr, this._bodyColor);
        cr.fill();
    },

    destroy: function() {
        this.parent();
        this._area.destroy();
    }

});

// We need an icons theme object, this is the only way I managed to get
// pixel buffers that can be used for calculating the backlight color
let themeLoader = null;

// Global icon cache. Used for Unity7 styling.
let iconCacheMap = new Map();
// Max number of items to store
// We don't expect to ever reach this number, but let's put an hard limit to avoid
// even the remote possibility of the cached items to grow indefinitely.
const MAX_CACHED_ITEMS = 1000;
// When the size exceed it, the oldest 'n' ones are deleted
const  BATCH_SIZE_TO_DELETE = 50;
// The icon size used to extract the dominant color
const DOMINANT_COLOR_ICON_SIZE = 64;

const RunningIndicatorColoredBacklit = new Lang.Class({

    Name: 'DashToDock.RunningIndicatorColoredBacklit',
    Extends: RunningIndicatorDots,

    _init: function(source, settings) {

        this.parent(source, settings);

        // Apply glossy background
        // TODO: move to enable/disableBacklit to apply itonly to the running apps?
        // TODO: move to css class for theming support
        let path = imports.misc.extensionUtils.getCurrentExtension().path;
        let backgroundStyle = 'background-image: url(\'' + path + '/media/glossy.svg\');' +
                              'background-size: contain;';
        this._source._iconContainer.get_children()[1].set_style(backgroundStyle);
    },

    update: function() {
        this.parent();

        // Enable / Disable the backlight of running apps
        if (this._isRunning) {
            this._enableBacklight();

        // TODO DO we need this!?
        // Repaint the dots to make sure they have the correct color
        if (this._area)
            this._area.queue_repaint();
        } else {
            this._disableBacklight();
        }
    },

    _computeStyle: function() {
        this.parent()

        // Use dominant color for dots too


        let colorPalette = this._getColorPalette();

        // SLightly adjust the styling
        this._padding = 1.45;
        this._borderWidth = 2;

        if (colorPalette !== null) {
            this._borderColor = Clutter.color_from_string(colorPalette.lighter)[1] ;
            this._bodyColor = Clutter.color_from_string(colorPalette.darker)[1];
        } else {
            // Fallback
            this._borderColor = Clutter.color_from_string('white')[1];
            this._bodyColor = Clutter.color_from_string('gray')[1];
        }
    },

    _enableBacklight: function() {

        let colorPalette = this._getColorPalette();

        // Fallback
        if (colorPalette === null) {
            this._source._iconContainer.set_style(
                'border-radius: 5px;' +
                'background-gradient-direction: vertical;' +
                'background-gradient-start: #e0e0e0;' +
                'background-gradient-end: darkgray;'
            );

           return;
        }

        this._source._iconContainer.set_style(
            'border-radius: 5px;' +
            'background-gradient-direction: vertical;' +
            'background-gradient-start: ' + colorPalette.original + ';' +
            'background-gradient-end: ' +  colorPalette.darker + ';'
        );

    },

    _disableBacklight: function() {
        this._source._iconContainer.set_style(null);
    },

    /**
     * Try to get the pixel buffer for the current icon, if not fail gracefully
     */
    _getIconPixBuf: function() {
        let iconTexture = this._source.app.create_icon_texture(16);

        if (themeLoader === null) {
            let ifaceSettings = new Gio.Settings({ schema: "org.gnome.desktop.interface" });

            themeLoader = new Gtk.IconTheme(),
            themeLoader.set_custom_theme(ifaceSettings.get_string('icon-theme')); // Make sure the correct theme is loaded
        }

        // Unable to load the icon texture, use fallback
        if (iconTexture instanceof St.Icon === false) {
            return null;
        }

        iconTexture = iconTexture.get_gicon();

        // Unable to load the icon texture, use fallback
        if (iconTexture === null) {
            return null;
        }

        if (iconTexture instanceof Gio.FileIcon) {
            // Use GdkPixBuf to load the pixel buffer from the provided file path
            return GdkPixbuf.Pixbuf.new_from_file(iconTexture.get_file().get_path());
        }

        // Get the pixel buffer from the icon theme
        return themeLoader.load_icon(iconTexture.get_names()[0], DOMINANT_COLOR_ICON_SIZE, 0);
    },

    /**
     * The backlight color choosing algorithm was mostly ported to javascript from the
     * Unity7 C++ source of Canonicals:
     * http://bazaar.launchpad.net/~unity-team/unity/trunk/view/head:/launcher/LauncherIcon.cpp
     * so it more or less works the same way.
     */
    _getColorPalette: function() {
        if (iconCacheMap.get(this._source.app.get_id())) {
            // We already know the answer
            return iconCacheMap.get(this._source.app.get_id());
        }

        let pixBuf = this._getIconPixBuf();
        if (pixBuf == null)
            return null;

        let pixels = pixBuf.get_pixels(),
            offset = 0;

        let total  = 0,
            rTotal = 0,
            gTotal = 0,
            bTotal = 0;

        let resample_y = 1,
            resample_x = 1;

        // Resampling of large icons
        // We resample icons larger than twice the desired size, as the resampling
        // to a size s
        // DOMINANT_COLOR_ICON_SIZE < s < 2*DOMINANT_COLOR_ICON_SIZE,
        // most of the case exactly DOMINANT_COLOR_ICON_SIZE as the icon size is tipycally
        // a multiple of it.
        let width = pixBuf.get_width();
        let height = pixBuf.get_height();

        // Resample
        if (height >= 2* DOMINANT_COLOR_ICON_SIZE)
            resample_y = Math.floor(height/DOMINANT_COLOR_ICON_SIZE);

        if (width >= 2* DOMINANT_COLOR_ICON_SIZE)
            resample_x = Math.floor(width/DOMINANT_COLOR_ICON_SIZE);

        if (resample_x !==1 || resample_y !== 1)
            pixels = this._resamplePixels(pixels, resample_x, resample_y);

        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        let limit = pixels.length;
        for (let offset = 0; offset < limit; offset+=4) {
            let r = pixels[offset],
                g = pixels[offset + 1],
                b = pixels[offset + 2],
                a = pixels[offset + 3];

            let saturation = (Math.max(r,g, b) - Math.min(r,g, b));
            let relevance  = 0.1 * 255 * 255 + 0.9 * a * saturation;

            rTotal += r * relevance;
            gTotal += g * relevance;
            bTotal += b * relevance;

            total += relevance;
        }

        total = total * 255;

        let r = rTotal / total,
            g = gTotal / total,
            b = bTotal / total;

        let hsv = Utils.ColorUtils.RGBtoHSV(r * 255, g * 255, b * 255);

        if (hsv.s > 0.15)
            hsv.s = 0.65;
        hsv.v = 0.90;

        let rgb = Utils.ColorUtils.HSVtoRGB(hsv.h, hsv.s, hsv.v);

        // Cache the result.
        let backgroundColor = {
            lighter:  Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0.2),
            original: Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0),
            darker:   Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, -0.5)
        };

        if (iconCacheMap.size >= MAX_CACHED_ITEMS) {
            //delete oldest cached values (which are in order of insertions)
            let ctr=0;
            for (let key of iconCacheMap.keys()) {
                if (++ctr > BATCH_SIZE_TO_DELETE)
                    break;
                iconCacheMap.delete(key);
            }
        }

        iconCacheMap.set(this._source.app.get_id(), backgroundColor);

        return backgroundColor;
    },

    /**
     * Downsample large icons before scanning for the backlight color to
     * improve performance.
     *
     * @param pixBuf
     * @param pixels
     * @param resampleX
     * @param resampleY
     *
     * @return [];
     */
    _resamplePixels: function (pixels, resampleX, resampleY) {
        let resampledPixels = [];
        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        let limit = pixels.length / (resampleX * resampleY) / 4;
        for (let i = 0; i < limit; i++) {
            let pixel = i * resampleX * resampleY;

            resampledPixels.push(pixels[pixel * 4]);
            resampledPixels.push(pixels[pixel * 4 + 1]);
            resampledPixels.push(pixels[pixel * 4 + 2]);
            resampledPixels.push(pixels[pixel * 4 + 3]);
        }

        return resampledPixels;
    },

    destroy: function() {
        this._disableBacklight();
        // Remove glossy background if the children still exists
        if (this._source._iconContainer.get_children().length > 1)
            this._source._iconContainer.get_children()[1].set_style(null);

        this.parent();
    }
});

/*
 * Unity like notification and progress indicators
 */
const UnityIndicator = new Lang.Class({
    Name: 'DashToDock.UnityIndicator',
    Extends: IndicatorBase,

    _init: function(source, settings) {

        this.parent(source, settings);

        this._notificationBadgeLabel = new St.Label();
        this._notificationBadgeBin = new St.Bin({
            child: this._notificationBadgeLabel,
            x_align: St.Align.END, y_align: St.Align.START,
            x_expand: true, y_expand: true
        });
        this._notificationBadgeLabel.add_style_class_name('notification-badge');
        this._notificationBadgeCount = 0;
        this._notificationBadgeBin.hide();

        this._source._iconContainer.add_child(this._notificationBadgeBin);
        this._source._iconContainer.connect('allocation-changed', Lang.bind(this, this.updateNotificationBadge));

        this._remoteEntries = [];
        this._source.remoteModel.lookupById(this._source.app.id).forEach(
            Lang.bind(this, function(entry) {
                this.insertEntryRemote(entry);
            })
        );

        this._signalsHandler.add([
            this._source.remoteModel,
            'entry-added',
            Lang.bind(this, this._onLauncherEntryRemoteAdded)
        ], [
            this._source.remoteModel,
            'entry-removed',
            Lang.bind(this, this._onLauncherEntryRemoteRemoved)
        ])
    },

    _onLauncherEntryRemoteAdded: function(remoteModel, entry) {
        if (!entry || !entry.appId())
            return;
        if (this._source && this._source.app && this._source.app.id == entry.appId()) {
            this.insertEntryRemote(entry);
        }
    },

    _onLauncherEntryRemoteRemoved: function(remoteModel, entry) {
        if (!entry || !entry.appId())
            return;

        if (this._source && this._source.app && this._source.app.id == entry.appId()) {
            this.removeEntryRemote(entry);
        }
    },

    updateNotificationBadge: function() {
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let [minWidth, natWidth] = this._source._iconContainer.get_preferred_width(-1);
        let logicalNatWidth = natWidth / scaleFactor;
        let font_size = Math.max(10, Math.round(logicalNatWidth / 5));
        let margin_left = Math.round(logicalNatWidth / 4);

        this._notificationBadgeLabel.set_style(
           'font-size: ' + font_size + 'px;' +
           'margin-left: ' + margin_left + 'px;'
        );

        this._notificationBadgeBin.width = Math.round(logicalNatWidth - margin_left);
        this._notificationBadgeLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
    },

    _notificationBadgeCountToText: function(count) {
        if (count <= 9999) {
            return count.toString();
        } else if (count < 1e5) {
            let thousands = count / 1e3;
            return thousands.toFixed(1).toString() + "k";
        } else if (count < 1e6) {
            let thousands = count / 1e3;
            return thousands.toFixed(0).toString() + "k";
        } else if (count < 1e8) {
            let millions = count / 1e6;
            return millions.toFixed(1).toString() + "M";
        } else if (count < 1e9) {
            let millions = count / 1e6;
            return millions.toFixed(0).toString() + "M";
        } else {
            let billions = count / 1e9;
            return billions.toFixed(1).toString() + "B";
        }
    },

    setNotificationBadge: function(count) {
        this._notificationBadgeCount = count;
        let text = this._notificationBadgeCountToText(count);
        this._notificationBadgeLabel.set_text(text);
    },

    toggleNotificationBadge: function(activate) {
        if (activate && this._notificationBadgeCount > 0) {
            this.updateNotificationBadge();
            this._notificationBadgeBin.show();
        }
        else
            this._notificationBadgeBin.hide();
    },

    _showProgressOverlay: function() {
        if (this._progressOverlayArea) {
            this._updateProgressOverlay();
            return;
        }

        this._progressOverlayArea = new St.DrawingArea({x_expand: true, y_expand: true});
        this._progressOverlayArea.connect('repaint', Lang.bind(this, function() {
            this._drawProgressOverlay(this._progressOverlayArea);
        }));

        this._source._iconContainer.add_child(this._progressOverlayArea);
        this._updateProgressOverlay();
    },

    _hideProgressOverlay: function() {
        if (this._progressOverlayArea)
            this._progressOverlayArea.destroy();
        this._progressOverlayArea = null;
    },

    _updateProgressOverlay: function() {
        if (this._progressOverlayArea)
            this._progressOverlayArea.queue_repaint();
    },

    _drawProgressOverlay: function(area) {
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let [surfaceWidth, surfaceHeight] = area.get_surface_size();
        let cr = area.get_context();

        let iconSize = this._source.icon.iconSize * scaleFactor;

        let x = Math.floor((surfaceWidth - iconSize) / 2);
        let y = Math.floor((surfaceHeight - iconSize) / 2);

        let lineWidth = Math.floor(1.0 * scaleFactor);
        let padding = Math.floor(iconSize * 0.05);
        let width = iconSize - 2.0*padding;
        let height = Math.floor(Math.min(18.0*scaleFactor, 0.20*iconSize));
        x += padding;
        y += iconSize - height - padding;

        cr.setLineWidth(lineWidth);

        // Draw the outer stroke
        let stroke = new Cairo.LinearGradient(0, y, 0, y + height);
        let fill = null;
        stroke.addColorStopRGBA(0.5, 0.5, 0.5, 0.5, 0.1);
        stroke.addColorStopRGBA(0.9, 0.8, 0.8, 0.8, 0.4);
        Utils.drawRoundedLine(cr, x + lineWidth/2.0, y + lineWidth/2.0, width, height, true, true, stroke, fill);

        // Draw the background
        x += lineWidth;
        y += lineWidth;
        width -= 2.0*lineWidth;
        height -= 2.0*lineWidth;

        stroke = Cairo.SolidPattern.createRGBA(0.20, 0.20, 0.20, 0.9);
        fill = new Cairo.LinearGradient(0, y, 0, y + height);
        fill.addColorStopRGBA(0.4, 0.25, 0.25, 0.25, 1.0);
        fill.addColorStopRGBA(0.9, 0.35, 0.35, 0.35, 1.0);
        Utils.drawRoundedLine(cr, x + lineWidth/2.0, y + lineWidth/2.0, width, height, true, true, stroke, fill);

        // Draw the finished bar
        x += lineWidth;
        y += lineWidth;
        width -= 2.0*lineWidth;
        height -= 2.0*lineWidth;

        let finishedWidth = Math.ceil(this._progress * width);
        stroke = Cairo.SolidPattern.createRGBA(0.8, 0.8, 0.8, 1.0);
        fill = Cairo.SolidPattern.createRGBA(0.9, 0.9, 0.9, 1.0);

        if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
            Utils.drawRoundedLine(cr, x + lineWidth/2.0 + width - finishedWidth, y + lineWidth/2.0, finishedWidth, height, true, true, stroke, fill);
        else
            Utils.drawRoundedLine(cr, x + lineWidth/2.0, y + lineWidth/2.0, finishedWidth, height, true, true, stroke, fill);

        cr.$dispose();
    },

    setProgress: function(progress) {
        this._progress = Math.min(Math.max(progress, 0.0), 1.0);
        this._updateProgressOverlay();
    },

    toggleProgressOverlay: function(activate) {
        if (activate) {
            this._showProgressOverlay();
        }
        else {
            this._hideProgressOverlay();
        }
    },

    insertEntryRemote: function(remote) {
        if (!remote || this._remoteEntries.indexOf(remote) !== -1)
            return;

        this._remoteEntries.push(remote);
        this._selectEntryRemote(remote);
    },

    removeEntryRemote: function(remote) {
        if (!remote || this._remoteEntries.indexOf(remote) == -1)
            return;

        this._remoteEntries.splice(this._remoteEntries.indexOf(remote), 1);

        if (this._remoteEntries.length > 0) {
            this._selectEntryRemote(this._remoteEntries[this._remoteEntries.length-1]);
        } else {
            this.setNotificationBadge(0);
            this.toggleNotificationBadge(false);
            this.setProgress(0);
            this.toggleProgressOverlay(false);
        }
    },

    _selectEntryRemote: function(remote) {
        if (!remote)
            return;

        this._signalsHandler.removeWithLabel('entry-remotes');

        this._signalsHandler.addWithLabel('entry-remotes',
        [
            remote,
            'count-changed',
            Lang.bind(this, (remote, value) => {
                this.setNotificationBadge(value);
            })
        ], [
            remote,
            'count-visible-changed',
            Lang.bind(this, (remote, value) => {
                this.toggleNotificationBadge(value);
            })
        ], [
            remote,
            'progress-changed',
            Lang.bind(this, (remote, value) => {
                this.setProgress(value);
            })
        ], [
            remote,
            'progress-visible-changed',
            Lang.bind(this, (remote, value) => {
                this.toggleProgressOverlay(value);
            })
        ]);

        this.setNotificationBadge(remote.count());
        this.toggleNotificationBadge(remote.countVisible());
        this.setProgress(remote.progress());
        this.toggleProgressOverlay(remote.progressVisible());
    }
});