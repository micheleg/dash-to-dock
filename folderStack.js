// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/*
 * A macOS-like "stack": a popup anchored to a folder icon in the dock that
 * shows the folder's contents.
 *
 * The popup is a PopupMenu so that grabbing, click-outside dismissal, Escape
 * and keyboard navigation all come from the shell rather than being
 * reimplemented here. Only the content layout and the reveal animation are
 * ours.
 */

import {
    Clutter,
    Gio,
    GObject,
    Pango,
    St,
} from './dependencies/gi.js';

import {
    BoxPointer,
    Main,
    PopupMenu,
} from './dependencies/shell/ui.js';

import {
    Docking,
    Theming,
    Utils,
} from './imports.js';

import {Extension} from './dependencies/shell/extensions/extension.js';

const {gettext: __} = Extension;

const ITEM_ICON_SIZE = 64;
const ITEM_WIDTH = 116;
// Roughly icon + label + padding; only used to cap how much of a large folder
// is on screen at once, the grid itself is laid out by Clutter.
const ITEM_HEIGHT = 104;
const ROW_ICON_SIZE = 24;
const ROW_HEIGHT = 40;
const LIST_MAX_VISIBLE_ROWS = 12;
const GRID_MAX_COLUMNS = 6;
const GRID_MAX_VISIBLE_ROWS = 5;
const MENU_MARGINS = 10;

/** Mirrors the downloads-stack-view enum in the gschema. */
export const ViewMode = Object.freeze({
    AUTOMATIC: 0,
    FAN: 1,
    GRID: 2,
    LIST: 3,
});

/** Mirrors the downloads-icon-display enum in the gschema. */
export const IconDisplay = Object.freeze({
    STACK: 0,
    FOLDER: 1,
});

// The reveal. Items scale up from the dock-facing edge with a slight
// overshoot, one shortly after the next, which is what reads as the macOS
// "pop" without needing per-item paths.
const POP_DURATION = 260;
const POP_STAGGER = 26;
// A hundred files staggered one by one would take over two seconds to finish.
// Stagger by row instead, and compress the step so the whole cascade stays
// inside this budget however many rows there are.
const POP_MAX_TOTAL_STAGGER = 320;
const POP_START_SCALE = 0.4;
const POP_TRAVEL = 24;

/** Above this many entries a fan stops being readable, and too tall to fit. */
const FAN_MAX_ITEMS = 8;
/** Tile pitch as a fraction of tile height; below 1 the tiles overlap. */
const FAN_SPACING_RATIO = 0.82;
/** Total sideways drift over the whole fan. */
const FAN_DRIFT = 110;
/** Degrees the last tile is tilted by. */
const FAN_MAX_TILT = 9;

/** Decode images up to this size inline when GIO has no cached thumbnail. */
const PREVIEW_MAX_BYTES = 16 * 1024 * 1024;

/** How many entries the dock icon previews when displaying as a stack. */
const STACK_ICON_LAYERS = 3;
/** Degrees each layer below the top is rotated by. */
const STACK_ICON_TILT = 6;

/**
 * How many tiles a fan can show before it runs off the screen.
 *
 * FAN_MAX_ITEMS is a readability limit, but it is not a fit limit: the tiles
 * grow with the display scale while the screen does not, so a fan that is
 * comfortable at 100% runs past the top of the monitor at 200%.
 *
 * @param {St.Side} position the dock side
 * @param {number} monitorIndex the monitor the dock is on
 * @returns {number} the most tiles that fit, including the open-folder one
 */
function fanCapacity(position, monitorIndex) {
    const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
    const horizontal = position === St.Side.BOTTOM || position === St.Side.TOP;

    const available = horizontal ? workArea.height : workArea.width;
    const itemHeight = ITEM_HEIGHT * scaleFactor;
    const spacing = itemHeight * FAN_SPACING_RATIO;
    const fits = Math.floor((available - itemHeight) / spacing) + 1;

    return Utils.clamp(fits, 2, FAN_MAX_ITEMS + 1);
}

/**
 * Resolve the configured view mode, turning AUTOMATIC into a concrete layout.
 *
 * Automatic follows macOS: a fan for a handful of files, a grid once there are
 * too many for an arc to stay legible. A fan also only makes sense along the
 * dock's free axis, so a vertical dock falls back to the grid.
 *
 * @param {number} configured the ViewMode the setting holds
 * @param {number} itemCount how many entries the folder has
 * @param {St.Side} position the dock side
 * @param {number} capacity how many tiles the fan can fit on screen
 * @returns {number} one of ViewMode.FAN, GRID or LIST
 */
function viewModeFor(configured, itemCount, position, capacity) {
    if (configured !== ViewMode.AUTOMATIC)
        return configured;

    const horizontal = position === St.Side.BOTTOM || position === St.Side.TOP;
    // The +1 is the open-folder tile, which the fan always adds.
    return itemCount + 1 <= capacity && horizontal
        ? ViewMode.FAN
        : ViewMode.GRID;
}

/**
 * Build the dock icon for "Display as: Stack": the most recent entries piled
 * up, newest on top, the way macOS previews a stack's contents.
 *
 * @param {object[]} items folder contents, newest first, never empty
 * @param {number} iconSize the dock's current icon size
 * @returns {Clutter.Actor} the icon to display
 */
export function makeStackIcon(items, iconSize) {
    const layers = items.slice(0, STACK_ICON_LAYERS);

    const widget = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        style_class: 'dashtodock-stack-icon',
        width: iconSize,
        height: iconSize,
    });

    const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
    // Leave room for the offsets so the pile still fits the icon slot.
    const layerSize = Math.round(iconSize * 0.78);
    const step = Math.round((iconSize - layerSize) / Math.max(1, layers.length - 1));

    // Oldest first so the newest ends up drawn on top.
    layers.slice().reverse().forEach((item, i) => {
        const depth = layers.length - 1 - i;
        let actor = null;

        if (item.thumbnailPath) {
            actor = St.TextureCache.get_default().load_file_async(
                Gio.File.new_for_path(item.thumbnailPath),
                -1, layerSize, scaleFactor, 1);
        }

        if (!actor) {
            actor = new St.Icon({
                gicon: item.icon,
                icon_size: layerSize,
            });
        }

        actor.set_pivot_point(0.5, 0.5);
        actor.rotation_angle_z = depth * STACK_ICON_TILT;
        actor.translation_x = -depth * step / 2;
        actor.translation_y = -depth * step / 2;
        actor.x_align = Clutter.ActorAlign.CENTER;
        actor.y_align = Clutter.ActorAlign.CENTER;
        widget.add_child(actor);
    });

    return widget;
}

/**
 * Animate one entry from its pre-reveal state to its resting state.
 *
 * Geometry and opacity are eased separately on purpose. The overshoot is what
 * makes an entry pop, but EASE_OUT_BACK carries the interpolation past its
 * target (it peaks around 1.10), and opacity is a guint8: 255 * 1.10 is 280,
 * which wraps to 24 rather than clamping. Easing both channels together left
 * every entry nearly invisible for about 150ms of its 260ms reveal and then
 * snapping to full, which is what read as the reveal flickering. So geometry
 * overshoots and opacity does not.
 *
 * @param {Clutter.Actor} actor the entry
 * @param {number} delay when this entry joins the cascade, in milliseconds
 */
function easeIn(actor, delay) {
    actor.ease({
        scale_x: 1,
        scale_y: 1,
        translation_x: 0,
        translation_y: 0,
        delay,
        duration: POP_DURATION,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
    });
    actor.ease({
        opacity: 255,
        delay,
        duration: POP_DURATION,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
}

/**
 * The point an item grows out of, expressed as a pivot plus a starting offset,
 * so the whole grid appears to come from the dock edge.
 *
 * @param {St.Side} position the dock side
 * @returns {{pivot: number[], travel: number[]}} pivot and initial translation
 */
function revealGeometryFor(position) {
    switch (position) {
    case St.Side.TOP:
        return {pivot: [0.5, 0], travel: [0, -POP_TRAVEL]};
    case St.Side.LEFT:
        return {pivot: [0, 0.5], travel: [-POP_TRAVEL, 0]};
    case St.Side.RIGHT:
        return {pivot: [1, 0.5], travel: [POP_TRAVEL, 0]};
    case St.Side.BOTTOM:
    default:
        return {pivot: [0.5, 1], travel: [0, POP_TRAVEL]};
    }
}

/**
 * One entry in the stack. Tiles (icon above an elided name) are used by the
 * grid and the fan; rows (small icon beside the name) by the list.
 */
const FolderStackItem = GObject.registerClass(
class FolderStackItem extends St.Button {
    _init(item, position, tiled = true) {
        super._init({
            style_class: 'dashtodock-stack-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: !tiled,
            y_expand: false,
            // Rows span the popup so the whole strip is clickable and the
            // names line up; tiles stay their natural size.
            x_align: tiled ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL,
        });

        this.item = item;
        this.add_style_class_name(Theming.PositionStyleClass[position]);
        this.add_style_class_name(tiled
            ? 'dashtodock-stack-item-tile'
            : 'dashtodock-stack-item-row');

        const box = new St.BoxLayout({
            vertical: tiled,
            x_expand: !tiled,
            x_align: tiled ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'dashtodock-stack-item-box',
        });

        // The icon lives in a slot of fixed size rather than directly in the
        // box. St.TextureCache.load_file_async hands back a zero-sized actor
        // that only grows once the file has been decoded, so swapping the
        // generic icon for a preview would otherwise collapse the tile and
        // then snap it back, which is what the reveal looked like it was
        // flickering.
        // icon-size is logical and St scales it, but the slot's width and
        // height are actor coordinates, so they have to be scaled by hand or
        // the two disagree on anything but a 100% display.
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
        this._iconSize = tiled ? ITEM_ICON_SIZE : ROW_ICON_SIZE;
        this._iconSlot = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: this._iconSize * scaleFactor,
            height: this._iconSize * scaleFactor,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._icon = new St.Icon({
            gicon: item.icon,
            icon_size: this._iconSize,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'dashtodock-stack-item-icon',
        });
        this._iconSlot.add_child(this._icon);
        box.add_child(this._iconSlot);

        this._label = new St.Label({
            text: item.displayName,
            x_align: tiled ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: !tiled,
            style_class: 'dashtodock-stack-item-label',
        });
        this._label.clutter_text.set_line_wrap(false);
        this._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        box.add_child(this._label);

        this.set_child(box);
        if (tiled)
            this.set_width(ITEM_WIDTH * scaleFactor);

        this.accessible_name = item.displayName;

        this._loadPreview(scaleFactor);
    }

    /**
     * Swap the generic MIME icon for a real preview where one is available.
     *
     * Three tiers, cheapest first: the thumbnail GIO already has cached, then
     * an on-the-fly decode for images small enough to be worth it, then
     * nothing (the MIME icon stays). St.TextureCache decodes off the main
     * thread, so neither path stalls the compositor.
     *
     * @param {number} scaleFactor the display scale
     */
    _loadPreview(scaleFactor) {
        const {item} = this;
        const decodable = !item.thumbnailFailed && !item.isDirectory &&
            item.contentType?.startsWith('image/') &&
            item.size > 0 && item.size <= PREVIEW_MAX_BYTES;

        let file = null;
        if (item.thumbnailPath)
            file = Gio.File.new_for_path(item.thumbnailPath);
        else if (decodable)
            ({file} = item);

        if (!file)
            return;

        const preview = St.TextureCache.get_default().load_file_async(
            file, -1, this._iconSize, scaleFactor, 1);

        if (preview)
            this.setPreview(preview);
    }

    /**
     * Replace the generic icon once a thumbnail has been produced.
     *
     * The preview goes into the same fixed-size slot and is constrained to it,
     * so the tile's geometry never changes no matter when the decode lands.
     *
     * @param {Clutter.Actor} actor the thumbnail actor
     */
    setPreview(actor) {
        if (!this._iconSlot)
            return;

        actor.x_align = Clutter.ActorAlign.CENTER;
        actor.y_align = Clutter.ActorAlign.CENTER;

        this._iconSlot.remove_all_children();
        this._iconSlot.add_child(actor);
        this._icon = actor;
    }
});

/**
 * Shared behaviour for every layout: a set of entries that pop in one band
 * after another. Subclasses own their own actor and their own idea of what a
 * band is; this holds only the reveal protocol FolderStackMenu drives.
 */
class FolderStackSection extends PopupMenu.PopupMenuSection {
    constructor() {
        super();

        this.items = [];
    }

    /**
     * Where an entry grows from. The default is the dock-facing edge, so the
     * contents look like they are coming out of the icon.
     *
     * @param {St.Side} position the dock side
     * @returns {number[]} the pivot point
     */
    _pivotFor(position) {
        return revealGeometryFor(position).pivot;
    }

    /**
     * Which band an entry belongs to. Entries sharing a band animate together.
     * Subclasses override; the default is one entry per band.
     *
     * @param {number} index entry index
     * @returns {number} band index, counting away from the dock
     */
    _bandOf(index) {
        return index;
    }

    /** How many bands there are. */
    get _bandCount() {
        return this.items.length;
    }

    /**
     * When an entry joins the cascade. The band nearest the dock leads, so the
     * contents read as rising out of the icon.
     *
     * @param {number} index entry index
     * @param {St.Side} position the dock side
     * @returns {number} delay in milliseconds
     */
    _revealDelay(index, position) {
        const last = Math.max(0, this._bandCount - 1);
        let band = this._bandOf(index);

        // The popup sits on the far side of the dock, so for a bottom or right
        // dock the visually-nearest band is the last one.
        if (position === St.Side.BOTTOM || position === St.Side.RIGHT)
            band = last - band;

        const step = last
            ? Math.min(POP_STAGGER, POP_MAX_TOTAL_STAGGER / last)
            : 0;
        return Math.round(band * step);
    }

    /**
     * Put every entry in its pre-reveal state. Called before the popup opens so
     * nothing is ever painted at full size first.
     *
     * @param {St.Side} position the dock side
     */
    prepareReveal(position) {
        const [pivotX, pivotY] = this._pivotFor(position);
        const [travelX, travelY] = revealGeometryFor(position).travel;

        this.items.forEach(actor => {
            actor.set_pivot_point(pivotX, pivotY);
            actor.set_scale(POP_START_SCALE, POP_START_SCALE);
            actor.translation_x = travelX;
            actor.translation_y = travelY;
            actor.opacity = 0;
        });
    }

    /**
     * Run the staggered reveal.
     *
     * @param {St.Side} position the dock side
     */
    reveal(position) {
        this.items.forEach((actor, i) => {
            actor.remove_all_transitions();
            easeIn(actor, this._revealDelay(i, position));
        });
    }
}

/**
 * The layouts that scroll: entries inside a height-capped scroll view.
 */
class FolderStackScrollSection extends FolderStackSection {
    constructor(maxHeight) {
        super();

        this.actor = new St.ScrollView({
            name: 'dashtodockStackScrollview',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            enable_mouse_scrolling: true,
        });
        this.actor._delegate = this;

        // A hundred files would otherwise fill the screen top to bottom, which
        // reads as a sheet rather than a stack. Cap it and let the rest scroll.
        this.actor.set_style(`max-height: ${maxHeight}px;`);
    }
}

/**
 * Entries as a roughly square grid of tiles.
 */
class FolderStackGrid extends FolderStackScrollSection {
    constructor(items, position) {
        super(GRID_MAX_VISIBLE_ROWS * ITEM_HEIGHT);

        // St.Viewport rather than St.Widget: St.ScrollView only allocates
        // children that implement StScrollable, and a plain widget silently
        // collapses to zero height inside one.
        this._grid = new St.Viewport({
            layout_manager: new Clutter.GridLayout(),
            style_class: 'dashtodock-stack-grid',
        });
        Utils.addActor(this.actor, this._grid);

        // Roughly square, like the macOS grid, but never wider than the cap.
        this._columns = Math.max(1,
            Math.min(GRID_MAX_COLUMNS, Math.ceil(Math.sqrt(items.length))));

        const layout = this._grid.layout_manager;
        items.forEach((item, i) => {
            const actor = new FolderStackItem(item, position);
            actor.connect('clicked', () => this.emit('item-activated', item));
            layout.attach(actor, i % this._columns,
                Math.floor(i / this._columns), 1, 1);
            this.items.push(actor);
        });
    }

    /** A band is a grid row. */
    _bandOf(index) {
        return Math.floor(index / this._columns);
    }

    get _bandCount() {
        return Math.ceil(this.items.length / this._columns);
    }
}

/**
 * The tile that caps the fan, opening the folder itself.
 *
 * It is a FolderStackItem so the arc geometry and the reveal treat it exactly
 * like any other tile; it just carries a synthetic entry that has no file
 * behind it, which also makes _loadPreview() a no-op.
 */
const FolderStackOpenTile = GObject.registerClass(
class FolderStackOpenTile extends FolderStackItem {
    _init(position) {
        super._init({
            // Short on purpose: the tile is ITEM_WIDTH wide like every other
            // one, and the menu's longer "Open in File Manager" either elides
            // to nonsense or wraps past the bottom of the arc.
            icon: Gio.ThemedIcon.new('folder-open'),
            displayName: __('Open Folder'),
        }, position);

        this.add_style_class_name('dashtodock-stack-open-tile');
    }
});

/**
 * Entries as an arc rising away from the dock, macOS "fan" style.
 *
 * Unlike the grid and the list this is not a scroll view: the arc is laid out
 * by hand at fixed positions, capped at FAN_MAX_ITEMS so it stays legible, and
 * sized to whatever the arc needs.
 */
class FolderStackFan extends FolderStackSection {
    constructor(items, position, capacity) {
        super();

        // Keep PopupMenuSection's own box as the section actor (replacing it
        // breaks the menu's scroll bookkeeping) and hang the arc inside it.
        this._arc = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'dashtodock-stack-fan',
        });
        this.box.add_child(this._arc);

        this._position = position;

        // Leave a slot for the open-folder tile. Anything that does not fit
        // stays reachable through it.
        const shown = items.slice(0, Math.max(1, capacity - 1));
        shown.forEach(item => {
            const actor = new FolderStackItem(item, position);
            actor.connect('clicked', () => this.emit('item-activated', item));
            this._arc.add_child(actor);
            this.items.push(actor);
        });

        // macOS caps its fan with a button that opens the folder proper. The
        // grid and the list get the same affordance as a footer row, but the
        // fan has no bubble to put a footer in, so it becomes the last tile on
        // the arc.
        const openTile = new FolderStackOpenTile(position);
        openTile.connect('clicked', () => this.emit('open-folder'));
        this._arc.add_child(openTile);
        this.items.push(openTile);

        // Paint order is deliberately left as insertion order: tiles overlap,
        // and each one's label sits along its dock-facing edge, so the tile
        // further from the dock has to be the one in front. Reversing this so
        // the nearest tile leads looks more like a pile of cards but buries
        // every label under the tile below it.
        this._layoutArc();
    }

    /**
     * Place the entries as a column rising away from the dock, drifting
     * sideways as it goes and tilting slightly with the curve.
     *
     * This is the macOS shape: not a wide rainbow (which puts the middle items
     * furthest from the icon and leaves the ends pointing back at the dock) but
     * a stack that leans. The drift is quadratic so the first few entries come
     * straight out of the icon before the fan starts to bend.
     *
     * Geometry is computed in "along" (parallel to the dock edge) and "away"
     * (perpendicular to it) coordinates, then mapped onto x/y per side, so one
     * piece of maths covers all four dock positions.
     */
    _layoutArc() {
        const n = this.items.length;
        const horizontal = this._position === St.Side.BOTTOM ||
            this._position === St.Side.TOP;
        const nearFarFlipped = this._position === St.Side.BOTTOM ||
            this._position === St.Side.RIGHT;

        // set_position and set_size take actor coordinates, but icon-size and
        // everything in the stylesheet are logical pixels that St scales. Mix
        // the two and the arc drifts away from the dock icon on any display
        // that is not at 100%.
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
        const itemWidth = ITEM_WIDTH * scaleFactor;

        // Ask a tile how tall it is rather than assuming: its height comes from
        // the label and the padding, which follow the theme and the text scale.
        const [, measured] = this.items[0].get_preferred_height(itemWidth);
        const itemHeight = measured || ITEM_HEIGHT * scaleFactor;
        const spacing = itemHeight * FAN_SPACING_RATIO;

        // Curve by how long the fan actually is. At full length it gets the
        // whole drift and tilt; with two entries it is nearly straight, since
        // applying the full curve across a single gap flings them apart.
        const span = (n - 1) / Math.max(1, FAN_MAX_ITEMS);
        const drift = FAN_DRIFT * scaleFactor * span;
        const tilt = FAN_MAX_TILT * span;

        const placed = this.items.map((actor, i) => {
            const t = n > 1 ? i / (n - 1) : 0;
            return {
                actor,
                along: drift * t * t,
                away: spacing * i,
                angle: tilt * t * t,
            };
        });

        // Keep the container symmetric about the first entry. The boxpointer
        // centres the popup on the dock icon, so the entry nearest the dock
        // only lands over the icon if it sits at the container's midpoint; the
        // drift then has room to run out to one side.
        const alongExtent = itemWidth + 2 * Math.abs(drift);
        const awayExtent = spacing * Math.max(0, n - 1) + itemHeight;
        const alongOrigin = (alongExtent - itemWidth) / 2;

        placed.forEach(({actor, along, away, angle}) => {
            const alongPos = alongOrigin + along;
            const awayPos = nearFarFlipped
                ? awayExtent - away - itemHeight
                : away;

            if (horizontal)
                actor.set_position(Math.round(alongPos), Math.round(awayPos));
            else
                actor.set_position(Math.round(awayPos), Math.round(alongPos));

            actor.set_pivot_point(0.5, 0.5);
            // Tilt follows the drift, and the drift direction flips with the
            // axis, so the tiles always lean into the curve.
            actor.rotation_angle_z = horizontal ? angle : -angle;
        });

        if (horizontal)
            this._arc.set_size(alongExtent, awayExtent);
        else
            this._arc.set_size(awayExtent, alongExtent);
    }

    /**
     * Keep the pivot centred: the arc rotation already uses it, and a corner
     * pivot would make the tiles swing rather than grow.
     *
     * @returns {number[]} the pivot point
     */
    _pivotFor() {
        return [0.5, 0.5];
    }

    /**
     * The fan unfurls from the dock outwards, so the first entry leads
     * regardless of dock side.
     *
     * @param {number} index entry index
     * @returns {number} delay in milliseconds
     */
    _revealDelay(index) {
        return index * POP_STAGGER;
    }
}

/**
 * Entries as a single column of icon-and-name rows.
 */
class FolderStackList extends FolderStackScrollSection {
    constructor(items, position) {
        super(LIST_MAX_VISIBLE_ROWS * ROW_HEIGHT);

        this._box = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'dashtodock-stack-list',
        });
        Utils.addActor(this.actor, this._box);

        items.forEach(item => {
            const actor = new FolderStackItem(item, position, false);
            actor.connect('clicked', () => this.emit('item-activated', item));
            this._box.add_child(actor);
            this.items.push(actor);
        });
    }
}

/**
 * The stack popup itself.
 */
export class FolderStackMenu extends PopupMenu.PopupMenu {
    constructor(source) {
        super(source, 0.5, Utils.getPosition());

        // Keep the dock icon looking hovered while the stack is up.
        this.blockSourceEvents = true;

        this._source = source;
        this._position = Utils.getPosition();

        this.actor.add_style_class_name('dashtodock-stack-menu');
        this.actor.add_style_class_name(Theming.PositionStyleClass[this._position]);

        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            this._source.monitorIndex);
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
        this.actor.set_style(
            `max-width: ${Math.round(workArea.width / scaleFactor) - MENU_MARGINS}px; ` +
            `max-height: ${Math.round(workArea.height / scaleFactor) - MENU_MARGINS}px;`);
        this.actor.hide();

        // Chain our visibility and lifecycle to that of the source.
        this._signalsHandler = new Utils.GlobalSignalsHandler(this);
        this._signalsHandler.add(this._source, 'notify::mapped', () => {
            if (!this._source.mapped)
                this.close();
        });
        this._signalsHandler.add(this._source, 'destroy', () => this.destroy());

        Utils.addActor(Main.uiGroup, this.actor);
    }

    get _appInfo() {
        return this._source.app?.appInfo ?? null;
    }

    /** Whether the current contents are laid out as a free-floating arc. */
    get _fanned() {
        return this._contents instanceof FolderStackFan;
    }

    _rebuild() {
        this.removeAll();
        this._contents = null;

        const appInfo = this._appInfo;
        const items = appInfo?.items ?? [];

        if (!items.length) {
            const empty = new PopupMenu.PopupMenuItem(__('Folder is empty'), {
                reactive: false,
                can_focus: false,
            });
            empty.add_style_class_name('dashtodock-stack-empty');
            this.addMenuItem(empty);
        } else {
            // fanCapacity() measures the screen, so only ask when a fan is
            // actually on the table.
            const configured = Docking.DockManager.settings.downloadsStackView;
            const capacity = configured === ViewMode.AUTOMATIC ||
                configured === ViewMode.FAN
                ? fanCapacity(this._position, this._source.monitorIndex)
                : 0;
            const mode = viewModeFor(configured, items.length, this._position,
                capacity);
            const Section = {
                [ViewMode.FAN]: FolderStackFan,
                [ViewMode.LIST]: FolderStackList,
            }[mode] ?? FolderStackGrid;

            this._contents = new Section(items, this._position, capacity);
            this._contents.connect('item-activated',
                (_s, item) => this._activate(item));
            this._contents.connect('open-folder', () => this._openFolder());
            this.addMenuItem(this._contents);
        }

        // The fan floats free the way it does on macOS, so it gets no bubble
        // and no footer row; everything else keeps both.
        if (this._fanned) {
            this.actor.add_style_class_name('dashtodock-stack-menu-bare');
            return;
        }

        this.actor.remove_style_class_name('dashtodock-stack-menu-bare');

        if (items.length || appInfo?.truncated)
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const open = new PopupMenu.PopupMenuItem(__('Open in File Manager'));
        open.connect('activate', () => this._openFolder());
        this.addMenuItem(open);
    }

    _openFolder() {
        this._appInfo?.launchAction('open-folder', global.get_current_time());
        this.close();
    }

    _activate(item) {
        Gio.AppInfo.launch_default_for_uri_async(item.uri,
            global.create_app_launch_context(global.get_current_time(), -1),
            null, (_o, res) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(res);
                } catch (e) {
                    logError(e, 'Impossible to open %s'.format(item.uri));
                }
            });
        this.close();
    }

    /**
     * The folder changed underneath us. Rebuild in place if the stack is open,
     * otherwise do nothing: popup() rebuilds from scratch anyway.
     */
    queueRedisplay() {
        if (!this.isOpen)
            return;

        this._rebuild();

        // _rebuild() throws the old entries away and constructs new ones, which
        // come up at Clutter's defaults: full size, full opacity, in one frame.
        // Fading them in keeps a download finishing while the stack is open
        // from making the whole popup blink and snap. The cascade is skipped
        // (every entry uses delay 0) because re-running it on each file change
        // would be noise.
        const contents = this._contents;
        if (contents) {
            contents.prepareReveal(this._position);
            contents.items.forEach(actor => easeIn(actor, 0));
        }
    }

    popup() {
        this._rebuild();
        this._contents?.prepareReveal(this._position);

        // The items do the actual "pop". For the grid and the list the bubble
        // fades in behind them; the fan has no bubble at all, and fading the
        // (invisible) boxpointer as well just gave every tile a second,
        // out-of-phase opacity ramp on top of its own.
        this.open(this._fanned
            ? BoxPointer.PopupAnimation.NONE
            : BoxPointer.PopupAnimation.FADE);
        this.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);

        // Straight after open(), not from a later: opacity, scale and
        // translation are not layout properties, so they do not need the
        // actors to be allocated first, and deferring it left the grid stuck
        // invisible whenever the menu actor already existed from a previous
        // open.
        this._contents?.reveal(this._position);

        this._source.emit('sync-tooltip');
    }
}
