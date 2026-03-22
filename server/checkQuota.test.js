// server/checkQuota.test.js
// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL   = process.env.TEST_DIRECT_URL;
process.env.JWT_SECRET   = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '1';
process.env.HUNTER_KEY   = 'test-hunter-key';

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock fetch globally so no real Hunter API calls are made
const mockFetch = mock.fn(async () => ({
  ok: true,
  json: async () => ({ data: { emails: [{ value: 'test@example.com', confidence: 80 }] } }),
}));
global.fetch = mockFetch;

let server, port, prisma, request, authHeader;

before(async () => {
  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit',
  });

  const [appMod, prismaMod] = await Promise.all([
    import('./app.js'),
    import('./lib/prisma.js'),
  ]);
  prisma = prismaMod.prisma;

  server = http.createServer(appMod.default);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  // Create a test user
  const bcrypt = (await import('bcrypt')).default;
  const user = await prisma.user.create({
    data: {
      email: 'quota-test@example.com',
      passwordHash: await bcrypt.hash('pass', 1),
      plan: 'basic',
    },
  });

  const token = jwt.sign({ userId: user.id, email: user.email }, 'test-jwt-secret');
  authHeader = `Bearer ${token}`;

  request = (method, path, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        { hostname: '127.0.0.1', port, path, method,
          headers: { 'Content-Type': 'application/json', ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
        (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || 'null') }));
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
});

describe('checkQuota middleware', () => {
  it('allows request when under limit', async () => {
    const res = await request('POST', '/api/find-email',
      { company: 'Example', domain: 'example.com' },
      { Authorization: authHeader }
    );
    assert.notEqual(res.status, 429);
  });

  it('returns 429 when monthly limit exceeded', async () => {
    // Set user over limit
    await prisma.user.updateMany({
      where: { email: 'quota-test@example.com' },
      data: { lookupsUsedThisMonth: 50, lookupsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const res = await request('POST', '/api/find-email',
      { company: 'Example', domain: 'example.com' },
      { Authorization: authHeader }
    );
    assert.equal(res.status, 429);
    assert.equal(res.body.error, 'quota_exceeded');
    assert.ok(typeof res.body.used === 'number');
    assert.ok(typeof res.body.limit === 'number');
  });

  it('resets quota when lookupsResetAt is in the past', async () => {
    // Set user over limit but with expired reset date
    await prisma.user.updateMany({
      where: { email: 'quota-test@example.com' },
      data: { lookupsUsedThisMonth: 50, lookupsResetAt: new Date(Date.now() - 1000) },
    });

    const res = await request('POST', '/api/find-email',
      { company: 'Example', domain: 'example.com' },
      { Authorization: authHeader }
    );
    assert.notEqual(res.status, 429);
  });

  it('increments lookupsUsedThisMonth after successful lookup', async () => {
    await prisma.user.updateMany({
      where: { email: 'quota-test@example.com' },
      data: { lookupsUsedThisMonth: 0, lookupsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    await request('POST', '/api/find-email',
      { company: 'Example', domain: 'example.com' },
      { Authorization: authHeader }
    );

    const user = await prisma.user.findFirst({ where: { email: 'quota-test@example.com' } });
    assert.equal(user.lookupsUsedThisMonth, 1);
  });
});
