// server/email.test.js
process.env.DATABASE_URL  = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL    = process.env.TEST_DIRECT_URL;
process.env.JWT_SECRET    = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '1';
process.env.HUNTER_KEY    = 'test-hunter-key';

import { describe, it, before, after, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Mock fetch ───────────────────────────────────────────────────────────────
let mockFetchImpl = async () => ({ ok: true, json: async () => ({ data: null }) });
const mockFetch = mock.fn((...args) => mockFetchImpl(...args));
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

  const bcrypt = (await import('bcrypt')).default;
  const user = await prisma.user.create({
    data: { email: 'email-test@example.com', passwordHash: await bcrypt.hash('pass', 1), plan: 'basic' },
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

beforeEach(async () => {
  // Reset quota before each test
  await prisma.user.updateMany({
    where: { email: 'email-test@example.com' },
    data: { lookupsUsedThisMonth: 0, lookupsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });
  mockFetch.mock.resetCalls();
});

describe('POST /api/find-email', () => {
  it('returns 400 when company is missing', async () => {
    const res = await request('POST', '/api/find-email', {}, { Authorization: authHeader });
    assert.equal(res.status, 400);
  });

  it('returns 500 when HUNTER_KEY is not set', async () => {
    const savedKey = process.env.HUNTER_KEY;
    delete process.env.HUNTER_KEY;
    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );
    process.env.HUNTER_KEY = savedKey;
    assert.equal(res.status, 500);
  });

  it('Mode B: returns email result from Hunter email-finder', async () => {
    mockFetchImpl = async () => ({
      ok: true,
      json: async () => ({
        data: { email: 'patrick@stripe.com', score: 92 },
      }),
    });

    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com', firstName: 'Patrick', lastName: 'Collison' },
      { Authorization: authHeader }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.results.length, 1);
    assert.equal(res.body.results[0].email, 'patrick@stripe.com');
    assert.equal(res.body.results[0].confidence, 92);
    // Source/status/domain fields removed from response
    assert.equal(res.body.results[0].status,  undefined);
    assert.equal(res.body.results[0].source,  undefined);
    assert.equal(res.body.results[0].domain,  undefined);
  });

  it('Mode A: returns emails from Hunter domain-search', async () => {
    mockFetchImpl = async () => ({
      ok: true,
      json: async () => ({
        data: {
          domain: 'stripe.com',
          emails: [
            { value: 'press@stripe.com',   confidence: 80 },
            { value: 'support@stripe.com', confidence: 65 },
          ],
        },
      }),
    });

    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.results.length, 2);
    assert.equal(res.body.results[0].email, 'press@stripe.com');
    assert.equal(res.body.results[0].confidence, 80);
  });

  it('returns no_candidates when Hunter finds nothing', async () => {
    mockFetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: null }),
    });

    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, 'no_candidates');
  });

  it('calls Hunter email-finder (not domain-search) when name is provided', async () => {
    mockFetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: { email: 'a@b.com', score: 50 } }),
    });

    await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com', firstName: 'Alice', lastName: 'Smith' },
      { Authorization: authHeader }
    );

    const calledUrl = mockFetch.mock.calls[0]?.arguments[0] || '';
    assert.ok(calledUrl.includes('email-finder'), `Expected email-finder URL, got: ${calledUrl}`);
    assert.ok(!calledUrl.includes('domain-search'));
  });

  it('calls Hunter domain-search when no name provided', async () => {
    mockFetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: { domain: 'stripe.com', emails: [] } }),
    });

    await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );

    const calledUrl = mockFetch.mock.calls[0]?.arguments[0] || '';
    assert.ok(calledUrl.includes('domain-search'), `Expected domain-search URL, got: ${calledUrl}`);
  });
});
