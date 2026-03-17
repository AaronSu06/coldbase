// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
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
let request;

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
  request = function(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-reach-secret': 'test-secret',
          'Content-Length': data ? Buffer.byteLength(data) : 0,
          ...extraHeaders,
        },
      }, res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  };
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe('GET /api/insights/best-time', () => {
  it('returns insufficient:true when database is empty', async () => {
    const { status, body } = await request('GET', '/api/insights/best-time');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.insufficient, true);
    assert.strictEqual(typeof body.sent, 'number');
    assert.strictEqual(typeof body.replied, 'number');
  });

  it('requires x-reach-secret', async () => {
    const { status } = await request('GET', '/api/insights/best-time', null, {
      'x-reach-secret': 'wrong',
    });
    assert.strictEqual(status, 401);
  });
});
