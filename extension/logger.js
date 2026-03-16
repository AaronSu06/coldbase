// extension/logger.js
// Dual-mode: works as ES module (background.js) and as a classic script (content scripts).
//
// Background usage:  import { logger } from './logger.js';
// Content usage:     window.ReachLogger('module') — set automatically when loaded as classic script

// Self-contained DEBUG flag. Set to false before publishing to Chrome Web Store.
// (Background modules may also import DEBUG directly from config.js.)
const DEBUG = true;

function makeLogger(module) {
  const prefix = `[Reach/${module}]`;
  return {
    debug: (...a) => DEBUG && console.debug(prefix, ...a),
    info:  (...a) => DEBUG && console.log(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
  };
}

// ES module export — for background.js and background-side modules
export { makeLogger as logger };

// Global for content script consumers (classic scripts loaded via manifest content_scripts array)
if (typeof window !== 'undefined') {
  window.ReachLogger = makeLogger;
}
