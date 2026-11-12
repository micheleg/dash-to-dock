// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import {
    Clutter,
    St,
} from './dependencies/gi.js';

import {
    Dash,
    Main,
} from './dependencies/shell/ui.js';

import {
    AppIcons,
    Docking,
    Utils,
} from './imports.js';

// Time to fully grow the icons when the pointer enters the dock, and to
// shrink them back once it leaves, at the default speed.
const MAGNIFY_IN_TIME = 120;
const MAGNIFY_OUT_TIME = 200;

/**
 * Integral between 0 and u of the raised cosine bell (1 + cos(πu)) / 2,
 * which is constant outside of [-1, 1].
 *
 * @param {number} u
 * @returns {number}
 */
function bellIntegral(u) {
    const v = Math.min(Math.abs(u), 1);
    return Math.sign(u) * (v + Math.sin(Math.PI * v) / Math.PI) / 2;
}

/**
 * Creates an icon whose texture is loaded for the magnified size while it's
 * laid out at its normal size, so that it stays sharp when magnified.
 *
 * @param {Function} createIconFunc Creates an icon of the given size
 * @param {number} size The icon size
 * @returns {Clutter.Actor} The icon
 */
export function createIcon(createIconFunc, size) {
    const {settings} = Docking.DockManager;
    const factor = settings.iconMagnification
        ? Math.ceil(Math.max(settings.iconMagnificationScale, 1)) : 1;

    if (factor <= 1)
        return createIconFunc(size);

    const icon = createIconFunc(size * factor);
    icon.set_size(size, size);
    return icon;
}

/**
 * macOS-like magnification of the dock icons near the pointer.
 *
 * The dock axis is stretched by a smooth fisheye mapping centered on the
 * pointer: the closer to the pointer, the more each icon grows, and its
 * neighbours are pushed aside so that the icons never overlap. The point
 * under the pointer is a fixed point of the mapping, so the icon below the
 * pointer stays there while the dock expands on both sides.
 *
 * The effect only uses actor transformations (and the background
 * allocation), so no relayout of the icons happens and picking keeps
 * matching what is drawn.
 */
export class DockMagnifier {
    constructor(dash, hoverActor) {
        this._dash = dash;
        this._hoverActor = hoverActor;

        this._position = Utils.getPosition();
        this._isHorizontal = this._position === St.Side.TOP ||
            this._position === St.Side.BOTTOM;
        this._translationProperty = this._isHorizontal ? 'translation_x' : 'translation_y';

        this._intensity = 0;
        this._target = 0;
        this._pointer = null;
        this._menuOpened = false;
        this._holds = 0;
        this._dragging = false;
        this._backgroundBefore = 0;
        this._backgroundAfter = 0;
        this._backgroundBase = null;
        // Magnified items, mapped to their destroy handler id
        this._magnifiedItems = new Map();

        const setDragging = dragging => {
            this._dragging = dragging;
            this._sync();
        };

        this._signalsHandler = new Utils.GlobalSignalsHandler(this._dash);
        this._signalsHandler.add([
            hoverActor,
            'notify::hover',
            () => this._sync(),
        ], [
            hoverActor,
            'captured-event',
            (_actor, event) => this._onCapturedEvent(event),
        ], [
            // Keep the icons as they are while a menu is shown, the menu is
            // positioned relative to the magnified icon.
            this._dash,
            'menu-opened',
            () => (this._menuOpened = true),
        ], [
            this._dash,
            'menu-closed',
            () => {
                this._menuOpened = false;
                this._sync();
            },
        ], [
            Main.overview,
            'item-drag-begin',
            () => setDragging(true),
        ], [
            Main.overview,
            'item-drag-end',
            () => setDragging(false),
        ], [
            Main.overview,
            'item-drag-cancelled',
            () => setDragging(false),
        ], [
            Main.overview,
            'window-drag-begin',
            () => setDragging(true),
        ], [
            Main.overview,
            'window-drag-end',
            () => setDragging(false),
        ], [
            Main.overview,
            'window-drag-cancelled',
            () => setDragging(false),
        ], [
            Docking.DockManager.settings,
            'changed::icon-magnification',
            () => {
                this._reloadIcons();
                this._updateStyle();
                this._sync();
            },
        ], [
            Docking.DockManager.settings,
            'changed::icon-magnification-scale',
            () => this._reloadIcons(),
        ]);

        this._updateStyle();
    }

    _updateStyle() {
        if (Docking.DockManager.settings.iconMagnification)
            this._dash.add_style_class_name('magnification');
        else
            this._dash.remove_style_class_name('magnification');
    }

    destroy() {
        this._dash.remove_style_class_name('magnification');
        this._signalsHandler.destroy();
        this._timeline?.stop();
        delete this._timeline;

        for (const item of [...this._magnifiedItems.keys()])
            this._resetItem(item);
        this._setClipToView(true);
        this._setMagnifying(false);
    }

    _reloadIcons() {
        // The icon textures depend on the magnification scale
        for (const item of this._getItems())
            item.child.icon?.update?.();
    }

    get _frozen() {
        return this._menuOpened || this._holds > 0;
    }

    /**
     * Keep the icons as they are, whatever the pointer does, until release()
     * is called, e.g. while a popup that belongs to an icon is shown.
     */
    hold() {
        this._holds++;
    }

    release() {
        this._holds = Math.max(this._holds - 1, 0);
        if (this._frozen)
            return;

        // The popup may still cover the dock, so its hover state can't be
        // trusted: stay magnified only if the pointer is actually over it.
        const pointer = global.get_pointer();
        if (this._enabled && this._isPointerOnDock(pointer)) {
            this._updatePointer(pointer);
            this._setMagnifying(true);
            this._animateTo(1);
        } else {
            this._animateTo(0);
        }
    }

    _isPointerOnDock([x, y]) {
        const contains = actor => {
            const [ax, ay] = actor.get_transformed_position();
            const [width, height] = actor.get_transformed_size();
            return x >= ax && x < ax + width && y >= ay && y < ay + height;
        };

        // The magnified icons grow out of the dock
        return contains(this._hoverActor) ||
            [...this._magnifiedItems.keys()].some(item => contains(item.child));
    }

    get _enabled() {
        return Docking.DockManager.settings.iconMagnification &&
            !this._dragging && !this._isScrollable();
    }

    _isScrollable() {
        // When the icons don't fit the dock they're scrolled and clipped,
        // don't try to magnify them.
        const container = this._dash._boxContainer;
        const adjustment = this._isHorizontal
            ? container.hadjustment : container.vadjustment;
        if (!adjustment)
            return false;
        return adjustment.upper - adjustment.lower > adjustment.page_size + 1;
    }

    _onCapturedEvent(event) {
        const type = event.type();
        if (type === Clutter.EventType.MOTION || type === Clutter.EventType.ENTER) {
            this._updatePointer(event.get_coords());

            // The hovered icon gets its hover state before the dock does, so
            // start right away instead of waiting for the dock hover change,
            // or the icon gets painted once with its highlight.
            if (this._target !== 1 && !this._frozen && this._enabled) {
                this._setMagnifying(true);
                this._animateTo(1);
            } else if (this._intensity > 0) {
                this._update();
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _updatePointer([x, y]) {
        this._pointer = this._isHorizontal ? x : y;
    }

    _sync() {
        if (this._frozen)
            return;

        const active = this._enabled && this._hoverActor.hover;
        if (active) {
            this._updatePointer(global.get_pointer());
            // Hide the highlights right away, before the hovered icon gets
            // painted with them: the magnification only starts next frame.
            this._setMagnifying(true);
        }

        this._animateTo(active ? 1 : 0);
    }

    _animateTo(target) {
        if (target === this._target && (this._timeline || this._intensity === target))
            return;

        this._target = target;
        this._timeline?.stop();
        delete this._timeline;

        const from = this._intensity;
        if (from === target)
            return;

        const {settings} = Docking.DockManager;
        const speed = Math.max(target > from
            ? settings.iconMagnificationSpeed : settings.iconMagnificationOutSpeed, 0.1);
        const fullTime = (target > from ? MAGNIFY_IN_TIME : MAGNIFY_OUT_TIME) / speed;
        const duration = Math.round(fullTime * Math.abs(target - from));

        if (!duration || !this._dash.mapped || !St.Settings.get().enable_animations) {
            this._intensity = target;
            this._update();
            return;
        }

        const timeline = new Clutter.Timeline({
            actor: this._dash,
            duration,
            progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        timeline.connect('new-frame', () => {
            this._intensity = from + (target - from) * timeline.get_progress();
            this._update();
        });
        timeline.connect('completed', () => {
            if (this._timeline === timeline)
                delete this._timeline;
            this._intensity = target;
            this._update();
        });
        this._timeline = timeline;
        timeline.start();
    }

    _getItems() {
        const items = this._dash._box.get_children().filter(actor =>
            actor instanceof Dash.DashItemContainer && actor.child &&
            actor.visible && !actor.animatingOut);

        const showAppsIcon = this._dash._showAppsIcon;
        if (showAppsIcon?.child && showAppsIcon.visible && showAppsIcon.get_parent())
            items.push(showAppsIcon);

        return items;
    }

    _getExtent(actor) {
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        return this._isHorizontal ? [x, width] : [y, height];
    }

    _update() {
        const items = this._getItems();

        if (this._intensity <= 0 || this._pointer === null || !items.length) {
            this._reset();
            return;
        }

        const {settings} = Docking.DockManager;
        const [, slotSize] = this._getExtent(items[0]);
        const growth = (Math.max(settings.iconMagnificationScale, 1) - 1) * this._intensity;
        const range = Math.max(settings.iconMagnificationRange, 1) * slotSize;
        const spread = Math.max(settings.iconMagnificationSpread, 0);
        const pointer = this._pointer;
        // The icons size follows the magnification, while their positions
        // are pushed aside according to the spread: at 1 they make exactly
        // room for the grown icons, below they overlap, above gaps appear.
        const sizeMap = pos => pos + growth * range * bellIntegral((pos - pointer) / range);
        const map = pos => pos + spread * growth * range * bellIntegral((pos - pointer) / range);

        this._setClipToView(false);
        this._setMagnifying(true);

        const magnifiedItems = new Set(items);
        for (const item of this._magnifiedItems.keys()) {
            if (!magnifiedItems.has(item))
                this._resetItem(item);
        }

        for (const item of items) {
            const [start, size] = this._getExtent(item);
            if (!size)
                continue;

            const scale = (sizeMap(start + size) - sizeMap(start)) / size;
            const shift = (map(start) + map(start + size) - 2 * start - size) / 2;

            this._magnifyItem(item, scale, shift);

            if (!this._magnifiedItems.has(item)) {
                this._magnifiedItems.set(item, item.connect('destroy',
                    () => this._magnifiedItems.delete(item)));
            }

            this._followItem(item);
        }

        this._updateBackground(map);
    }

    _getIconBox(item) {
        // The box of the icon image inside the item child, ignoring the
        // magnification transformations.
        const {child} = item;
        const iconActor = (child.icon ?? item.icon)?.icon;
        const box = new Clutter.ActorBox({x2: child.width, y2: child.height});

        if (!iconActor?.get_stage())
            return box;

        let x = 0, y = 0;
        for (let actor = iconActor; actor && actor !== child; actor = actor.get_parent()) {
            const {x1, y1} = actor.get_allocation_box();
            x += x1;
            y += y1;
        }
        box.set_origin(x, y);
        box.set_size(iconActor.width, iconActor.height);
        return box;
    }

    _magnifyItem(item, scale, shift) {
        const {child} = item;
        const {width, height} = child;
        if (!width || !height)
            return;

        // Grow from the edge of the icon image next to the screen edge, so
        // that the icon stays on the dock while its padding grows around.
        const icon = this._getIconBox(item);
        const pivot = {
            [St.Side.TOP]: [width / 2, icon.y1],
            [St.Side.BOTTOM]: [width / 2, icon.y2],
            [St.Side.LEFT]: [icon.x1, height / 2],
            [St.Side.RIGHT]: [icon.x2, height / 2],
        }[this._position];

        child.set_pivot_point(pivot[0] / width, pivot[1] / height);
        child.set_scale(scale, scale);
        child[this._translationProperty] = shift;

        // How much the side of the item opposite to the screen edge moved out
        const growth = (scale - 1) * {
            [St.Side.TOP]: height - pivot[1],
            [St.Side.BOTTOM]: pivot[1],
            [St.Side.LEFT]: width - pivot[0],
            [St.Side.RIGHT]: pivot[0],
        }[this._position];
        item._magnification = {shift, growth};

        this._keepIndicatorsUnscaled(child, scale, pivot);
    }

    _keepIndicatorsUnscaled(child, scale, [pivotX, pivotY]) {
        // Running indicators keep their size and position under the icon,
        // undoing the item scaling around their own (centered) pivot point.
        for (const actor of child.child?.get_children() ?? []) {
            if (!actor.keepUnmagnified)
                continue;

            if (scale === 1) {
                actor.set_scale(1, 1);
                actor.set_translation(0, 0, 0);
                continue;
            }

            const {x1, y1, x2, y2} = actor.get_allocation_box();
            const [parentX, parentY] = child.child.get_allocation_box().get_origin();
            const [actorPivotX, actorPivotY] = actor.get_pivot_point();
            const centerX = parentX + x1 + (x2 - x1) * actorPivotX;
            const centerY = parentY + y1 + (y2 - y1) * actorPivotY;
            const correction = 1 - 1 / scale;

            actor.set_scale(1 / scale, 1 / scale);
            actor.set_translation((pivotX - centerX) * correction,
                (pivotY - centerY) * correction, 0);
        }
    }

    _followItem(item) {
        // Keep the label and the launch animation attached to the icon
        // while it moves around.
        if (item.label?.visible) {
            const [x, y] = AppIcons.itemLabelPosition.call(item);
            item.label.set_position(x, y);
        }

        const holder = item.child._launchBounceHolder;
        const {icon} = item.child;
        if (holder && icon?.width && icon.height) {
            const [width, height] = icon.get_transformed_size();
            holder.set_position(...icon.get_transformed_position());
            holder.set_scale(width / icon.width, height / icon.height);
        }
    }

    _updateBackground(map) {
        let before = 0;
        let after = 0;

        if (map && this._backgroundBase) {
            const [dashX, dashY] = this._dash.get_transformed_position();
            const base = this._backgroundBase;
            const start = this._isHorizontal ? dashX + base.x1 : dashY + base.y1;
            const end = this._isHorizontal ? dashX + base.x2 : dashY + base.y2;
            // Whole pixels only, so that the background borders and inset
            // shadows aren't blurred by sub-pixel positions.
            before = Math.max(Math.round(start - map(start)), 0);
            after = Math.max(Math.round(map(end) - end), 0);
        }

        if (before === this._backgroundBefore && after === this._backgroundAfter)
            return;

        this._backgroundBefore = before;
        this._backgroundAfter = after;
        this._dash.queue_relayout();
    }

    allocateBackground(background) {
        // Called right after the dash allocated its children, so this is
        // the background box without magnification.
        this._backgroundBase = background.get_allocation_box();

        if (!this._backgroundBefore && !this._backgroundAfter)
            return;

        // allocate() expects the box including the margins, that the
        // allocation box has already removed.
        const box = this._backgroundBase.copy();
        box.x1 -= background.margin_left;
        box.y1 -= background.margin_top;
        box.x2 += background.margin_right;
        box.y2 += background.margin_bottom;
        if (this._isHorizontal) {
            box.x1 -= this._backgroundBefore;
            box.x2 += this._backgroundAfter;
        } else {
            box.y1 -= this._backgroundBefore;
            box.y2 += this._backgroundAfter;
        }
        background.allocate(box);
    }

    _setClipToView(clip) {
        // The scrolled box clips its content, which would cut the icons
        // growing out of the dock.
        const container = this._dash._boxContainer;
        if (container && 'clip_to_view' in container && container.clip_to_view !== clip)
            container.clip_to_view = clip;
    }

    _resetItem(item) {
        item.disconnect(this._magnifiedItems.get(item));
        this._magnifiedItems.delete(item);

        delete item._magnification;

        const {child} = item;
        if (!child)
            return;

        child.set_scale(1, 1);
        child[this._translationProperty] = 0;
        this._keepIndicatorsUnscaled(child, 1, [0, 0]);
        this._followItem(item);
    }

    _reset() {
        for (const item of [...this._magnifiedItems.keys()])
            this._resetItem(item);

        this._updateBackground(null);
        this._setClipToView(true);
        // Still unmagnified at the very start of the growing animation
        this._setMagnifying(this._target === 1);
    }

    _setMagnifying(magnifying) {
        // The magnified icon already stands out, hide the hover and focus
        // highlights meanwhile.
        if (magnifying)
            this._dash.add_style_class_name('magnifying');
        else
            this._dash.remove_style_class_name('magnifying');
    }
}
