import * as Sentry from '@sentry/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8')
);

export function beforeSend(event) {
  if (event.request) {
    event.request.data = '[Filtered]';
    if (event.request.headers) {
      delete event.request.headers['x-reach-secret'];
    }
  }
  return event;
}

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: version,
    beforeSend,
  });
}

initSentry();
