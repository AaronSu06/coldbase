// server/email.test.js
process.env.DATABASE_URL      = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL        = process.env.TEST_DIRECT_URL;
process.env.JWT_SECRET        = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS     = '1';
process.env.SNOV_CLIENT_ID     = 'test-snov-id';
process.env.SNOV_CLIENT_SECRET = 'test-snov-secret';
process.env.NODE_ENV           = 'test';

import { describe, it, before, after, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Mock fetch ───────────────────────────────────────────────────────────────
// Default: handles Snov.io token endpoint + returns empty emails for API calls
let mockFetchImpl = async (url) => {
  if (url === 'https://api.snov.io/v1/oauth/access_token') {
    return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
  }
  return { ok: true, json: async () => ({ emails: [] }) };
};
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

  it('returns 500 when SNOV_CLIENT_ID is not set', async () => {
    const savedId = process.env.SNOV_CLIENT_ID;
    delete process.env.SNOV_CLIENT_ID;
    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );
    process.env.SNOV_CLIENT_ID = savedId;
    assert.equal(res.status, 500);
  });

  it('Mode B: returns email result from Snov.io email-finder', async () => {
    mockFetchImpl = async (url) => {
      if (url === 'https://api.snov.io/v1/oauth/access_token') {
        return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ({ emails: [{ email: 'patrick@stripe.com' }] }) };
    };

    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com', firstName: 'Patrick', lastName: 'Collison' },
      { Authorization: authHeader }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.results.length, 1);
    assert.equal(res.body.results[0].email, 'patrick@stripe.com');
    // No confidence field — Snov.io doesn't return confidence scores
    assert.equal(res.body.results[0].confidence, undefined);
  });

  it('Mode A: returns emails from Snov.io domain search', async () => {
    mockFetchImpl = async (url) => {
      if (url === 'https://api.snov.io/v1/oauth/access_token') {
        return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
      }
      return {
        ok: true,
        json: async () => ({
          emails: [
            { email: 'press@stripe.com' },
            { email: 'support@stripe.com' },
          ],
        }),
      };
    };

    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.results.length, 2);
    assert.equal(res.body.results[0].email, 'press@stripe.com');
    assert.equal(res.body.results[0].confidence, undefined);
  });

  it('returns no_candidates when Snov.io finds nothing', async () => {
    mockFetchImpl = async (url) => {
      if (url === 'https://api.snov.io/v1/oauth/access_token') {
        return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ({ emails: [] }) };
    };

    const res = await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, 'no_candidates');
  });

  it('calls Snov.io email-finder (not domain-search) when name is provided', async () => {
    mockFetchImpl = async (url) => {
      if (url === 'https://api.snov.io/v1/oauth/access_token') {
        return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ({ emails: [{ email: 'a@b.com' }] }) };
    };

    await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com', firstName: 'Alice', lastName: 'Smith' },
      { Authorization: authHeader }
    );

    const allUrls = mockFetch.mock.calls.map(c => c.arguments[0]);
    assert.ok(allUrls.some(u => u.includes('email-finder')), `Expected email-finder URL, got: ${allUrls}`);
    assert.ok(!allUrls.some(u => u.includes('get-domain-emails')), 'Should not call domain-search when name is provided');
  });

  it('calls Snov.io domain search when no name provided', async () => {
    mockFetchImpl = async (url) => {
      if (url === 'https://api.snov.io/v1/oauth/access_token') {
        return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ({ emails: [] }) };
    };

    await request('POST', '/api/find-email',
      { company: 'Stripe', domain: 'stripe.com' },
      { Authorization: authHeader }
    );

    const allUrls = mockFetch.mock.calls.map(c => c.arguments[0]);
    assert.ok(allUrls.some(u => u.includes('get-domain-emails')), `Expected get-domain-emails URL, got: ${allUrls}`);
    assert.ok(!allUrls.some(u => u.includes('email-finder')), 'Should not call email-finder when no name provided');
  });
});

describe('POST /api/feedback', () => {
  let proToken, proUserId;

  before(async () => {
    const bcrypt = (await import('bcrypt')).default;
    const user = await prisma.user.create({
      data: {
        email: 'feedback-test@example.com',
        passwordHash: await bcrypt.hash('pass', 1),
        plan: 'pro',
        resumeText: 'Sarah Chen — Software Engineer\nSkills: TypeScript, React, Node.js\nExperience: 2 years at Shopify',
      },
    });
    proUserId = user.id;
    proToken = jwt.sign({ userId: user.id, email: user.email }, 'test-jwt-secret');
  });

  it('returns 403 for non-pro user', async () => {
    const res = await request('POST', '/api/feedback',
      { company: 'Stripe', status: 'Sent' },
      { Authorization: authHeader }
    );
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'pro_required');
  });

  it('returns 500 when GEMINI_KEY not set', async () => {
    const saved = process.env.GEMINI_KEY;
    delete process.env.GEMINI_KEY;
    const res = await request('POST', '/api/feedback',
      { company: 'Stripe', status: 'Sent' },
      { Authorization: `Bearer ${proToken}` }
    );
    process.env.GEMINI_KEY = saved;
    assert.equal(res.status, 500);
  });

  it('calls Gemini with resume context when user has resumeText', async () => {
    process.env.GEMINI_KEY = 'test-gemini-key';
    let capturedBody;
    mockFetchImpl = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Great job!' }] } }] }) };
    };

    const res = await request('POST', '/api/feedback',
      { company: 'Stripe', subject: 'Internship inquiry', status: 'Sent', snippet: '[OUT] Me: Hi there\n\n[IN] Recruiter: Thanks for reaching out' },
      { Authorization: `Bearer ${proToken}` }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.text, 'Great job!');

    const prompt = capturedBody.contents[0].parts[0].text;
    assert.ok(prompt.includes('Sarah Chen'), 'prompt should include resume content');
    assert.ok(prompt.includes('[OUT]'), 'prompt should include full snippet');
    delete process.env.GEMINI_KEY;
  });

  it('calls Gemini without resume block when user has no resumeText', async () => {
    process.env.GEMINI_KEY = 'test-gemini-key';
    await prisma.user.update({ where: { id: proUserId }, data: { resumeText: null } });
    let capturedBody;
    mockFetchImpl = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) };
    };

    await request('POST', '/api/feedback',
      { company: 'Stripe', status: 'Sent' },
      { Authorization: `Bearer ${proToken}` }
    );

    const prompt = capturedBody.contents[0].parts[0].text;
    assert.ok(!prompt.includes('Candidate background'), 'resume block should not appear when resumeText is null');
    delete process.env.GEMINI_KEY;
  });
});
