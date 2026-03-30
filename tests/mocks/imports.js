// Mock for ./imports.js barrel file
// Provides stubs for Docking and Utils used by intellihide.js.

export const Docking = {
    DockManager: {
        settings: {
            intellihideMode: 0, // ALL_WINDOWS
        },
    },
};

export const Utils = {
    GlobalSignalsHandler: class MockGlobalSignalsHandler {
        constructor() {
            this._entries = [];
        }

        add(..._args) {}
        addWithLabel(..._args) {}
        removeWithLabel(..._args) {}
        destroy() {}
        block() {}
        unblock() {}
    },

    getMonitorManager() {
        return {
            connect: () => 0,
            disconnect: () => {},
        };
    },
};
