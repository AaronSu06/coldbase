// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL = 'file:./test.db';
process.env.REACH_SECRET = 'test-secret';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let server;
let port;

before(async () => {
  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit',
  });

  const { default: app } = await import('./app.js');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe('GET /track/:trackingId', () => {
  it('returns 200 with image/gif content-type for nonexistent trackingId', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/track/nonexistent-tracking-id`, resolve)
        .on('error', reject);
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'image/gif');
    // Drain the response body
    await new Promise(resolve => res.resume().on('end', resolve));
  });

  it('returns 200 with image/gif for .gif suffix variant', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/track/some-id.gif`, resolve)
        .on('error', reject);
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'image/gif');
    await new Promise(resolve => res.resume().on('end', resolve));
  });
});
