/*
 * Credits:
 * This file is based on code from the Dash to Panel extension by Jason DeRose
 * and code from the Taskbar extension by Zorin OS
 * Some code was also adapted from the upstream Gnome Shell source code.
 */

import {
    Clutter,
    Gio,
    GLib,
    GObject,
    Meta,
    St,
} from './dependencies/gi.js';

import {
    BoxPointer,
    Main,
    PopupMenu,
    Workspace,
} from './dependencies/shell/ui.js';

import {
    Docking,
    Theming,
    Utils,
} from './imports.js';

const PREVIEW_MAX_WIDTH = 250;
const PREVIEW_MAX_HEIGHT = 150;

const PREVIEW_ANIMATION_DURATION = 250;
const MAX_PREVIEW_GENERATION_ATTEMPTS = 15;

const MENU_MARGINS = 10;

/*
 * Debug logging to file
 * Using async file operations to avoid blocking
 */
const DEBUG_ENABLED = false;  // Set to true only for debugging
const LOG_FILE = `/tmp/dash-to-dock-${new Date().toISOString().split('T')[0]}.log`;

// Cache file handle for async writing
let logFileStream = null;

function debugLog(message) {
    if (!DEBUG_ENABLED)
        return;

    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} ${message}\n`;

    // Write to console
    console.log(message);

    // Write to file synchronously using GLib (blocking but reliable)
    try {
        const file = Gio.File.new_for_path(LOG_FILE);
        const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
        stream.write(logLine, null);
        stream.close(null);
    } catch (e) {
        // Silently fail file writes
    }
}

/*
 * Timeouts for the hovering events
 */
const HOVER_ENTER_TIMEOUT = 300;
const HOVER_LEAVE_TIMEOUT = 1000;  // Long delay to prevent accidental closes
const HOVER_MENU_LEAVE_TIMEOUT = 300;
const WINDOW_INIT_TIMEOUT = 200;  // Delay for window to initialize before showing preview

/*
 * Animation styles for preview appearance
 */
const PreviewAnimationStyle = Object.freeze({
    INSTANT: 0,      // No animation - instant display
    FADE: 1,         // Pure opacity fade
    SLIDE: 2,        // Slide from dock with fade
    SCALE: 3,        // Zoom in with scale
    EXPAND: 4,       // Width/height expand (current default)
    DISSOLVE: 5,     // Quick fade with subtle scale
    CASCADE: 6,      // Staggered item appearance
});

export class WindowPreviewMenu extends PopupMenu.PopupMenu {
    constructor(source) {
        super(source, 0.5, Utils.getPosition());

        // For click-opened menus, block source events
        // For hover-opened menus, keep source reactive so user can move between icons
        this.blockSourceEvents = false;

        this._source = source;
        this._app = this._source.app;
        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            this._source.monitorIndex);
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);

        this.actor.add_style_class_name('app-menu');

        // Store max dimensions for later use
        this._maxWidth = Math.round(workArea.width / scaleFactor) - MENU_MARGINS;
        this._maxHeight = Math.round(workArea.height / scaleFactor) - MENU_MARGINS;

        this.actor.hide();

        // Chain our visibility and lifecycle to that of the source
        this._mappedId = this._source.connect('notify::mapped', () => {
            if (!this._source.mapped)
                this.close();
        });
        this._destroyId = this._source.connect('destroy', this.destroy.bind(this));

        Utils.addActor(Main.uiGroup, this.actor);

        // Initialize hover state
        this._enterSourceId = 0;
        this._leaveSourceId = 0;
        this._enterMenuId = 0;
        this._leaveMenuId = 0;
        this._hoverOpenTimeoutId = null;
        this._hoverCloseTimeoutId = null;
        this.fromHover = false;
        this._windowsChangedId = 0;

        this.connect('destroy', this._onDestroy.bind(this));
    }


    open(animate) {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] open() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, animate: ${animate}, timestamp: ${timestamp}`);
        super.open(animate);
        debugLog(`[PREVIEW] open() EXIT - isOpen: ${this.isOpen}`);
    }

    close(animate) {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] close() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, animate: ${animate}, timestamp: ${timestamp}`);

        // Get stack trace to see what's calling close()
        try {
            throw new Error('Stack trace');
        } catch (e) {
            debugLog(`[PREVIEW] close() called from:\n${e.stack}`);
        }

        super.close(animate);
        debugLog(`[PREVIEW] close() EXIT - isOpen: ${this.isOpen}`);
    }

    _redisplay() {
        debugLog(`[PREVIEW] WindowPreviewMenu._redisplay() called for ${this._app.get_name()}`);
        if (this._previewBox)
            this._previewBox.destroy();
        const animConfig = this._getAnimationConfig();
        this._previewBox = new WindowPreviewList(this._source, animConfig, this.fromHover);
        this.addMenuItem(this._previewBox);
        this._previewBox._redisplay();
        debugLog(`[PREVIEW] _redisplay() completed for ${this._app.get_name()}`);
    }

    _getAnimationConfig() {
        const style = Docking.DockManager.settings.previewAnimationStyle;
        debugLog(`[PREVIEW] _getAnimationConfig() style=${style}`);

        switch (style) {
        case PreviewAnimationStyle.INSTANT:
            return {
                boxPointer: BoxPointer.PopupAnimation.NONE,
                itemDuration: 0,
                itemMode: null,
                itemEffect: 'instant',
            };

        case PreviewAnimationStyle.FADE:
            return {
                boxPointer: BoxPointer.PopupAnimation.NONE,
                itemDuration: 200,
                itemMode: Clutter.AnimationMode.EASE_OUT_QUAD,
                itemEffect: 'fade',
            };

        case PreviewAnimationStyle.SLIDE:
            return {
                boxPointer: BoxPointer.PopupAnimation.SLIDE,
                itemDuration: 250,
                itemMode: Clutter.AnimationMode.EASE_OUT_BACK,
                itemEffect: 'slide',
            };

        case PreviewAnimationStyle.SCALE:
            return {
                boxPointer: BoxPointer.PopupAnimation.FULL,
                itemDuration: 300,
                itemMode: Clutter.AnimationMode.EASE_OUT_EXPO,
                itemEffect: 'scale',
            };

        case PreviewAnimationStyle.EXPAND:  // Current default
            return {
                boxPointer: BoxPointer.PopupAnimation.FULL,
                itemDuration: 250,
                itemMode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                itemEffect: 'expand',
            };

        case PreviewAnimationStyle.DISSOLVE:
            return {
                boxPointer: BoxPointer.PopupAnimation.FADE,
                itemDuration: 150,
                itemMode: Clutter.AnimationMode.EASE_IN_SINE,
                itemEffect: 'dissolve',
            };

        case PreviewAnimationStyle.CASCADE:
            return {
                boxPointer: BoxPointer.PopupAnimation.FADE,
                itemDuration: 200,
                itemMode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                itemEffect: 'cascade',
                itemDelay: 50,  // Stagger delay per item
            };

        default:
            // Fallback to EXPAND if invalid value
            return {
                boxPointer: BoxPointer.PopupAnimation.FULL,
                itemDuration: 250,
                itemMode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                itemEffect: 'expand',
            };
        }
    }

    popup() {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] popup() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, fromHover: ${this.fromHover}, timestamp: ${timestamp}`);
        const windows = this._source.getInterestingWindows();
        if (windows.length > 0) {
            const config = this._getAnimationConfig();

            // Only redisplay if preview box doesn't exist, windows changed, or animation style changed
            // This is a CRITICAL performance optimization for hover mode
            const needsRedisplay = !this._previewBox ||
                                   this._needsRedisplay(windows) ||
                                   this._lastAnimationStyle !== config.itemEffect;

            debugLog(`[PREVIEW] popup() needsRedisplay=${needsRedisplay}, hasBox=${!!this._previewBox}, lastStyle=${this._lastAnimationStyle}, currentStyle=${config.itemEffect}`);

            if (needsRedisplay) {
                this._lastAnimationStyle = config.itemEffect;
                this._redisplay();
            }

            // Always use this.open() for proper layout and sizing
            // The difference is whether we block source events (click) or not (hover)
            this.blockSourceEvents = !this.fromHover;

            // Calculate max width as 90% of desktop width
            const workArea = Main.layoutManager.getWorkAreaForMonitor(this._source.monitorIndex);
            const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
            const maxPreviewWidth = Math.round((workArea.width * 0.9) / scaleFactor);

            if (this.fromHover) {
                debugLog(`[PREVIEW] popup() HOVER - app: ${this._app.get_name()}, isOpen: ${this.isOpen}`);
                // For hover menus, constrain to 90% desktop width but allow natural sizing
                // min-width: 0 prevents expanding to fill max-width unnecessarily
                this.actor.set_style(`max-width: ${maxPreviewWidth}px; min-width: 0;`);
            } else {
                debugLog(`[PREVIEW] popup() CLICK - app: ${this._app.get_name()}`);
                // For click menus, set full constraints to prevent oversized menus
                this.actor.set_style(
                    `max-width: ${this._maxWidth}px; ` +
                    `max-height: ${this._maxHeight}px;`);
            }

            if (!this.isOpen) {
                debugLog(`[PREVIEW] popup() calling this.open() with animation=${config.boxPointer}`);
                this.open(config.boxPointer);
                debugLog(`[PREVIEW] popup() this.open() completed, isOpen=${this.isOpen}`);
                if (!this.fromHover)
                    this.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
            } else {
                debugLog(`[PREVIEW] popup() skipping open because isOpen=${this.isOpen}`);
            }

            this._source.emit('sync-tooltip');
        }
        debugLog(`[PREVIEW] popup() EXIT`);
    }

    _needsRedisplay(currentWindows) {
        if (!this._previewBox)
            return true;

        // Get currently displayed windows
        const displayedItems = this._previewBox._getMenuItems().filter(item => item._window);
        const displayedWindows = displayedItems.map(item => item._window);

        // Check if window count changed
        if (currentWindows.length !== displayedWindows.length)
            return true;

        // Check if window list changed (order-sensitive)
        // Use get_stable_sequence() for consistent ordering
        const sortedCurrent = currentWindows.slice().sort((a, b) =>
            a.get_stable_sequence() - b.get_stable_sequence());
        const sortedDisplayed = displayedWindows.slice().sort((a, b) =>
            a.get_stable_sequence() - b.get_stable_sequence());

        return !sortedCurrent.every((win, i) => win === sortedDisplayed[i]);
    }

    enableHover(menuManager) {
        // Show window previews on mouse hover
        this.blockSourceEvents = false;
        debugLog(`[PREVIEW] enableHover() called for ${this._app.get_name()}`);

        // CRITICAL: Disable PopupMenuManager's global event capture
        // PopupMenuManager installs a capture-event handler that closes menus when clicking outside
        // For hover menus, we handle closing ourselves via hover events, so we need to
        // disable the manager's interference
        if (menuManager) {
            debugLog(`[PREVIEW] enableHover() disabling menu manager event capture`);
            // Remove this menu from the manager's tracking so it doesn't auto-close on outside clicks
            menuManager.removeMenu(this);
            // Store reference so we can re-add it later when disabling hover
            this._menuManager = menuManager;
        }

        // Make the BoxPointer NOT intercept pointer events - let them pass through to dock
        // The key insight: we need to make the entire BoxPointer (background + arrow)
        // transparent to pointer events, while keeping only the bin (content) reactive

        // Disable pointer event interception on the BoxPointer container
        this._boxPointer.set_reactive(false);
        this._boxPointer.set_track_hover(false);
        debugLog(`[PREVIEW] enableHover() set BoxPointer reactive=false, track_hover=false`);

        // Also disable on the actor wrapper if it exists
        if (this._boxPointer.actor) {
            this._boxPointer.actor.set_reactive(false);
            this._boxPointer.actor.set_track_hover(false);
            debugLog(`[PREVIEW] enableHover() set BoxPointer.actor reactive=false, track_hover=false`);
        }

        // The bin (menu content) should still be reactive for clicking windows
        this._boxPointer.bin.set_reactive(true);
        this._boxPointer.bin.set_track_hover(true);
        debugLog(`[PREVIEW] enableHover() set BoxPointer.bin reactive=true, track_hover=true`);

        this._enterSourceId = this._source.connect('enter-event', () => this._onEnter());
        this._leaveSourceId = this._source.connect('leave-event', () => this._onLeave());

        // Connect to the BoxPointer's bin which is the actual visible menu container
        // that receives pointer events, not just the actor
        this._enterMenuId = this._boxPointer.bin.connect('enter-event', () => this._onMenuEnter());
        this._leaveMenuId = this._boxPointer.bin.connect('leave-event', () => this._onMenuLeave());

        // Listen for windows appearing while hovering (e.g., after launching an app)
        this._windowsChangedId = this._app.connect('windows-changed', () => this._onWindowsChanged());

        debugLog(`[PREVIEW] enableHover() event handlers connected`);
    }

    disableHover() {
        this.blockSourceEvents = true;

        // Re-add menu to PopupMenuManager if we removed it
        if (this._menuManager) {
            debugLog(`[PREVIEW] disableHover() re-enabling menu manager`);
            this._menuManager.addMenu(this);
            this._menuManager = null;
        }

        // Cancel any pending timeouts FIRST to prevent leaks
        this.cancelOpen();
        this.cancelClose();

        if (this._enterSourceId) {
            this._source.disconnect(this._enterSourceId);
            this._enterSourceId = 0;
        }
        if (this._leaveSourceId) {
            this._source.disconnect(this._leaveSourceId);
            this._leaveSourceId = 0;
        }

        if (this._enterMenuId) {
            this._boxPointer.bin.disconnect(this._enterMenuId);
            this._enterMenuId = 0;
        }
        if (this._leaveMenuId) {
            this._boxPointer.bin.disconnect(this._leaveMenuId);
            this._leaveMenuId = 0;
        }

        if (this._windowsChangedId) {
            this._app.disconnect(this._windowsChangedId);
            this._windowsChangedId = 0;
        }
    }

    _onEnter() {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] _onEnter() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, timestamp: ${timestamp}`);

        // Close any other open hover preview immediately when entering a new icon
        // This ensures smooth transitions between icon hovers
        const hasAppIconsList = !!this._source._appIconsHoverList;
        const listLength = this._source._appIconsHoverList?.length || 0;
        debugLog(`[PREVIEW] _onEnter() appIconsHoverList exists: ${hasAppIconsList}, length: ${listLength}`);

        if (this._source._appIconsHoverList) {
            debugLog(`[PREVIEW] _onEnter() iterating through ${this._source._appIconsHoverList.length} icons`);
            this._source._appIconsHoverList.forEach(appIcon => {
                const isSelf = appIcon === this._source;
                const hasPreview = !!appIcon._previewMenu;
                const previewIsOpen = appIcon._previewMenu?.isOpen || false;
                const previewFromHover = appIcon._previewMenu?.fromHover || false;

                if (hasPreview && (previewIsOpen || previewFromHover)) {
                    debugLog(`[PREVIEW] _onEnter() checking ${appIcon.app.get_name()}: isSelf=${isSelf}, hasPreview=${hasPreview}, isOpen=${previewIsOpen}, fromHover=${previewFromHover}`);
                }

                // Close ANY hover preview on other icons, regardless of isOpen state
                // This handles cases where preview was created but didn't open due to no windows
                if (appIcon !== this._source && appIcon._previewMenu && appIcon._previewMenu.fromHover) {
                    debugLog(`[PREVIEW] _onEnter() CLOSING other hover menu: ${appIcon.app.get_name()} (isOpen=${appIcon._previewMenu.isOpen})`);
                    appIcon._previewMenu.hoverClose();
                    // Also hide the actor if it's visible but not marked as open
                    if (!appIcon._previewMenu.isOpen && appIcon._previewMenu.actor.visible) {
                        debugLog(`[PREVIEW] _onEnter() hiding orphaned preview actor for ${appIcon.app.get_name()}`);
                        appIcon._previewMenu.actor.hide();
                    }
                }
            });
            debugLog(`[PREVIEW] _onEnter() finished iterating`);
        } else {
            debugLog(`[PREVIEW] _onEnter() no appIconsHoverList!`);
        }

        this.cancelOpen();
        this.cancelClose();

        this._hoverOpenTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            HOVER_ENTER_TIMEOUT,
            () => {
                debugLog(`[PREVIEW] _onEnter() timeout fired, calling hoverOpen()`);
                this.hoverOpen();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _onLeave() {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] _onLeave() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, timestamp: ${timestamp}`);
        const binHasPointer = this._boxPointer?.bin?.has_pointer || false;
        debugLog(`[PREVIEW] _onLeave() bin.has_pointer: ${binHasPointer}, bin.visible: ${this._boxPointer?.bin?.visible}, bin.mapped: ${this._boxPointer?.bin?.mapped}`);
        debugLog(`[PREVIEW] _onLeave() source.has_pointer: ${this._source.has_pointer}`);

        this.cancelOpen();

        // Check if pointer is on the menu bin or still on the source icon - if so, this is a spurious leave event
        // caused by the menu appearing over the icon, not the user actually leaving
        // Since we made BoxPointer non-reactive, check the bin instead of actor
        if (binHasPointer) {
            debugLog(`[PREVIEW] _onLeave() EXIT - Ignoring spurious leave - pointer is on menu bin`);
            return;
        }
        if (this._source.has_pointer) {
            debugLog(`[PREVIEW] _onLeave() EXIT - Ignoring spurious leave - pointer still on source icon`);
            return;
        }

        // User has left the source icon and is not on the menu
        // Give time to move mouse from icon to preview menu
        debugLog(`[PREVIEW] _onLeave() setting ${HOVER_MENU_LEAVE_TIMEOUT}ms timeout to hoverClose()`);
        this._hoverCloseTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            HOVER_MENU_LEAVE_TIMEOUT,  // 300ms - enough time to move to menu
            () => {
                debugLog(`[PREVIEW] _onLeave() timeout fired, calling hoverClose()`);
                this.hoverClose();
                return GLib.SOURCE_REMOVE;
            }
        );
        debugLog(`[PREVIEW] _onLeave() EXIT - new hoverCloseTimeoutId: ${this._hoverCloseTimeoutId}`);
    }

    cancelOpen() {
        if (this._hoverOpenTimeoutId) {
            debugLog(`[PREVIEW] cancelOpen() removing timeout ${this._hoverOpenTimeoutId}`);
            GLib.source_remove(this._hoverOpenTimeoutId);
            this._hoverOpenTimeoutId = null;
        } else {
            debugLog(`[PREVIEW] cancelOpen() no timeout to cancel`);
        }
    }

    cancelClose() {
        if (this._hoverCloseTimeoutId) {
            debugLog(`[PREVIEW] cancelClose() removing timeout ${this._hoverCloseTimeoutId}`);
            GLib.source_remove(this._hoverCloseTimeoutId);
            this._hoverCloseTimeoutId = null;
        } else {
            debugLog(`[PREVIEW] cancelClose() no timeout to cancel`);
        }
    }

    hoverOpen() {
        this._hoverOpenTimeoutId = null;
        this.fromHover = true;
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] hoverOpen() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, fromHover: ${this.fromHover}, timestamp: ${timestamp}`);
        if (!this.isOpen) {
            debugLog(`[PREVIEW] hoverOpen() calling popup()`);
            this.popup();
            debugLog(`[PREVIEW] hoverOpen() popup() returned, isOpen now: ${this.isOpen}`);
        } else {
            debugLog(`[PREVIEW] hoverOpen() skipped popup because isOpen=${this.isOpen}`);
        }
        debugLog(`[PREVIEW] hoverOpen() EXIT`);
    }

    hoverClose() {
        this._hoverCloseTimeoutId = null;
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] hoverClose() ENTRY - app: ${this._app.get_name()}, isOpen: ${this.isOpen}, fromHover: ${this.fromHover}, timestamp: ${timestamp}`);
        const menuHasPointer = this._boxPointer?.bin?.has_pointer || false;
        debugLog(`[PREVIEW] hoverClose() pointer states - menu.has_pointer: ${menuHasPointer}, source.has_pointer: ${this._source.has_pointer}`);

        // Safety check: Don't close if mouse is still on the preview or source icon
        if (menuHasPointer || this._source.has_pointer) {
            debugLog(`[PREVIEW] hoverClose() ABORT - mouse still present on menu or source`);
            return;
        }

        if (this.isOpen) {
            // For hover menus, close WITHOUT going through PopupMenuManager
            if (this.fromHover) {
                debugLog(`[PREVIEW] hoverClose() closing hover menu for ${this._app.get_name()}`);
                this._boxPointer.close(BoxPointer.PopupAnimation.FADE, () => {
                    debugLog(`[PREVIEW] hoverClose() boxPointer.close callback - hiding actor`);
                    this.actor.hide();
                    this.isOpen = false;
                    // Destroy preview box so it's recreated fresh on next hover with current animation style
                    if (this._previewBox) {
                        debugLog(`[PREVIEW] hoverClose() destroying preview box`);
                        this._previewBox.destroy();
                        this._previewBox = null;
                    }

                    // Force dock autohide check when preview closes
                    // This ensures the dock hides when the mouse moves from preview to window area
                    Docking.DockManager.allDocks.forEach(dock => {
                        if (dock._intellihideIsEnabled && dock._intellihide) {
                            debugLog(`[PREVIEW] hoverClose() triggering intellihide update for dock on monitor ${dock.monitorIndex}`);
                            dock._intellihide.forceUpdate();
                        }
                    });

                    debugLog(`[PREVIEW] hoverClose() closed hover menu for ${this._app.get_name()}, emitting menu-closed`);
                    this.emit('menu-closed');
                });
            } else {
                debugLog(`[PREVIEW] hoverClose() closing click menu`);
                this.close(BoxPointer.PopupAnimation.FADE);
            }
        } else {
            debugLog(`[PREVIEW] hoverClose() skipped because isOpen=${this.isOpen}`);
        }
        debugLog(`[PREVIEW] hoverClose() EXIT`);
    }

    _onMenuEnter() {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] _onMenuEnter() - app: ${this._app.get_name()}, timestamp: ${timestamp}`);
        const binHasPointer = this._boxPointer?.bin?.has_pointer || false;
        debugLog(`[PREVIEW] _onMenuEnter() bin.has_pointer: ${binHasPointer}, source.has_pointer: ${this._source.has_pointer}`);

        // Cancel close timeout when mouse enters the preview menu
        // Since we made the BoxPointer non-reactive, we check the bin instead
        debugLog(`[PREVIEW] _onMenuEnter() canceling close timeout - mouse entered preview`);
        this.cancelClose();
    }

    _onMenuLeave() {
        const timestamp = new Date().toISOString();
        debugLog(`[PREVIEW] _onMenuLeave() ENTRY - app: ${this._app.get_name()}, timestamp: ${timestamp}`);
        debugLog(`[PREVIEW] _onMenuLeave() actor.has_pointer: ${this.actor.has_pointer}, source.has_pointer: ${this._source.has_pointer}`);

        this.cancelOpen();

        // Only set close timeout if one isn't already pending
        if (this._hoverCloseTimeoutId) {
            debugLog(`[PREVIEW] _onMenuLeave() EXIT - close timeout already pending (${this._hoverCloseTimeoutId})`);
            return;
        }

        debugLog(`[PREVIEW] _onMenuLeave() setting ${HOVER_MENU_LEAVE_TIMEOUT}ms timeout to hoverClose()`);
        this._hoverCloseTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            HOVER_MENU_LEAVE_TIMEOUT,
            () => {
                debugLog(`[PREVIEW] _onMenuLeave() timeout fired, calling hoverClose()`);
                this.hoverClose();
                return GLib.SOURCE_REMOVE;
            }
        );
        debugLog(`[PREVIEW] _onMenuLeave() EXIT - new hoverCloseTimeoutId: ${this._hoverCloseTimeoutId}`);
    }

    _onWindowsChanged() {
        // Handle windows appearing/disappearing while in hover mode
        // This gives instant feedback when launching an app from the dock
        const timestamp = new Date().toISOString();
        const windows = this._source.getInterestingWindows();
        debugLog(`[PREVIEW] _onWindowsChanged() - app: ${this._app.get_name()}, windows: ${windows.length}, isOpen: ${this.isOpen}, fromHover: ${this.fromHover}, timestamp: ${timestamp}`);

        // Only auto-open if:
        // 1. We're in hover mode (not click mode)
        // 2. The preview is not already open
        // 3. There are windows to show
        // 4. The user is still hovering over the source icon
        if (this.fromHover && !this.isOpen && windows.length > 0 && this._source.has_pointer) {
            debugLog(`[PREVIEW] _onWindowsChanged() windows appeared while hovering - scheduling preview`);
            // Cancel any pending timeouts
            this.cancelOpen();
            this.cancelClose();

            // Small delay to let the window finish initializing and get proper size
            // This prevents showing tiny/partial window thumbnails
            this._hoverOpenTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                WINDOW_INIT_TIMEOUT,
                () => {
                    // Verify user is still hovering before opening
                    if (this._source.has_pointer) {
                        debugLog(`[PREVIEW] _onWindowsChanged() timeout - opening preview`);
                        this.popup();
                    } else {
                        debugLog(`[PREVIEW] _onWindowsChanged() timeout - user left, not opening`);
                    }
                    this._hoverOpenTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
    }

    _onDestroy() {
        this.disableHover();

        if (this._mappedId)
            this._source.disconnect(this._mappedId);

        if (this._destroyId)
            this._source.disconnect(this._destroyId);
    }
}

class WindowPreviewList extends PopupMenu.PopupMenuSection {
    constructor(source, animConfig, isHoverMenu = false) {
        super();
        this.actor = new St.ScrollView({
            name: 'dashtodockWindowScrollview',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            overlay_scrollbars: true,
            enable_mouse_scrolling: true,
        });

        this.actor.connect('scroll-event', this._onScrollEvent.bind(this));

        const position = Utils.getPosition();
        this.isHorizontal = position === St.Side.BOTTOM || position === St.Side.TOP;
        this.box.set_vertical(!this.isHorizontal);
        this.box.set_name('dashtodockWindowList');

        // Don't expand horizontally - size to content
        this.box.x_expand = false;
        this.box.x_align = Clutter.ActorAlign.CENTER;

        Utils.addActor(this.actor, this.box);
        this.actor._delegate = this;

        // For hover menus, always animate (even on first display)
        // For click menus, skip animation on first display to avoid all items zooming in at once
        this._shownInitially = isHoverMenu;

        this._source = source;
        this.app = source.app;
        this._animConfig = animConfig;
        this._isHoverMenu = isHoverMenu;

        // For hover menus, don't use deferred work or listen to windows-changed
        // to avoid interrupting animations. The menu will be recreated on next hover anyway.
        if (!isHoverMenu) {
            this._redisplayId = Main.initializeDeferredWork(this.actor, this._redisplay.bind(this));
            this._stateChangedId = this.app.connect('windows-changed',
                this._queueRedisplay.bind(this));
        } else {
            this._redisplayId = null;
            this._stateChangedId = 0;
        }

        this.actor.connect('destroy', this._onDestroy.bind(this));
    }

    _queueRedisplay() {
        // Don't queue redisplays for hover menus to avoid interrupting animations
        if (this._isHoverMenu) {
            debugLog(`[PREVIEW] _queueRedisplay() ignored for hover menu`);
            return;
        }

        debugLog(`[PREVIEW] _queueRedisplay() called`);
        Main.queueDeferredWork(this._redisplayId);
    }

    _onScrollEvent(actor, event) {
        // Event coordinates are relative to the stage but can be transformed
        // as the actor will only receive events within his bounds.
        const [stageX, stageY] = event.get_coords();
        const [,, eventY] = actor.transform_stage_point(stageX, stageY);
        const [, actorH] = actor.get_size();

        // If the scroll event is within a 1px margin from
        // the relevant edge of the actor, let the event propagate.
        if (eventY >= actorH - 2)
            return Clutter.EVENT_PROPAGATE;

        // Skip to avoid double events mouse
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;

        let adjustment, delta;

        if (this.isHorizontal)
            adjustment = this.actor.get_hscroll_bar().get_adjustment();
        else
            adjustment = this.actor.get_vscroll_bar().get_adjustment();

        const increment = adjustment.step_increment;

        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            delta = -increment;
            break;
        case Clutter.ScrollDirection.DOWN:
            delta = Number(increment);
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            delta = dy * increment;
            delta += dx * increment;
            break;
        }
        }

        adjustment.set_value(adjustment.get_value() + delta);

        return Clutter.EVENT_STOP;
    }

    _onDestroy() {
        if (this._stateChangedId > 0) {
            this.app.disconnect(this._stateChangedId);
            this._stateChangedId = 0;
        }

        // Clean up deferred work to prevent memory leak
        if (this._redisplayId) {
            // Note: There's no public API to cancel deferred work, but we can null it
            this._redisplayId = null;
        }
    }

    _createPreviewItem(window) {
        const preview = new WindowPreviewMenuItem(window, Utils.getPosition());

        // Connect activate signal to focus the window when clicked
        preview.connect('activate', () => {
            debugLog(`[PREVIEW] Activating window: ${window.get_title()}`);
            Main.activateWindow(window);
            this._getTopMenu().close();
        });

        return preview;
    }

    _redisplay() {
        const windows = this._source.getInterestingWindows();
        debugLog(`[PREVIEW] WindowPreviewList._redisplay() called - ${windows.length} windows`);
        const children = this._getMenuItems().filter(actor => {
            return actor._window;
        });

        // Windows currently on the menu
        const oldWin = children.map(actor => {
            return actor._window;
        });

        // All app windows with a static order
        const newWin = this._source.getInterestingWindows().sort((a, b) =>
            a.get_stable_sequence() > b.get_stable_sequence());

        const addedItems = [];
        const removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;

        while (newIndex < newWin.length || oldIndex < oldWin.length) {
            const currentOldWin = oldWin[oldIndex];
            const currentNewWin = newWin[newIndex];

            // No change at oldIndex/newIndex
            if (currentOldWin === currentNewWin) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // Window removed at oldIndex
            if (currentOldWin && !newWin.includes(currentOldWin)) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // Window added at newIndex
            if (currentNewWin && !oldWin.includes(currentNewWin)) {
                addedItems.push({
                    item: this._createPreviewItem(currentNewWin),
                    pos: newIndex,
                });
                newIndex++;
                continue;
            }

            // Window moved
            const insertHere = newWin[newIndex + 1] &&
                             newWin[newIndex + 1] === currentOldWin;
            const alreadyRemoved = removedActors.reduce((result, actor) =>
                result || actor._window === currentNewWin, false);

            if (insertHere || alreadyRemoved) {
                addedItems.push({
                    item: this._createPreviewItem(currentNewWin),
                    pos: newIndex + removedActors.length,
                });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++) {
            this.addMenuItem(addedItems[i].item,
                addedItems[i].pos);
        }

        for (let i = 0; i < removedActors.length; i++) {
            const item = removedActors[i];
            if (this._shownInitially)
                item._animateOutAndDestroy();
            else
                item.actor.destroy();
        }

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once
        const animate = this._shownInitially;
        debugLog(`[PREVIEW] _redisplay calling show() - animate=${animate}, effect=${this._animConfig?.itemEffect}, items=${addedItems.length}`);

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++)
            addedItems[i].item.show(animate, this._animConfig, i);

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this.box.queue_relayout();

        if (newWin.length < 1)
            this._getTopMenu().close(~0);

        // As for upstream:
        // St.ScrollView always requests space horizontally for a possible vertical
        // scrollbar if in AUTOMATIC mode. Doing better would require implementation
        // of width-for-height in St.BoxLayout and St.ScrollView. This looks bad
        // when we *don't* need it, so turn off the scrollbar when that's true.
        // Dynamic changes in whether we need it aren't handled properly.

        // For hover menus, always disable scrollbars to avoid sizing issues
        const topMenu = this._getTopMenu();
        const isHoverMenu = topMenu.fromHover;

        const needsScrollbar = !isHoverMenu && this._needsScrollbar();
        const scrollbarPolicy = needsScrollbar
            ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
        if (this.isHorizontal)
            this.actor.hscrollbarPolicy = scrollbarPolicy;
        else
            this.actor.vscrollbarPolicy = scrollbarPolicy;

        if (needsScrollbar)
            this.actor.add_style_pseudo_class('scrolled');
        else
            this.actor.remove_style_pseudo_class('scrolled');
    }

    _needsScrollbar() {
        const topMenu = this._getTopMenu();
        const topThemeNode = topMenu.actor.get_theme_node();
        if (this.isHorizontal) {
            const [topMinWidth_, topNaturalWidth] =
                topMenu.actor.get_preferred_width(-1);
            const topMaxWidth = topThemeNode.get_max_width();
            return topMaxWidth >= 0 && topNaturalWidth >= topMaxWidth;
        } else {
            const [topMinHeight_, topNaturalHeight] =
                topMenu.actor.get_preferred_height(-1);
            const topMaxHeight = topThemeNode.get_max_height();
            return topMaxHeight >= 0 && topNaturalHeight >= topMaxHeight;
        }
    }

    isAnimatingOut() {
        return this.actor.get_children().reduce((result, actor) => {
            return result || actor.animatingOut;
        }, false);
    }
}

export const WindowPreviewMenuItem = GObject.registerClass(
class WindowPreviewMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(window, position, params) {
        super._init(params);

        this._window = window;
        this._destroyId = 0;
        this._windowAddedId = 0;
        this._peekingWindows = [];  // Track windows we've made transparent
        this._mappedSignalId = 0;  // Track notify::mapped signal for cleanup

        // We don't want this: it adds spacing on the left of the item.
        this.remove_child(this._ornamentIcon);
        this.add_style_class_name('dashtodock-app-well-preview-menu-item');
        this.add_style_class_name(Theming.PositionStyleClass[position]);
        if (Docking.DockManager.settings.customThemeShrink)
            this.add_style_class_name('shrink');

        // Now we don't have to set PREVIEW_MAX_WIDTH and PREVIEW_MAX_HEIGHT as
        // preview size - that made all kinds of windows either stretched or
        // squished (aspect ratio problem)
        this._cloneBin = new St.Bin();

        this._updateWindowPreviewSize();

        // TODO: improve the way the closebutton is layout. Just use some padding
        // for the moment.
        this._cloneBin.set_style('padding-bottom: 0.5em');

        const buttonLayout = Meta.prefs_get_button_layout();
        this.closeButton = new St.Button({
            style_class: 'window-close',
            opacity: 0,
            x_expand: true,
            y_expand: true,
            x_align: buttonLayout.left_buttons.includes(Meta.ButtonFunction.CLOSE)
                ? Clutter.ActorAlign.START : Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
        });
        Utils.addActor(this.closeButton, new St.Icon({icon_name: 'window-close-symbolic'}));
        this.closeButton.connect('clicked', () => this._closeWindow());

        const overlayGroup = new Clutter.Actor({
            layout_manager: new Clutter.BinLayout(),
            y_expand: true,
        });

        overlayGroup.add_child(this._cloneBin);
        overlayGroup.add_child(this.closeButton);

        const label = new St.Label({
            text: window.get_title(),
            style_class: 'window-preview-label',
        });
        // Set max-width to match max preview width (2:1 aspect ratio)
        // This ensures labels don't make the preview window too wide
        label.set_style(`max-width: ${PREVIEW_MAX_HEIGHT * 2}px`);
        const labelBin = new St.Bin({
            child: label,
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._windowTitleId = this._window.connect('notify::title', () => {
            label.set_text(this._window.get_title());
        });

        const box = new St.BoxLayout({
            vertical: true,
            reactive: true,
            x_expand: false,  // Don't expand - size to content (preview + label)
            x_align: Clutter.ActorAlign.CENTER,
        });

        if (box.add) {
            box.add(overlayGroup);
            box.add(labelBin);
        } else {
            box.add_child(overlayGroup);
            box.add_child(labelBin);
        }
        this._box = box;
        this.add_child(box);

        this._cloneTexture(window);

        this.connect('destroy', this._onDestroy.bind(this));
    }

    vfunc_style_changed() {
        super.vfunc_style_changed();

        // For some crazy clutter / St reason we can't just have this handled
        // automatically or here via vfunc_allocate + vfunc_get_preferred_*
        // because if we do so, the St paddings on first / last child are lost
        const themeNode = this.get_theme_node();
        let [minWidth, naturalWidth] = this._box.get_preferred_width(-1);
        let [minHeight, naturalHeight] = this._box.get_preferred_height(naturalWidth);
        [minWidth, naturalWidth] = themeNode.adjust_preferred_width(minWidth, naturalWidth);
        [minHeight, naturalHeight] = themeNode.adjust_preferred_height(minHeight, naturalHeight);
        this.set({minWidth, naturalWidth, minHeight, naturalHeight});
    }

    _getWindowPreviewSize() {
        const emptySize = [0, 0, 0];

        const mutterWindow = this._window.get_compositor_private();
        if (!mutterWindow?.get_texture())
            return emptySize;

        const [width, height] = mutterWindow.get_size();
        if (!width || !height)
            return emptySize;

        let {previewSizeScale: scale} = Docking.DockManager.settings;
        if (!scale) {
            // Calculate scale to fit within max dimensions while maintaining aspect ratio
            // Maximum width constraint: 2 × height (2:1 aspect ratio)
            const maxWidth = PREVIEW_MAX_HEIGHT * 2;  // 150 * 2 = 300px max width
            const maxHeight = PREVIEW_MAX_HEIGHT;      // 150px max height

            // Scale to fit within both width and height constraints
            scale = Math.min(1.0, maxWidth / width, maxHeight / height);
        }

        scale *= St.ThemeContext.get_for_stage(global.stage).scaleFactor;

        // width and height that we wanna multiply by scale
        return [width, height, scale];
    }

    _updateWindowPreviewSize() {
        // This gets the actual windows size for the preview
        [this._width, this._height, this._scale] = this._getWindowPreviewSize();
        this._cloneBin.set_size(this._width * this._scale, this._height * this._scale);
    }

    _cloneTexture(metaWin) {
        // Newly-created windows are added to a workspace before
        // the compositor finds out about them...
        if (!this._width || !this._height) {
            this._cloneTextureLater = Utils.laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
                // Check if there's still a point in getting the texture,
                // otherwise this could go on indefinitely
                this._updateWindowPreviewSize();

                if (this._width && this._height) {
                    this._cloneTexture(metaWin);
                } else {
                    this._cloneAttempt = (this._cloneAttempt || 0) + 1;
                    if (this._cloneAttempt < MAX_PREVIEW_GENERATION_ATTEMPTS)
                        return GLib.SOURCE_CONTINUE;
                }
                delete this._cloneTextureLater;
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        const mutterWindow = metaWin.get_compositor_private();
        const clone = new Clutter.Clone({
            source: mutterWindow,
            reactive: true,
            width: this._width * this._scale,
            height: this._height * this._scale,
        });

        // when the source actor is destroyed, i.e. the window closed, first destroy the clone
        // and then destroy the menu item (do this animating out)
        this._destroyId = mutterWindow.connect('destroy', () => {
            clone.destroy();
            this._destroyId = 0; // avoid to try to disconnect this signal from mutterWindow in _onDestroy(),
            // as the object was just destroyed
            this._animateOutAndDestroy();
        });

        this._clone = clone;
        this._mutterWindow = mutterWindow;
        this._cloneBin.set_child(this._clone);

        this._clone.connect('destroy', () => {
            if (this._destroyId) {
                mutterWindow.disconnect(this._destroyId);
                this._destroyId = 0;
            }
            this._clone = null;
        });
    }

    _windowCanClose() {
        return this._window.can_close() &&
               !this._hasAttachedDialogs();
    }

    _closeWindow() {
        this._workspace = this._window.get_workspace();

        // This mechanism is copied from the workspace.js upstream code
        // It forces window activation if the windows don't get closed,
        // for instance because asking user confirmation, by monitoring the opening of
        // such additional confirmation window
        this._windowAddedId = this._workspace.connect('window-added',
            this._onWindowAdded.bind(this));

        this.deleteAllWindows();
    }

    deleteAllWindows() {
        // Delete all windows, starting from the bottom-most (most-modal) one
        // let windows = this._window.get_compositor_private().get_children();
        const windows = this._clone.get_children();
        for (let i = windows.length - 1; i >= 1; i--) {
            const realWindow = windows[i].source;
            const metaWindow = realWindow.meta_window;

            metaWindow.delete(global.get_current_time());
        }

        this._window.delete(global.get_current_time());
    }

    _onWindowAdded(workspace, win) {
        const metaWindow = this._window;

        if (win.get_transient_for() === metaWindow) {
            workspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;

            // use an idle handler to avoid mapping problems -
            // see comment in Workspace._windowAdded
            const activationEvent = Clutter.get_current_event();
            this._windowAddedLater = Utils.laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
                delete this._windowAddedLater;
                this.emit('activate', activationEvent);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _hasAttachedDialogs() {
        // count transient windows
        let n = 0;
        this._window.foreach_transient(() => {
            n++;
        });
        return n > 0;
    }

    vfunc_key_focus_in() {
        super.vfunc_key_focus_in();
        this._showCloseButton();
    }

    vfunc_key_focus_out() {
        super.vfunc_key_focus_out();
        this._hideCloseButton();
    }

    vfunc_enter_event(crossingEvent) {
        this._showCloseButton();
        this._startAeroPeek();
        return super.vfunc_enter_event(crossingEvent);
    }

    vfunc_leave_event(crossingEvent) {
        this._hideCloseButton();
        this._endAeroPeek();
        return super.vfunc_leave_event(crossingEvent);
    }

    _startAeroPeek() {
        debugLog(`[PEEK] Starting Aero Peek for ${this._window.get_title()}`);

        // Get all windows in stack order (top to bottom)
        const workspace = this._window.get_workspace();
        if (!workspace)
            return;

        const allWindows = global.display.sort_windows_by_stacking(
            workspace.list_windows()
        ).reverse(); // Reverse to get top-to-bottom order

        // Find our target window's position in stack
        const targetIndex = allWindows.indexOf(this._window);
        if (targetIndex === -1)
            return;

        // Get all windows above our target (obscuring it)
        const windowsAbove = allWindows.slice(0, targetIndex);

        debugLog(`[PEEK] Found ${windowsAbove.length} windows above target`);

        // Fade out windows above our target
        windowsAbove.forEach(win => {
            const actor = win.get_compositor_private();
            if (actor && !win.minimized) {
                debugLog(`[PEEK] Fading window: ${win.get_title()}`);

                // Store original opacity if not already stored
                if (!actor._originalOpacity)
                    actor._originalOpacity = actor.opacity;

                this._peekingWindows.push(actor);

                // Animate to 99% transparent (1% opacity)
                actor.ease({
                    opacity: 3,  // ~1% opacity (255 * 0.01)
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        });
    }

    _endAeroPeek() {
        debugLog(`[PEEK] Ending Aero Peek, restoring ${this._peekingWindows.length} windows`);

        // Restore opacity to all peeked windows
        this._peekingWindows.forEach(actor => {
            if (actor && !actor.is_destroyed()) {
                const originalOpacity = actor._originalOpacity || 255;
                actor.ease({
                    opacity: originalOpacity,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        delete actor._originalOpacity;
                    },
                });
            }
        });

        this._peekingWindows = [];
    }

    _idleToggleCloseButton() {
        this._idleToggleCloseId = 0;

        this._hideCloseButton();

        return GLib.SOURCE_REMOVE;
    }

    _showCloseButton() {
        if (this._windowCanClose()) {
            this.closeButton.show();
            this.closeButton.remove_all_transitions();
            this.closeButton.ease({
                opacity: 255,
                duration: Workspace.WINDOW_OVERLAY_FADE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _hideCloseButton() {
        if (this.closeButton.has_pointer ||
            this.get_children().some(a => a.has_pointer))
            return;

        this.closeButton.remove_all_transitions();
        this.closeButton.ease({
            opacity: 0,
            duration: Workspace.WINDOW_OVERLAY_FADE_TIME,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
    }

    show(animate, animConfig, itemIndex = 0) {
        debugLog(`[PREVIEW] WindowPreviewMenuItem.show() - animate=${animate}, effect=${animConfig?.itemEffect}, index=${itemIndex}`);

        if (!animate || !animConfig) {
            // No animation - just show immediately
            debugLog(`[PREVIEW] show() - no animation, setting opacity=255`);
            this.opacity = 255;
            return;
        }

        const fullWidth = this.get_width();
        const delay = animConfig.itemDelay ? animConfig.itemDelay * itemIndex : 0;
        debugLog(`[PREVIEW] show() - fullWidth=${fullWidth}, delay=${delay}, visible=${this.visible}, mapped=${this.mapped}`);

        this.remove_all_transitions();

        switch (animConfig.itemEffect) {
        case 'instant':
            this.opacity = 255;
            break;

        case 'fade': {
            this.opacity = 0;

            // Animation only works when actor is mapped. If not mapped yet, wait for it.
            const startAnimation = () => {
                debugLog(`[PREVIEW] FADE animation starting - opacity 0→255, duration=${animConfig.itemDuration}ms, delay=${delay}ms, mapped=${this.mapped}`);
                this.ease({
                    opacity: 255,
                    duration: animConfig.itemDuration,
                    delay: delay,
                    mode: animConfig.itemMode,
                    onComplete: () => {
                        debugLog(`[PREVIEW] FADE animation completed`);
                    },
                });
            };

            if (this.mapped) {
                startAnimation();
            } else {
                debugLog(`[PREVIEW] FADE waiting for actor to be mapped before starting animation`);
                this._mappedSignalId = this.connect('notify::mapped', () => {
                    if (this.mapped) {
                        debugLog(`[PREVIEW] FADE actor now mapped, starting animation`);
                        this.disconnect(this._mappedSignalId);
                        this._mappedSignalId = 0;
                        startAnimation();
                    }
                });
            }
            break;
        }

        case 'slide': {
            this.opacity = 0;
            this.translationY = -20;  // Slide down from above

            const startAnimation = () => {
                debugLog(`[PREVIEW] SLIDE animation starting - duration=${animConfig.itemDuration}ms, delay=${delay}ms, mapped=${this.mapped}`);
                this.ease({
                    opacity: 255,
                    translationY: 0,
                    duration: animConfig.itemDuration,
                    delay: delay,
                    mode: animConfig.itemMode,
                    onComplete: () => {
                        debugLog(`[PREVIEW] SLIDE animation completed`);
                    },
                });
            };

            if (this.mapped) {
                startAnimation();
            } else {
                debugLog(`[PREVIEW] SLIDE waiting for actor to be mapped before starting animation`);
                this._mappedSignalId = this.connect('notify::mapped', () => {
                    if (this.mapped) {
                        debugLog(`[PREVIEW] SLIDE actor now mapped, starting animation`);
                        this.disconnect(this._mappedSignalId);
                        this._mappedSignalId = 0;
                        startAnimation();
                    }
                });
            }
            break;
        }

        case 'scale': {
            this.opacity = 0;
            this.set_scale(0.8, 0.8);

            const startAnimation = () => {
                debugLog(`[PREVIEW] SCALE animation starting - duration=${animConfig.itemDuration}ms, delay=${delay}ms, mapped=${this.mapped}`);
                this.ease({
                    opacity: 255,
                    scaleX: 1.0,
                    scaleY: 1.0,
                    duration: animConfig.itemDuration,
                    delay: delay,
                    mode: animConfig.itemMode,
                    onComplete: () => {
                        debugLog(`[PREVIEW] SCALE animation completed`);
                    },
                });
            };

            if (this.mapped) {
                startAnimation();
            } else {
                debugLog(`[PREVIEW] SCALE waiting for actor to be mapped before starting animation`);
                this._mappedSignalId = this.connect('notify::mapped', () => {
                    if (this.mapped) {
                        debugLog(`[PREVIEW] SCALE actor now mapped, starting animation`);
                        this.disconnect(this._mappedSignalId);
                        this._mappedSignalId = 0;
                        startAnimation();
                    }
                });
            }
            break;
        }

        case 'expand': {  // Original behavior
            this.opacity = 0;
            this.set_width(0);

            const startAnimation = () => {
                debugLog(`[PREVIEW] EXPAND animation starting - duration=${animConfig.itemDuration}ms, delay=${delay}ms, mapped=${this.mapped}`);
                this.ease({
                    opacity: 255,
                    width: fullWidth,
                    duration: animConfig.itemDuration,
                    delay: delay,
                    mode: animConfig.itemMode,
                    onComplete: () => {
                        debugLog(`[PREVIEW] EXPAND animation completed`);
                    },
                });
            };

            if (this.mapped) {
                startAnimation();
            } else {
                debugLog(`[PREVIEW] EXPAND waiting for actor to be mapped before starting animation`);
                this._mappedSignalId = this.connect('notify::mapped', () => {
                    if (this.mapped) {
                        debugLog(`[PREVIEW] EXPAND actor now mapped, starting animation`);
                        this.disconnect(this._mappedSignalId);
                        this._mappedSignalId = 0;
                        startAnimation();
                    }
                });
            }
            break;
        }

        case 'dissolve': {
            this.opacity = 0;
            this.set_scale(0.95, 0.95);

            const startAnimation = () => {
                debugLog(`[PREVIEW] DISSOLVE animation starting - duration=${animConfig.itemDuration}ms, delay=${delay}ms, mapped=${this.mapped}`);
                this.ease({
                    opacity: 255,
                    scaleX: 1.0,
                    scaleY: 1.0,
                    duration: animConfig.itemDuration,
                    delay: delay,
                    mode: animConfig.itemMode,
                    onComplete: () => {
                        debugLog(`[PREVIEW] DISSOLVE animation completed`);
                    },
                });
            };

            if (this.mapped) {
                startAnimation();
            } else {
                debugLog(`[PREVIEW] DISSOLVE waiting for actor to be mapped before starting animation`);
                this._mappedSignalId = this.connect('notify::mapped', () => {
                    if (this.mapped) {
                        debugLog(`[PREVIEW] DISSOLVE actor now mapped, starting animation`);
                        this.disconnect(this._mappedSignalId);
                        this._mappedSignalId = 0;
                        startAnimation();
                    }
                });
            }
            break;
        }

        case 'cascade': {
            this.opacity = 0;

            const startAnimation = () => {
                debugLog(`[PREVIEW] CASCADE animation starting - duration=${animConfig.itemDuration}ms, delay=${delay}ms, mapped=${this.mapped}`);
                this.ease({
                    opacity: 255,
                    duration: animConfig.itemDuration,
                    delay: delay,
                    mode: animConfig.itemMode,
                    onComplete: () => {
                        debugLog(`[PREVIEW] CASCADE animation completed`);
                    },
                });
            };

            if (this.mapped) {
                startAnimation();
            } else {
                debugLog(`[PREVIEW] CASCADE waiting for actor to be mapped before starting animation`);
                this._mappedSignalId = this.connect('notify::mapped', () => {
                    if (this.mapped) {
                        debugLog(`[PREVIEW] CASCADE actor now mapped, starting animation`);
                        this.disconnect(this._mappedSignalId);
                        this._mappedSignalId = 0;
                        startAnimation();
                    }
                });
            }
            break;
        }

        default:
            // Fallback to instant
            this.opacity = 255;
            break;
        }
    }

    _animateOutAndDestroy() {
        this.remove_all_transitions();
        this.ease({
            opacity: 0,
            duration: PREVIEW_ANIMATION_DURATION,
        });

        this.ease({
            width: 0,
            height: 0,
            duration: PREVIEW_ANIMATION_DURATION,
            delay: PREVIEW_ANIMATION_DURATION,
            onComplete: () => this.destroy(),
        });
    }

    activate() {
        Main.activateWindow(this._window);
        this._getTopMenu().close();
    }

    _onDestroy() {
        // Clean up Aero Peek if active
        this._endAeroPeek();

        if (this._cloneTextureLater) {
            Utils.laterRemove(this._cloneTextureLater);
            delete this._cloneTextureLater;
        }

        if (this._windowAddedLater) {
            Utils.laterRemove(this._windowAddedLater);
            delete this._windowAddedLater;
        }

        if (this._windowAddedId > 0) {
            this._workspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;
        }

        if (this._destroyId > 0) {
            this._mutterWindow.disconnect(this._destroyId);
            this._destroyId = 0;
        }

        if (this._windowTitleId > 0) {
            this._window.disconnect(this._windowTitleId);
            this._windowTitleId = 0;
        }

        // Clean up mapped signal if animation was waiting for actor to be mapped
        if (this._mappedSignalId > 0) {
            this.disconnect(this._mappedSignalId);
            this._mappedSignalId = 0;
        }
    }
});
