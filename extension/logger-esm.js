// extension/logger-esm.js
// ES module wrapper around the logger factory — for background-side ES modules
// (background.js, auth.js, api-client.js, reply-checker.js, classifier.js).
//
// Content scripts must use logger.js (classic script) instead — ES module
// syntax is not allowed in manifest content_scripts arrays.

import { DEBUG } from './config.js';

export function makeLogger(module) {
  const prefix = `[Coldbase/${module}]`;
  return {
    debug: (...a) => DEBUG && console.debug(prefix, ...a),
    info:  (...a) => DEBUG && console.log(prefix, ...a),
    warn:  (...a) => console.warn(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
  };
}

// Named export alias for callers that do: import { logger } from './logger-esm.js'
export const logger = makeLogger;
