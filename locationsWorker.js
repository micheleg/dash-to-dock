#!/usr/bin/env gjs

const { GLib, Gio } = imports.gi;

const currentPath = GLib.path_get_dirname(new Error().fileName);
imports.searchPath.unshift(currentPath);

const GJS_SUPPORTS_FILE_IFACE_PROMISES = imports.system.version >= 17101;

if (GJS_SUPPORTS_FILE_IFACE_PROMISES)
    Gio._promisify(Gio.File.prototype, 'query_default_handler_async');

function getHandlerAppAsync(location, cancellable) {
    if (!location)
        return null;

    if (!GJS_SUPPORTS_FILE_IFACE_PROMISES) {
        Gio._promisify(location.constructor.prototype,
            'query_default_handler_async',
            'query_default_handler_finish');
    }

    return location.query_default_handler_async(
        GLib.PRIORITY_DEFAULT, cancellable);
}

function main(argv) {
    if (argv.length < 1) {
        const currentBinary = GLib.path_get_basename(new Error().fileName);
        printerr(`Usage: ${currentBinary} <action> uri [ --timeout <value> ]`);
        return 1;
    }

    const [action, uri] = argv;
    let timeout = 200;

    if (action !== 'handler')
        throw new TypeError(`Unexpected action ${action}`);

    for (let i = 1; i < argv.length; ++i) {
        if (argv[i] === '--timeout' && i < argv.length - 1)
            timeout = argv[++i];
    }

    const location = Gio.File.new_for_uri(uri);
    const cancellable = new Gio.Cancellable();

    // GVfs providers could hang when querying the file information, so we
    // workaround this by using the async API in a sync way, but we need to
    // use a timeout to avoid this to hang forever, better than hang the
    // shell.
    let handler, error, launchMaxWaitId;
    Promise.race([
        getHandlerAppAsync(location, cancellable),
        new Promise((resolve, reject) => {
            launchMaxWaitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
                launchMaxWaitId = 0;
                cancellable.cancel();
                reject(new GLib.Error(Gio.IOErrorEnum,
                    Gio.IOErrorEnum.TIMED_OUT,
                    `Searching for ${location.get_uri()} handler took too long`));
                return GLib.SOURCE_REMOVE;
            });
        }),
    ]).then(h => (handler = h)).catch(e => (error = e));

    while (handler === undefined && error === undefined)
        GLib.MainContext.default().iteration(false);

    if (launchMaxWaitId)
        GLib.source_remove(launchMaxWaitId);

    if (error) {
        printerr(error.message);
        logError(error);
        return error.code;
    }

    print(handler.get_id());

    return GLib.MAXUINT8;
}

main(ARGV);
