#!/usr/bin/env gjs

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

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

async function mainAsync(argv) {
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
    let launchMaxWaitId;

    try {
        const handler = await Promise.race([
            getHandlerAppAsync(location, cancellable),
            new Promise((_resolve, reject) => {
                launchMaxWaitId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT, timeout, () => {
                        launchMaxWaitId = 0;
                        cancellable.cancel();
                        reject(new GLib.Error(Gio.IOErrorEnum,
                            Gio.IOErrorEnum.TIMED_OUT,
                            `Searching for ${location.get_uri()} ` +
                            'handler took too long'));
                        return GLib.SOURCE_REMOVE;
                    });
            }),
        ]);

        print(handler.get_id());
    } catch (e) {
        printerr(e.message);
        logError(e);
        return e.code ? e.code : GLib.MAXUINT8;
    } finally {
        if (launchMaxWaitId)
            GLib.source_remove(launchMaxWaitId);
    }

    return 0;
}

function main(args) {
    let ret;
    const loop = new GLib.MainLoop(null, false);
    mainAsync(args).then(r => (ret = r)).catch(logError).finally(() => loop.quit());
    loop.run();

    return ret;
}

imports.system.exit(main(ARGV));
