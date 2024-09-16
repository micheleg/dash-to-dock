import {
    Clutter,
    Cogl,
    GdkPixbuf,
    Gio,
    GObject,
    Pango,
    St,
} from './dependencies/gi.js';

import {Main} from './dependencies/shell/ui.js';

import {
    Docking,
    Utils,
} from './imports.js';

const {cairo: Cairo} = imports;

const RunningIndicatorStyle = Object.freeze({
    DEFAULT: 0,
    DOTS: 1,
    SQUARES: 2,
    DASHES: 3,
    SEGMENTED: 4,
    SOLID: 5,
    CILIORA: 6,
    METRO: 7,
    BINARY: 8,
    DOT: 9,
});

const MAX_WINDOWS_CLASSES = 4;


/*
 * This is the main indicator class to be used. The desired behavior is
 * obtained by composing the desired classes below based on the settings.
 *
 */
export class AppIconIndicator {
    constructor(source) {
        this._indicators = [];

        // Choose the style for the running indicators
        let runningIndicator = null;
        let runningIndicatorStyle;

        const {settings} = Docking.DockManager;
        if (settings.applyCustomTheme)
            runningIndicatorStyle = RunningIndicatorStyle.DOTS;
        else
            ({runningIndicatorStyle} = settings);

        if (settings.showIconsEmblems &&
            !Docking.DockManager.getDefault().notificationsMonitor.dndMode) {
            const unityIndicator = new UnityIndicator(source);
            this._indicators.push(unityIndicator);
        }

        switch (runningIndicatorStyle) {
        case RunningIndicatorStyle.DEFAULT:
            runningIndicator = new RunningIndicatorDefault(source);
            break;

        case RunningIndicatorStyle.DOTS:
            runningIndicator = new RunningIndicatorDots(source);
            break;

        case RunningIndicatorStyle.SQUARES:
            runningIndicator = new RunningIndicatorSquares(source);
            break;

        case RunningIndicatorStyle.DASHES:
            runningIndicator = new RunningIndicatorDashes(source);
            break;

        case RunningIndicatorStyle.SEGMENTED:
            runningIndicator = new RunningIndicatorSegmented(source);
            break;

        case RunningIndicatorStyle.SOLID:
            runningIndicator = new RunningIndicatorSolid(source);
            break;

        case RunningIndicatorStyle.CILIORA:
            runningIndicator = new RunningIndicatorCiliora(source);
            break;

        case RunningIndicatorStyle.METRO:
            runningIndicator = new RunningIndicatorMetro(source);
            break;

        case RunningIndicatorStyle.BINARY:
            runningIndicator = new RunningIndicatorBinary(source);
            break;

        case RunningIndicatorStyle.DOT:
            runningIndicator = new RunningIndicatorDot(source);
            break;

        default:
            runningIndicator = new RunningIndicatorBase(source);
        }

        this._indicators.push(runningIndicator);
    }

    update() {
        for (let i = 0; i < this._indicators.length; i++) {
            const indicator = this._indicators[i];
            indicator.update();
        }
    }

    destroy() {
        for (let i = 0; i < this._indicators.length; i++) {
            const indicator = this._indicators[i];
            indicator.destroy();
        }
    }
}

/*
 * Base class to be inherited by all indicators of any kind
*/
class IndicatorBase {
    constructor(source) {
        this._source = source;
        this._signalsHandler = new Utils.GlobalSignalsHandler(this._source);
    }

    update() {
    }

    destroy() {
        this._source = null;
        this._signalsHandler.destroy();
        this._signalsHandler = null;
    }
}

/*
 * A base indicator class for running style, from which all other RunningIndicators should derive,
 * providing some basic methods, variables definitions and their update,  css style classes handling.
 *
 */
class RunningIndicatorBase extends IndicatorBase {
    constructor(source) {
        super(source);

        this._side = Utils.getPosition();
        this._dominantColorExtractor = new DominantColorExtractor(this._source.app);
        this._signalsHandler.add(this._source, 'notify::running', () => this.update());
        this._signalsHandler.add(this._source, 'notify::focused', () => this.update());
        this._signalsHandler.add(this._source, 'notify::windows-count', () => this._updateCounterClass());
        this.update();
    }

    get _number() {
        return Math.min(this._source.windowsCount, MAX_WINDOWS_CLASSES);
    }

    update() {
        this._updateCounterClass();
        this._updateDefaultDot();
    }

    _updateCounterClass() {
        for (let i = 1; i <= MAX_WINDOWS_CLASSES; i++) {
            const className = `running${i}`;
            if (i !== this._number)
                this._source.remove_style_class_name(className);
            else
                this._source.add_style_class_name(className);
        }
    }

    _updateDefaultDot() {
        if (this._source.running)
            this._source._dot.show();
        else
            this._source._dot.hide();
    }

    _hideDefaultDot() {
        // I use opacity to hide the default dot because the show/hide function
        // are used by the parent class.
        this._source._dot.opacity = 0;
    }

    _restoreDefaultDot() {
        this._source._dot.opacity = 255;
    }

    _enableBacklight() {
        const colorPalette = this._dominantColorExtractor._getColorPalette();

        // Fallback
        if (!colorPalette) {
            this._source._iconContainer.set_style(
                'border-radius: 5px;' +
                'background-gradient-direction: vertical;' +
                'background-gradient-start: #e0e0e0;' +
                'background-gradient-end: darkgray;'
            );

            return;
        }

        this._source._iconContainer.set_style(
            `${'border-radius: 5px;' +
            'background-gradient-direction: vertical;' +
            'background-gradient-start: '}${colorPalette.original};` +
            `background-gradient-end: ${colorPalette.darker};`
        );
    }

    _disableBacklight() {
        this._source._iconContainer.set_style(null);
    }

    destroy() {
        this._disableBacklight();
        // Remove glossy background if the children still exists
        if (this._source._iconContainer.get_children().length > 1)
            this._source._iconContainer.get_children()[1].set_style(null);
        this._restoreDefaultDot();

        super.destroy();
    }
}

// We add a css class so third parties themes can limit their indicator customization
// to the case we do nothing
class RunningIndicatorDefault extends RunningIndicatorBase {
    constructor(source) {
        super(source);
        this._source.add_style_class_name('default');
    }

    destroy() {
        this._source.remove_style_class_name('default');
        super.destroy();
    }
}

const IndicatorDrawingArea = GObject.registerClass(
class IndicatorDrawingArea extends St.DrawingArea {
    vfunc_allocate(box) {
        if (box.x1 !== 0 || box.y1 !== 0)
            return super.vfunc_allocate(box);

        // We assume that the are is a rectangle in the operations below:
        const size = Math.min(box.get_width(), box.get_height());
        box.x2 = size;
        box.y2 = size;
        this.set_allocation(box);

        return super.vfunc_allocate(box);
    }
});

class RunningIndicatorDots extends RunningIndicatorBase {
    constructor(source) {
        super(source);

        this._hideDefaultDot();

        this._area = new IndicatorDrawingArea({
            x_expand: true,
            y_expand: true,
        });

        // We draw for the bottom case and rotate the canvas for other placements
        // set center of rotations to the center
        this._area.set_pivot_point(0.5, 0.5);

        switch (this._side) {
        case St.Side.TOP:
            this._area.rotation_angle_z = 180;
            break;

        case St.Side.BOTTOM:
            // nothing
            break;

        case St.Side.LEFT:
            this._area.rotation_angle_z = 90;
            break;

        case St.Side.RIGHT:
            this._area.rotation_angle_z = -90;
            break;
        }

        this._area.connect('repaint', this._updateIndicator.bind(this));
        this._source._iconContainer.add_child(this._area);

        const keys = ['custom-theme-running-dots-color',
            'custom-theme-running-dots-border-color',
            'custom-theme-running-dots-border-width',
            'custom-theme-customize-running-dots',
            'unity-backlit-items',
            'apply-glossy-effect',
            'running-indicator-dominant-color'];

        keys.forEach(function (key) {
            this._signalsHandler.add(
                Docking.DockManager.settings,
                `changed::${key}`,
                this.update.bind(this)
            );
        }, this);

        // Apply glossy background
        // TODO: move to enable/disableBacklit to apply it only to the running apps?
        // TODO: move to css class for theming support
        const {extension} = Docking.DockManager;
        this._glossyBackgroundStyle = `background-image: url('${extension.path}/media/glossy.svg');` +
                                      'background-size: contain;';
    }

    update() {
        super.update();

        // Enable / Disable the backlight of running apps
        if (!Docking.DockManager.settings.applyCustomTheme &&
            Docking.DockManager.settings.unityBacklitItems) {
            const [icon] = this._source._iconContainer.get_children();
            icon.set_style(
                Docking.DockManager.settings.applyGlossyEffect
                    ? this._glossyBackgroundStyle : null);
            if (this._source.running)
                this._enableBacklight();
            else
                this._disableBacklight();
        } else {
            this._disableBacklight();
            this._source._iconContainer.get_children()[1].set_style(null);
        }

        if (this._area)
            this._area.queue_repaint();
    }

    _computeStyle() {
        const [width, height] = this._area.get_surface_size();
        this._width = height;
        this._height = width;

        // By default re-use the style - background color, and border width and color -
        // of the default dot
        const themeNode = this._source._dot.get_theme_node();
        this._borderColor = themeNode.get_border_color(this._side);
        this._borderWidth = themeNode.get_border_width(this._side);
        this._bodyColor = themeNode.get_background_color();

        const {settings} = Docking.DockManager;
        if (!settings.applyCustomTheme) {
            // Adjust for the backlit case
            const Color = Clutter.Color ?? Cogl.Color;

            if (settings.unityBacklitItems) {
                // Use dominant color for dots too if the backlit is enables
                const colorPalette = this._dominantColorExtractor._getColorPalette();

                // Slightly adjust the styling
                this._borderWidth = 2;

                if (colorPalette) {
                    [, this._borderColor] = Color.from_string(colorPalette.lighter);
                    [, this._bodyColor] = Color.from_string(colorPalette.darker);
                } else {
                    // Fallback
                    [, this._borderColor] = Color.from_string('white');
                    [, this._bodyColor] = Color.from_string('gray');
                }
            }

            // Apply dominant color if requested
            if (settings.runningIndicatorDominantColor) {
                const colorPalette = this._dominantColorExtractor._getColorPalette();
                if (colorPalette)
                    [, this._bodyColor] = Color.from_string(colorPalette.original);
                else
                    // Fallback
                    [, this._bodyColor] = Color.from_string(settings.customThemeRunningDotsColor);
            }

            // Finally, use customize style if requested
            if (settings.customThemeCustomizeRunningDots) {
                [, this._borderColor] = Color.from_string(settings.customThemeRunningDotsBorderColor);
                this._borderWidth = settings.customThemeRunningDotsBorderWidth;
                [, this._bodyColor] =  Color.from_string(settings.customThemeRunningDotsColor);
            }
        }

        // Define the radius as an arbitrary size, but keep large enough to account
        // for the drawing of the border.
        this._radius = Math.max(this._width / 22, this._borderWidth / 2);
        this._padding = 0; // distance from the margin
        this._spacing = this._radius + this._borderWidth; // separation between the dots
    }

    _updateIndicator() {
        const cr = this._area.get_context();

        this._computeStyle();
        this._drawIndicator(cr);
        cr.$dispose();
    }

    _drawIndicator(cr) {
        // Draw the required numbers of dots
        const n = this._number;

        cr.setLineWidth(this._borderWidth);
        Utils.cairoSetSourceColor(cr, this._borderColor);

        // draw for the bottom case:
        cr.translate(
            (this._width - (2 * n) * this._radius - (n - 1) * this._spacing) / 2,
            this._height - this._padding);

        for (let i = 0; i < n; i++) {
            cr.newSubPath();
            cr.arc((2 * i + 1) * this._radius + i * this._spacing,
                -this._radius - this._borderWidth / 2,
                this._radius, 0, 2 * Math.PI);
        }

        cr.strokePreserve();
        Utils.cairoSetSourceColor(cr, this._bodyColor);
        cr.fill();
    }

    destroy() {
        this._area.destroy();
        super.destroy();
    }
}

// Adapted from dash-to-panel by Jason DeRose
// https://github.com/jderose9/dash-to-panel
class RunningIndicatorCiliora extends RunningIndicatorDots {
    _drawIndicator(cr) {
        if (this._source.running) {
            const size =  Math.max(this._width / 20, this._borderWidth);
            const spacing = size; // separation between the dots
            const lineLength = this._width - (size * (this._number - 1)) - (spacing * (this._number - 1));
            let padding = this._borderWidth;
            // For the backlit case here we don't want the outer border visible
            if (Docking.DockManager.settings.unityBacklitItems &&
                !Docking.DockManager.settings.customThemeCustomizeRunningDots)
                padding = 0;
            const yOffset = this._height - padding - size;

            cr.setLineWidth(this._borderWidth);
            Utils.cairoSetSourceColor(cr, this._borderColor);

            cr.translate(0, yOffset);
            cr.newSubPath();
            cr.rectangle(0, 0, lineLength, size);
            for (let i = 1; i < this._number; i++) {
                cr.newSubPath();
                cr.rectangle(lineLength + (i * spacing) + ((i - 1) * size), 0, size, size);
            }

            cr.strokePreserve();
            Utils.cairoSetSourceColor(cr, this._bodyColor);
            cr.fill();
        }
    }
}

// Adapted from dash-to-panel by Jason DeRose
// https://github.com/jderose9/dash-to-panel
class RunningIndicatorSegmented extends RunningIndicatorDots {
    _drawIndicator(cr) {
        if (this._source.running) {
            const size =  Math.max(this._width / 20, this._borderWidth);
            const spacing = Math.ceil(this._width / 18); // separation between the dots
            const dashLength = Math.ceil((this._width - ((this._number - 1) * spacing)) / this._number);
            let padding = this._borderWidth;
            // For the backlit case here we don't want the outer border visible
            if (Docking.DockManager.settings.unityBacklitItems &&
                !Docking.DockManager.settings.customThemeCustomizeRunningDots)
                padding = 0;
            const yOffset = this._height - padding - size;

            cr.setLineWidth(this._borderWidth);
            Utils.cairoSetSourceColor(cr, this._borderColor);

            cr.translate(0, yOffset);
            for (let i = 0; i < this._number; i++) {
                cr.newSubPath();
                cr.rectangle(i * dashLength + i * spacing, 0, dashLength, size);
            }

            cr.strokePreserve();
            Utils.cairoSetSourceColor(cr, this._bodyColor);
            cr.fill();
        }
    }
}

// Adapted from dash-to-panel by Jason DeRose
// https://github.com/jderose9/dash-to-panel
class RunningIndicatorSolid extends RunningIndicatorDots {
    _drawIndicator(cr) {
        if (this._source.running) {
            const size =  Math.max(this._width / 20, this._borderWidth);
            let padding = this._borderWidth;
            // For the backlit case here we don't want the outer border visible
            if (Docking.DockManager.settings.unityBacklitItems &&
                !Docking.DockManager.settings.customThemeCustomizeRunningDots)
                padding = 0;
            const yOffset = this._height - padding - size;

            cr.setLineWidth(this._borderWidth);
            Utils.cairoSetSourceColor(cr, this._borderColor);

            cr.translate(0, yOffset);
            cr.newSubPath();
            cr.rectangle(0, 0, this._width, size);

            cr.strokePreserve();
            Utils.cairoSetSourceColor(cr, this._bodyColor);
            cr.fill();
        }
    }
}

// Adapted from dash-to-panel by Jason DeRose
// https://github.com/jderose9/dash-to-panel
class RunningIndicatorSquares extends RunningIndicatorDots {
    _drawIndicator(cr) {
        if (this._source.running) {
            const size =  Math.max(this._width / 11, this._borderWidth);
            const padding = this._borderWidth;
            const spacing = Math.ceil(this._width / 18); // separation between the dots
            const yOffset = this._height - padding - size;

            cr.setLineWidth(this._borderWidth);
            Utils.cairoSetSourceColor(cr, this._borderColor);

            cr.translate(
                Math.floor((this._width - this._number * size - (this._number - 1) * spacing) / 2),
                yOffset);

            for (let i = 0; i < this._number; i++) {
                cr.newSubPath();
                cr.rectangle(i * size + i * spacing, 0, size, size);
            }
            cr.strokePreserve();
            Utils.cairoSetSourceColor(cr, this._bodyColor);
            cr.fill();
        }
    }
}

// Adapted from dash-to-panel by Jason DeRose
// https://github.com/jderose9/dash-to-panel
class RunningIndicatorDashes extends RunningIndicatorDots {
    _drawIndicator(cr) {
        if (this._source.running) {
            const size =  Math.max(this._width / 20, this._borderWidth);
            const padding = this._borderWidth;
            const spacing = Math.ceil(this._width / 18); // separation between the dots
            const dashLength = Math.floor(this._width / 4) - spacing;
            const yOffset = this._height - padding - size;

            cr.setLineWidth(this._borderWidth);
            Utils.cairoSetSourceColor(cr, this._borderColor);

            cr.translate(
                Math.floor((this._width - this._number * dashLength - (this._number - 1) * spacing) / 2),
                yOffset);

            for (let i = 0; i < this._number; i++) {
                cr.newSubPath();
                cr.rectangle(i * dashLength + i * spacing, 0, dashLength, size);
            }

            cr.strokePreserve();
            Utils.cairoSetSourceColor(cr, this._bodyColor);
            cr.fill();
        }
    }
}

// Adapted from dash-to-panel by Jason DeRose
// https://github.com/jderose9/dash-to-panel
class RunningIndicatorMetro extends RunningIndicatorDots {
    constructor(source) {
        super(source);
        this._source.add_style_class_name('metro');
    }

    destroy() {
        this._source.remove_style_class_name('metro');
        super.destroy();
    }

    _drawIndicator(cr) {
        if (this._source.running) {
            const size =  Math.max(this._width / 20, this._borderWidth);
            let padding = 0;
            // For the backlit case here we don't want the outer border visible
            if (Docking.DockManager.settings.unityBacklitItems &&
                !Docking.DockManager.settings.customThemeCustomizeRunningDots)
                padding = 0;
            const yOffset = this._height - padding - size;

            const n = this._number;
            if (n <= 1) {
                cr.translate(0, yOffset);
                Utils.cairoSetSourceColor(cr, this._bodyColor);
                cr.newSubPath();
                cr.rectangle(0, 0, this._width, size);
                cr.fill();
            } else {
                // need to scale with the SVG for the stacked highlight
                const blackenedLength = (1 / 48) * this._width;
                const darkenedLength = this._source.focused
                    ? (2 / 48) * this._width : (10 / 48) * this._width;
                const blackenedColor = this._bodyColor.shade(.3);
                const darkenedColor = this._bodyColor.shade(.7);

                cr.translate(0, yOffset);

                Utils.cairoSetSourceColor(cr, this._bodyColor);
                cr.newSubPath();
                cr.rectangle(0, 0, this._width - darkenedLength - blackenedLength, size);
                cr.fill();
                Utils.cairoSetSourceColor(cr, blackenedColor);
                cr.newSubPath();
                cr.rectangle(this._width - darkenedLength - blackenedLength, 0, 1, size);
                cr.fill();
                Utils.cairoSetSourceColor(cr, darkenedColor);
                cr.newSubPath();
                cr.rectangle(this._width - darkenedLength, 0, darkenedLength, size);
                cr.fill();
            }
        }
    }
}

class RunningIndicatorBinary extends RunningIndicatorDots {
    _drawIndicator(cr) {
        // Draw the required numbers of dots
        const n = Math.min(15, this._source.windowsCount);

        if (this._source.running) {
            const size =  Math.max(this._width / 11, this._borderWidth);
            const spacing = Math.ceil(this._width / 18);
            const yOffset = this._height - size;
            const binaryValue = String(`0000${(n >>> 0).toString(2)}`).slice(-4);

            cr.setLineWidth(this._borderWidth);
            Utils.cairoSetSourceColor(cr, this._borderColor);

            cr.translate(Math.floor((this._width - 4 * size - (4 - 1) * spacing) / 2), yOffset);
            for (let i = 0; i < binaryValue.length; i++) {
                if (binaryValue[i] === '1') {
                    cr.newSubPath();
                    cr.arc((2 * i + 1) * this._radius + i * spacing,
                        -this._radius - this._borderWidth / 2,
                        this._radius, 0, 2 * Math.PI);
                } else {
                    cr.newSubPath();
                    cr.rectangle(i * size + i * spacing,
                        -this._radius - this._borderWidth / 2 - size / 5,
                        size, size / 3);
                }
            }
            cr.strokePreserve();
            Utils.cairoSetSourceColor(cr, this._bodyColor);
            cr.fill();
        }
    }
}

class RunningIndicatorDot extends RunningIndicatorDots {
    _computeStyle() {
        super._computeStyle();

        this._radius = Math.max(this._width / 26, this._borderWidth / 2);
    }

    _drawIndicator(cr) {
        if (!this._source.running)
            return;

        cr.setLineWidth(this._borderWidth);
        Utils.cairoSetSourceColor(cr, this._borderColor);

        // draw from the bottom case:
        cr.translate(
            (this._width - 2 * this._radius) / 2,
            this._height - this._padding);
        cr.newSubPath();
        cr.arc(this._radius,
            -this._radius - this._borderWidth / 2,
            this._radius, 0, 2 * Math.PI);

        cr.strokePreserve();
        Utils.cairoSetSourceColor(cr, this._bodyColor);
        cr.fill();
    }
}

/*
 * Unity like notification and progress indicators
 */
export class UnityIndicator extends IndicatorBase {
    static defaultProgressBar = {
        // default values for the progress bar itself
        background: {
            colorStart: {red: 204, green: 204, blue: 204, alpha: 255},
            colorEnd: null,
        },
        border: {
            colorStart: {red: 230, green: 230, blue: 230, alpha: 255},
            colorEnd: null,
        },
    };

    static defaultProgressBarTrack = {
        // default values for the progress bar track
        background: {
            colorStart: {red: 64, green: 64, blue: 64, alpha: 255},
            colorEnd: {red: 89, green: 89, blue: 89, alpha: 255},
            offsetStart: 0.4,
            offsetEnd: 0.9,
        },
        border: {
            colorStart: {red: 128, green: 128, blue: 128, alpha: 26},
            colorEnd: {red: 204, green: 204, blue: 204, alpha: 102},
            offsetStart: 0.5,
            offsetEnd: 0.9,
        },
    };

    static notificationBadgeSignals = Symbol('notification-badge-signals');

    constructor(source) {
        super(source);

        const {remoteModel, notificationsMonitor} = Docking.DockManager.getDefault();
        const remoteEntry = remoteModel.lookupById(this._source.app.id);
        this._remoteEntry = remoteEntry;

        this._signalsHandler.add([
            remoteEntry,
            ['count-changed', 'count-visible-changed'],
            () => this._updateNotificationsCount(),
        ], [
            remoteEntry,
            ['progress-changed', 'progress-visible-changed'],
            (sender, {progress, progress_visible: progressVisible}) =>
                this.setProgress(progressVisible ? progress : -1),
        ], [
            remoteEntry,
            'urgent-changed',
            (sender, {urgent}) => this.setUrgent(urgent),
        ], [
            remoteEntry,
            'updating-changed',
            (sender, {updating}) => this.setUpdating(updating),
        ], [
            notificationsMonitor,
            'changed',
            () => this._updateNotificationsCount(),
        ], [
            this._source,
            'style-changed',
            () => this._updateIconStyle(),
        ]);

        this._updateNotificationsCount();
        this.setProgress(this._remoteEntry.progress_visible
            ? this._remoteEntry.progress : -1);
        this.setUrgent(this._remoteEntry.urgent);
        this.setUpdating(this._remoteEntry.updating);
    }

    destroy() {
        this._notificationBadgeBin?.destroy();
        this._notificationBadgeBin = null;
        this._hideProgressOverlay();
        this.setUrgent(false);
        this.setUpdating(false);
        this._remoteEntry = null;

        super.destroy();
    }

    _updateNotificationBadgeStyle() {
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const fontDesc = themeContext.get_font();
        const defaultFontSize = fontDesc.get_size() / 1024;
        let fontSize = defaultFontSize * 0.9;
        const {iconSize} = Main.overview.dash;
        const defaultIconSize = Docking.DockManager.settings.get_default_value(
            'dash-max-icon-size').unpack();

        if (!fontDesc.get_size_is_absolute()) {
            // fontSize was expressed in points, so convert to pixel
            fontSize /= 0.75;
        }

        let sizeMultiplier;
        if (iconSize < defaultIconSize) {
            sizeMultiplier = Math.max(24, Math.min(iconSize +
                iconSize * 0.3, defaultIconSize)) / defaultIconSize;
        } else {
            sizeMultiplier = iconSize / defaultIconSize;
        }

        fontSize = Math.round(sizeMultiplier * fontSize);
        const leftMargin = Math.round(sizeMultiplier * 3);

        this._notificationBadgeBin.child.set_style(
            `font-size: ${fontSize}px;` +
            `margin-left: ${leftMargin}px`
        );
    }

    _notificationBadgeCountToText(count) {
        if (count <= 9999) {
            return count.toString();
        } else if (count < 1e5) {
            const thousands = count / 1e3;
            return `${thousands.toFixed(1).toString()}k`;
        } else if (count < 1e6) {
            const thousands = count / 1e3;
            return `${thousands.toFixed(0).toString()}k`;
        } else if (count < 1e8) {
            const millions = count / 1e6;
            return `${millions.toFixed(1).toString()}M`;
        } else if (count < 1e9) {
            const millions = count / 1e6;
            return `${millions.toFixed(0).toString()}M`;
        } else {
            const billions = count / 1e9;
            return `${billions.toFixed(1).toString()}B`;
        }
    }

    _updateNotificationsCount() {
        const remoteCount = this._remoteEntry['count-visible']
            ? this._remoteEntry.count ?? 0 : 0;

        if (remoteCount > 0 &&
            Docking.DockManager.settings.applicationCounterOverridesNotifications) {
            this.setNotificationCount(remoteCount);
            return;
        }

        const {notificationsMonitor} = Docking.DockManager.getDefault();
        const notificationsCount = notificationsMonitor.getAppNotificationsCount(
            this._source.app.id);

        this.setNotificationCount(remoteCount + notificationsCount);
    }

    _updateNotificationsBadge(text) {
        if (this._notificationBadgeBin) {
            this._notificationBadgeBin.child.text = text;
            return;
        }

        this._notificationBadgeBin = new St.Bin({
            child: new St.Label({
                styleClass: 'notification-badge',
                text,
            }),
            xAlign: Clutter.ActorAlign.END,
            yAlign: Clutter.ActorAlign.START,
            xExpand: true,
            yExpand: true,
        });
        this._notificationBadgeBin.child.clutterText.ellipsize =
            Pango.EllipsizeMode.MIDDLE;

        this._source._iconContainer.add_child(this._notificationBadgeBin);
        this._updateNotificationBadgeStyle();

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._signalsHandler.addWithLabel(UnityIndicator.notificationBadgeSignals, [
            themeContext,
            'changed',
            () => this._updateNotificationBadgeStyle(),
        ], [
            themeContext,
            'notify::scale-factor',
            () => this._updateNotificationBadgeStyle(),
        ], [
            this._source._iconContainer,
            'notify::size',
            () => this._updateNotificationBadgeStyle(),
        ]);
    }

    setNotificationCount(count) {
        if (count > 0) {
            const text = this._notificationBadgeCountToText(count);
            this._updateNotificationsBadge(text);
        } else if (this._notificationBadgeBin) {
            this._signalsHandler.removeWithLabel(UnityIndicator.notificationBadgeSignals);
            this._notificationBadgeBin.destroy();
            this._notificationBadgeBin = null;
        }
    }

    _showProgressOverlay() {
        if (this._progressOverlayArea) {
            this._updateProgressOverlay();
            return;
        }

        this._progressOverlayArea = new St.DrawingArea({x_expand: true, y_expand: true});
        this._progressOverlayArea.add_style_class_name('progress-bar');
        this._progressOverlayArea.connect('repaint', () => {
            this._drawProgressOverlay(this._progressOverlayArea);
        });

        this._source._iconContainer.add_child(this._progressOverlayArea);
        this._updateProgressOverlay();
    }

    _hideProgressOverlay() {
        this._progressOverlayArea?.destroy();
        this._progressOverlayArea = null;
    }

    _updateProgressOverlay() {
        this._progressOverlayArea?.queue_repaint();
    }

    _readGradientData(node, elementName, defaultValues) {
        const output = {
            colorStart: defaultValues.colorStart,
            colorEnd: defaultValues.colorEnd,
            offsetStart: defaultValues.offsetStart ?? 0.0,
            offsetEnd: defaultValues.offsetEnd ?? 1.0,
        };

        const [hasElementName, elementNameValue] = node.lookup_color(elementName, false);
        if (hasElementName) {
            output.colorStart = elementNameValue;
            output.colorEnd = null;
        } else {
            const [hasColorStart, colorStartValue] = node.lookup_color(`${elementName}-color-start`, false);
            const [hasColorEnd, colorEndValue] = node.lookup_color(`${elementName}-color-end`, false);
            if (hasColorStart && hasColorEnd) {
                output.colorStart = colorStartValue;
                output.colorEnd = colorEndValue;
            }
        }

        const [hasOffsetStart, offsetStartValue] = node.lookup_color(`${elementName}-offset-start`, false);
        if (hasOffsetStart)
            output.offsetStart = offsetStartValue;

        const [hasOffsetEnd, offsetEndValue] = node.lookup_color(`${elementName}-offset-end`, false);
        if (hasOffsetEnd)
            output.offsetEnd = offsetEndValue;

        return output;
    }

    _readThemeDoubleValue(node, elementName, defaultValue) {
        const [hasValue, value] = node.lookup_double(elementName, false);
        return hasValue ? value : defaultValue;
    }

    _readElementData(node, elementName, defaultValues) {
        return {
            background: this._readGradientData(node, `${elementName}-background`, defaultValues.background),
            border: this._readGradientData(node, `${elementName}-border`, defaultValues.border),
            lineWidth: this._readThemeDoubleValue(node, `${elementName}-line-width`,
                defaultValues.lineWidth ?? 1.0),
        };
    }

    _createGradient(values, x0, y0, x1, y1) {
        if (values.colorEnd) {
            const gradient = new Cairo.LinearGradient(x0, y0, x1, y1);
            gradient.addColorStopRGBA(values.offsetStart,
                values.colorStart.red / 255,
                values.colorStart.green / 255,
                values.colorStart.blue / 255,
                values.colorStart.alpha / 255);
            gradient.addColorStopRGBA(values.offsetEnd,
                values.colorEnd.red / 255,
                values.colorEnd.green / 255,
                values.colorEnd.blue / 255,
                values.colorEnd.alpha / 255);
            return gradient;
        } else {
            const gradient = Cairo.SolidPattern.createRGBA(values.colorStart.red / 255,
                values.colorStart.green / 255,
                values.colorStart.blue / 255,
                values.colorStart.alpha / 255);
            return gradient;
        }
    }

    _drawProgressOverlay(area) {
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        const cr = area.get_context();
        const node = this._progressOverlayArea.get_theme_node();
        const iconSize = this._source.icon.iconSize * scaleFactor;

        let x = Math.floor((surfaceWidth - iconSize) / 2);
        let y = Math.floor((surfaceHeight - iconSize) / 2);

        const readThemeValue = element =>
            this._readThemeDoubleValue(node, `-progress-bar-${element}`);

        y = readThemeValue('top-offset') ?? y;

        const baseLineWidth = Math.floor(Number(scaleFactor));
        const horizontalPadding = iconSize *
            Utils.clampDouble(readThemeValue('horizontal-padding') ?? 0.05);
        const verticalPadding = iconSize *
            Utils.clampDouble(readThemeValue('vertical-padding') ?? 0.05);
        const heightFactor =
            Utils.clampDouble(readThemeValue('height-factor') ?? 0.20);

        let width = iconSize - 2.0 * horizontalPadding;
        let height = Math.floor(Math.min(18.0 * scaleFactor, heightFactor * iconSize));
        x += horizontalPadding;

        const valign = Utils.clampDouble(readThemeValue('valign') ?? 1);
        y += (iconSize - height - verticalPadding) * valign;

        const progressBarTrack = this._readElementData(node,
            '-progress-bar-track',
            UnityIndicator.defaultProgressBarTrack);

        const progressBar = this._readElementData(node,
            '-progress-bar',
            UnityIndicator.defaultProgressBar);

        // Draw the track
        let lineWidth = baseLineWidth * progressBarTrack.lineWidth;
        cr.setLineWidth(lineWidth);

        x += lineWidth;
        y += lineWidth;
        width -= 2.0 * lineWidth;
        height -= 2.0 * lineWidth;

        let fill = this._createGradient(progressBarTrack.background, 0, y, 0, y + height);
        let stroke = this._createGradient(progressBarTrack.border, 0, y, 0, y + height);
        Utils.drawRoundedLine(cr, x + lineWidth / 2.0,
            y + lineWidth / 2.0, width, height, true, true, stroke, fill);

        // Draw the finished bar
        lineWidth = baseLineWidth * progressBar.lineWidth;
        cr.setLineWidth(lineWidth);

        x += lineWidth;
        y += lineWidth;
        width -= 2.0 * lineWidth;
        height -= 2.0 * lineWidth;

        const finishedWidth = Math.ceil(this._progress * width);
        fill = this._createGradient(progressBar.background, 0, y, 0, y + height);
        stroke = this._createGradient(progressBar.border, 0, y, 0, y + height);

        if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL) {
            Utils.drawRoundedLine(cr,
                x + lineWidth / 2.0 + width - finishedWidth, y + lineWidth / 2.0,
                finishedWidth, height, true, true, stroke, fill);
        } else {
            Utils.drawRoundedLine(cr, x + lineWidth / 2.0, y + lineWidth / 2.0,
                finishedWidth, height, true, true, stroke, fill);
        }

        cr.$dispose();
    }

    setProgress(progress) {
        if (progress < 0) {
            this._hideProgressOverlay();
        } else {
            this._progress = Math.min(progress, 1.0);
            this._showProgressOverlay();
        }
    }

    setUrgent(urgent) {
        if (urgent || this._isUrgent !== undefined)
            this._source.urgent = urgent;

        if (urgent)
            this._isUrgent = urgent;
        else
            delete this._isUrgent;
    }

    setUpdating(updating) {
        this._source.updating = updating;
    }

    _updateIconStyle() {
        const opacity = this._readThemeDoubleValue(this._source.get_theme_node(),
            'opacity') ?? (this._source.updating ? 0.5 : 1);
        this._source.icon.set_opacity(255 * opacity);
    }
}


// Global icon cache. Used for Unity7 styling.
const iconCacheMap = new Map();
// Max number of items to store
// We don't expect to ever reach this number, but let's put an hard limit to avoid
// even the remote possibility of the cached items to grow indefinitely.
const MAX_CACHED_ITEMS = 1000;
// When the size exceed it, the oldest 'n' ones are deleted
const  BATCH_SIZE_TO_DELETE = 50;
// The icon size used to extract the dominant color
const DOMINANT_COLOR_ICON_SIZE = 64;

// Compute dominant color from the app icon.
// The color is cached for efficiency.
class DominantColorExtractor {
    constructor(app) {
        this._app = app;
    }

    /**
     * Try to get the pixel buffer for the current icon, if not fail gracefully
     */
    _getIconPixBuf() {
        let iconTexture = this._app.create_icon_texture(16);
        const themeLoader = Docking.DockManager.iconTheme;

        // Unable to load the icon texture, use fallback
        if (iconTexture instanceof St.Icon === false)
            return null;


        iconTexture = iconTexture.get_gicon();

        // Unable to load the icon texture, use fallback
        if (!iconTexture)
            return null;

        if (iconTexture instanceof Gio.FileIcon) {
            // Use GdkPixBuf to load the pixel buffer from the provided file path
            return GdkPixbuf.Pixbuf.new_from_file(iconTexture.get_file().get_path());
        } else if (iconTexture instanceof Gio.ThemedIcon) {
            // Get the first pixel buffer available in the icon theme
            const iconNames = iconTexture.get_names();
            const iconInfo = themeLoader.choose_icon(iconNames, DOMINANT_COLOR_ICON_SIZE, 0);

            if (iconInfo)
                return iconInfo.load_icon();
            else
                return null;
        }

        // Use GdkPixBuf to load the pixel buffer from memory
        // iconTexture.load is available unless iconTexture is not an instance of Gio.LoadableIcon
        // this means that iconTexture is an instance of Gio.EmblemedIcon,
        // which may be converted to a normal icon via iconTexture.get_icon?
        const [iconBuffer] = iconTexture.load(DOMINANT_COLOR_ICON_SIZE, null);
        return GdkPixbuf.Pixbuf.new_from_stream(iconBuffer, null);
    }

    /**
     * The backlight color choosing algorithm was mostly ported to javascript from the
     * Unity7 C++ source of Canonicals:
     * https://bazaar.launchpad.net/~unity-team/unity/trunk/view/head:/launcher/LauncherIcon.cpp
     * so it more or less works the same way.
     */
    _getColorPalette() {
        if (iconCacheMap.get(this._app.get_id())) {
            // We already know the answer
            return iconCacheMap.get(this._app.get_id());
        }

        const pixBuf = this._getIconPixBuf();
        if (!pixBuf)
            return null;

        let pixels = pixBuf.get_pixels();

        let total  = 0,
            rTotal = 0,
            gTotal = 0,
            bTotal = 0;

        let resampleX = 1;
        let resampleY = 1;

        // Resampling of large icons
        // We resample icons larger than twice the desired size, as the resampling
        // to a size s
        // DOMINANT_COLOR_ICON_SIZE < s < 2*DOMINANT_COLOR_ICON_SIZE,
        // most of the case exactly DOMINANT_COLOR_ICON_SIZE as the icon size is
        // typically a multiple of it.
        const width = pixBuf.get_width();
        const height = pixBuf.get_height();

        // Resample
        if (height >= 2 * DOMINANT_COLOR_ICON_SIZE)
            resampleY = Math.floor(height / DOMINANT_COLOR_ICON_SIZE);

        if (width >= 2 * DOMINANT_COLOR_ICON_SIZE)
            resampleX = Math.floor(width / DOMINANT_COLOR_ICON_SIZE);

        if (resampleX !== 1 || resampleY !== 1)
            pixels = this._resamplePixels(pixels, resampleX, resampleY);

        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        const limit = pixels.length;
        for (let offset = 0; offset < limit; offset += 4) {
            const r = pixels[offset],
                g = pixels[offset + 1],
                b = pixels[offset + 2],
                a = pixels[offset + 3];

            const saturation = Math.max(r, g, b) - Math.min(r, g, b);
            const relevance  = 0.1 * 255 * 255 + 0.9 * a * saturation;

            rTotal += r * relevance;
            gTotal += g * relevance;
            bTotal += b * relevance;

            total += relevance;
        }

        total *= 255;

        const r = rTotal / total,
            g = gTotal / total,
            b = bTotal / total;

        const hsv = Utils.ColorUtils.RGBtoHSV(r * 255, g * 255, b * 255);

        if (hsv.s > 0.15)
            hsv.s = 0.65;
        hsv.v = 0.90;

        const rgb = Utils.ColorUtils.HSVtoRGB(hsv.h, hsv.s, hsv.v);

        // Cache the result.
        const backgroundColor = {
            lighter:  Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0.2),
            original: Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0),
            darker:   Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, -0.5),
        };

        if (iconCacheMap.size >= MAX_CACHED_ITEMS) {
            // delete oldest cached values (which are in order of insertions)
            let ctr = 0;
            for (const key of iconCacheMap.keys()) {
                if (++ctr > BATCH_SIZE_TO_DELETE)
                    break;
                iconCacheMap.delete(key);
            }
        }

        iconCacheMap.set(this._app.get_id(), backgroundColor);

        return backgroundColor;
    }

    /**
     * Downscale large icons before scanning for the backlight color to
     * improve performance.
     *
     * @param pixBuf
     * @param pixels
     * @param resampleX
     * @param resampleY
     *
     * @returns [];
     */
    _resamplePixels(pixels, resampleX, resampleY) {
        const resampledPixels = [];
        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        const limit = pixels.length / (resampleX * resampleY) / 4;
        for (let i = 0; i < limit; i++) {
            const pixel = i * resampleX * resampleY;

            resampledPixels.push(pixels[pixel * 4]);
            resampledPixels.push(pixels[pixel * 4 + 1]);
            resampledPixels.push(pixels[pixel * 4 + 2]);
            resampledPixels.push(pixels[pixel * 4 + 3]);
        }

        return resampledPixels;
    }
}
