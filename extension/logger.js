// extension/logger.js
// Classic script — loaded by manifest content_scripts and by background.js scripting fallback.
// Must NOT contain ES module syntax (export/import) because content scripts are classic scripts.
//
// Content script usage:  window.ReachLogger('module')
// background.js usage:   import makeLogger from a separate ES-module wrapper, OR
//                        define a local makeLogger inline (see background.js).

// Self-contained DEBUG flag. Set to false before publishing to Chrome Web Store.
const DEBUG = true;

function makeLogger(module) {
  const prefix = `[Reach/${module}]`;
  return {
    debug: (...a) => DEBUG && console.debug(prefix, ...a),
    info:  (...a) => DEBUG && console.log(prefix, ...a),
    warn:  (...a) => console.warn(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
  };
}

// Global for content script consumers (classic scripts loaded via manifest content_scripts array)
if (typeof window !== 'undefined') {
  window.ReachLogger = makeLogger;
}
