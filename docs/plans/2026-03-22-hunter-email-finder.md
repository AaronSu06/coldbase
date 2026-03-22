# Hunter Email Finder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace Gemini+SMTP email finding with Hunter.io API, add per-user monthly lookup quotas, and persist Find Contacts / Draft AI state across widget sessions.

**Architecture:** Delete `emailFinder.js` entirely; replace the `/find-email` route handler with a direct Hunter API call (Mode A: domain search, Mode B: name+domain finder). A new `checkQuota` middleware sits between `requireAuth` and the route to enforce per-plan monthly limits. Session state is saved to `chrome.storage.session` in `compose-widget.js` so Find Contacts results and Draft AI output survive across Gmail tab navigations.

**Tech Stack:** Express, Prisma (PostgreSQL/Neon), Hunter.io REST API, Node.js `node:test`, `chrome.storage.session`

---

## Task 1: DB Migration — Add Quota Fields to User

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add fields to User model**

In `server/prisma/schema.prisma`, add two fields inside the `User` model after `plan String @default("free")`:

```prisma
model User {
  id                   Int             @id @default(autoincrement())
  email                String          @unique
  passwordHash         String
  plan                 String          @default("free")
  lookupsUsedThisMonth Int             @default(0)
  lookupsResetAt       DateTime?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  outreaches           Outreach[]
  trackingPixels       TrackingPixel[]
}
```

**Step 2: Run migration**

```bash
cd server
npx prisma migrate dev --name add-lookup-quota
```

Expected: `✔ Your database is now in sync with your schema.` and a new migration file in `server/prisma/migrations/`.

**Step 3: Verify Prisma client regenerated**

```bash
cd server
node -e "import('./lib/prisma.js').then(({prisma}) => prisma.user.findFirst().then(u => console.log('ok', u)).catch(console.error))"
```

Expected: `ok null` (or a user object if DB has data) — no `Unknown field` errors.

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat(db): add lookupsUsedThisMonth and lookupsResetAt to User"
```

---

## Task 2: Write Failing Tests for checkQuota Middleware

**Files:**
- Create: `server/checkQuota.test.js`

**Context:** Tests use Node's built-in `node:test` runner + `assert/strict`. They start an HTTP server with the actual Express app, use a real test database (configured via `TEST_DATABASE_URL`). Run tests with `npm test` from the `server/` directory.

**Step 1: Write the test file**

```js
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
  json: async () => ({ data: { email: 'test@example.com', score: 80 } }),
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
```

**Step 2: Run tests — verify they fail**

```bash
cd server
npm test -- checkQuota.test.js
```

Expected: tests fail because `checkQuota` middleware doesn't exist yet.

---

## Task 3: Implement checkQuota Middleware

**Files:**
- Create: `server/middleware/checkQuota.js`

**Step 1: Write the middleware**

```js
// server/middleware/checkQuota.js
import { prisma } from '../lib/prisma.js';

const PLAN_LIMITS = {
  free:  5,
  basic: 50,
  pro:   200,
};

export default async function checkQuota(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const limit = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
  const now   = new Date();

  // Reset quota if window has passed
  if (!user.lookupsResetAt || user.lookupsResetAt <= now) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await prisma.user.update({
      where: { id: userId },
      data:  { lookupsUsedThisMonth: 0, lookupsResetAt: nextMonth },
    });
    user.lookupsUsedThisMonth = 0;
  }

  if (user.lookupsUsedThisMonth >= limit) {
    return res.status(429).json({
      error: 'quota_exceeded',
      used:  user.lookupsUsedThisMonth,
      limit,
    });
  }

  // Attach increment helper — called by route after successful Hunter response
  req.incrementQuota = () =>
    prisma.user.update({
      where: { id: userId },
      data:  { lookupsUsedThisMonth: { increment: 1 } },
    });

  next();
}
```

**Step 2: Run tests — verify they pass**

```bash
cd server
npm test -- checkQuota.test.js
```

Expected: all 4 tests pass. (They may fail on the Hunter route parts — that's fine, those tests come next.)

**Step 3: Commit**

```bash
git add server/middleware/checkQuota.js
git commit -m "feat(server): checkQuota middleware with plan-based monthly limits"
```

---

## Task 4: Write Failing Tests for /find-email Hunter Route

**Files:**
- Create: `server/email.test.js`

**Step 1: Write the test file**

```js
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
```

**Step 2: Run tests — verify they fail**

```bash
cd server
npm test -- email.test.js
```

Expected: fails — the route still calls the old `findEmails` function.

---

## Task 5: Implement Hunter Route, Delete emailFinder.js

**Files:**
- Modify: `server/routes/email.js`
- Delete: `server/emailFinder.js`

**Step 1: Replace the /find-email handler in `server/routes/email.js`**

Replace lines 1–70 (the imports + FindEmailSchema + /find-email handler). The file after editing:

```js
import { Router } from 'express';
import dns from 'dns';
import { z } from 'zod';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const FindEmailSchema = z.object({
  company:   z.string().min(1),
  domain:    z.string().optional(),
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
}).passthrough();

const SuggestDomainsSchema = z.object({
  company: z.string().min(1),
});

const DraftEmailSchema = z.object({
  draftType: z.string().min(1),
}).passthrough();

// ─── Draft prompt builder ─────────────────────────────────────────────────────

function buildDraftPrompt({ draftType, company, contactName, subject, bodySnippet, notes }) {
  const who = contactName || 'the recruiter';
  const co  = company || 'the company';
  const notesCtx = notes ? `\nExtra context: ${notes}` : '';
  if (draftType === 'cold') {
    return `You are helping Aaron, a CS student, write a cold outreach email for a software engineering internship.

Company: ${co}
Contact: ${who}
Subject: ${subject || ''}${notesCtx}

Write a short, personalized cold email (3–4 sentences). Casual but professional. Sign off as Aaron.
Return ONLY the email body. No subject line, no preamble.`;
  }
  if (draftType === 'bump') {
    return `You are helping Aaron write a brief follow-up to a cold outreach that got no reply.

Company: ${co}
Contact: ${who}
Original subject: ${subject || ''}${bodySnippet ? `\nOriginal email excerpt: ${bodySnippet.slice(0, 200)}` : ''}${notesCtx}

Write a short 2–3 sentence follow-up. Low pressure. Reference the original email naturally. Sign off as Aaron.
Return ONLY the email body. No subject line, no preamble.`;
  }
  return `You are helping Aaron write a reply to a recruiter or contact.

Company: ${co}
Contact: ${who}
Their message: ${bodySnippet || '(context not available)'}${notesCtx}

Write a short, natural reply (2–4 sentences). Conversational. Sign off as Aaron.
Return ONLY the email body. No subject line, no preamble.`;
}

// ─── Hunter API helper ────────────────────────────────────────────────────────

async function hunterFindEmail({ domain, firstName, lastName }) {
  const key = process.env.HUNTER_KEY;
  if (!key) throw new Error('HUNTER_KEY not configured');

  const hasName = firstName && lastName;

  if (hasName) {
    // Mode B: name provided — use email-finder endpoint (returns single best match)
    const url = new URL('https://api.hunter.io/v2/email-finder');
    url.searchParams.set('domain',     domain);
    url.searchParams.set('first_name', firstName);
    url.searchParams.set('last_name',  lastName);
    url.searchParams.set('api_key',    key);

    const res  = await fetch(url.toString());
    const data = await res.json();

    if (!data?.data?.email) return { ok: false, reason: 'no_candidates' };
    return {
      ok: true,
      results: [{ email: data.data.email, confidence: data.data.score ?? 0 }],
    };
  }

  // Mode A: no name — use domain-search endpoint (returns multiple contacts)
  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('domain',  domain);
  url.searchParams.set('limit',   '5');
  url.searchParams.set('api_key', key);

  const res  = await fetch(url.toString());
  const data = await res.json();

  const emails = data?.data?.emails ?? [];
  if (emails.length === 0) return { ok: false, reason: 'no_candidates' };

  return {
    ok: true,
    results: emails.map(e => ({ email: e.value, confidence: e.confidence ?? 0 })),
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /find-email
router.post('/find-email', async (req, res, next) => {
  const hunterKey = process.env.HUNTER_KEY;
  if (!hunterKey) {
    return res.status(500).json({ ok: false, error: 'Hunter API key not configured on server.' });
  }

  const parsed = FindEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }

  const { company, domain, firstName, lastName } = parsed.data;

  // domain is required — the extension always passes it (selected from suggest-domains)
  if (!domain) {
    return res.status(400).json({ ok: false, reason: 'no_domain' });
  }

  try {
    const result = await hunterFindEmail({ domain, firstName, lastName });
    if (result.ok) await req.incrementQuota();
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

// POST /suggest-domains (DNS-based, no change)
router.post('/suggest-domains', async (req, res) => {
  const parsed = SuggestDomainsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues.map(i => i.message).join('; '), statusCode: 400 });
  const { company } = parsed.data;

  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return res.status(400).json({ error: 'Validation Error', message: 'company resolves to empty slug', statusCode: 400 });

  const TLDS = ['.com', '.io', '.ai', '.co', '.net', '.org', '.app', '.dev', '.so', '.gg'];
  const results = await Promise.allSettled(
    TLDS.map(tld => slug + tld).map(async (domain) => {
      const [mx, a] = await Promise.allSettled([
        dns.promises.resolveMx(domain),
        dns.promises.resolve4(domain),
      ]);
      return {
        domain,
        hasMX: mx.status === 'fulfilled' && mx.value.length > 0,
        hasA:  a.status  === 'fulfilled' && a.value.length  > 0,
      };
    })
  );

  const domains = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(d => d.hasMX || d.hasA)
    .sort((a, b) => (b.hasMX - a.hasMX) || (b.hasA - a.hasA));

  res.json({ ok: true, domains });
});

// POST /draft-email (Gemini — unchanged)
router.post('/draft-email', async (req, res, next) => {
  const geminiKey = process.env.GEMINI_KEY;
  if (!geminiKey) return res.status(500).json({ ok: false, error: 'Gemini API key not configured on server.' });
  const parsed = DraftEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues.map(i => i.message).join('; '), statusCode: 400 });
  try {
    const prompt = buildDraftPrompt(parsed.data);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const gemRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!gemRes.ok) {
      const body = await gemRes.text();
      return res.status(502).json({ ok: false, error: `Gemini API error ${gemRes.status}: ${body.slice(0, 120)}` });
    }
    const data = await gemRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    res.json({ ok: true, text });
  } catch (e) {
    next(e);
  }
});

export default router;
```

**Step 2: Delete emailFinder.js**

```bash
rm server/emailFinder.js
```

**Step 3: Run tests — verify they pass**

```bash
cd server
npm test -- email.test.js
```

Expected: all tests pass.

**Step 4: Run full test suite to confirm nothing else broke**

```bash
cd server
npm test
```

Expected: all tests pass. (checkQuota tests should also pass now since the route exists.)

**Step 5: Commit**

```bash
git add server/routes/email.js
git rm server/emailFinder.js
git commit -m "feat(server): replace Gemini+SMTP email finder with Hunter.io API"
```

---

## Task 6: Wire checkQuota into app.js + Add HUNTER_KEY to .env.example

**Files:**
- Modify: `server/app.js`
- Modify: `server/.env.example`

**Step 1: Add checkQuota import and wire it into app.js**

In `server/app.js`, add the import after the existing middleware imports:

```js
import checkQuota from './middleware/checkQuota.js';
```

Then change the `/api/find-email` rate limit line to also include `checkQuota`:

```js
app.use('/api/find-email',      expensiveRateLimit, checkQuota);
```

The full route mounts block becomes:

```js
// ─── Route mounts ─────────────────────────────────────────────────────────────

app.use('/api/outreach',        outreachRoutes);
app.use('/',                    trackingRoutes);
app.use('/api/find-email',      expensiveRateLimit, checkQuota);
app.use('/api/suggest-domains', expensiveRateLimit);
app.use('/api/draft-email',     expensiveRateLimit);
app.use('/api',                 emailRoutes);
app.use('/api/insights',        analyticsRoutes);
```

**Step 2: Add HUNTER_KEY to .env.example**

In `server/.env.example`, add after the `GEMINI_KEY` line:

```
# Hunter.io email finder API key — https://hunter.io/api-keys
HUNTER_KEY=
```

**Step 3: Restart server and verify /health returns 200**

```bash
curl http://localhost:3001/health
```

Expected: `{"status":"ok",...}`

**Step 4: Commit**

```bash
git add server/app.js server/.env.example
git commit -m "feat(server): wire checkQuota middleware and add HUNTER_KEY to env.example"
```

---

## Task 7: Session Persistence — Find Contacts in compose-widget.js

**Files:**
- Modify: `extension/compose-widget.js`

**Context:** `chrome.storage.session` persists across widget open/close within the same browser session. It's cleared when the browser closes. No test framework exists for extension JS — verify manually.

**Step 1: Add restore-on-open logic**

In `setupFindTab` in `compose-widget.js`, find the block after all event listeners are registered (around line 988, end of `setupFindTab`). Add a session restore call:

```js
// Restore last session state
chrome.storage.session.get(['reach_find_state', 'reach_find_results'], function(data) {
  if (data.reach_find_state) {
    var s = data.reach_find_state;
    if (s.domain) {
      searchInput.value = s.domain;
      _cpSelectedDomain = s.domain;
      clearBtn.style.display = '';
      _cpSetFavicon(searchFavicon, s.domain, s.domain);
    }
    if (s.firstName) shadow.getElementById('cp-first-name').value = s.firstName;
    if (s.lastName)  shadow.getElementById('cp-last-name').value  = s.lastName;
  }
  if (data.reach_find_results && data.reach_find_results.results) {
    _cpRenderResults(shadow, data.reach_find_results.results);
  }
});
```

**Step 2: Extract result rendering into a helper function `_cpRenderResults`**

Before the `setupFindTab` function, add:

```js
function _cpRenderResults(shadow, results) {
  var resultsEl = shadow.getElementById('cp-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = results.map(function(r, i) {
    return '<div class="result-row" data-idx="' + i + '">'
      + '<span class="result-email">' + _cpEscapeHtml(r.email) + '</span>'
      + '<span class="result-score">' + r.confidence + '%</span>'
      + '<button class="copy-btn" data-email="' + _cpEscapeHtml(r.email) + '">Copy</button>'
      + '</div>';
  }).join('');
  resultsEl.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(btn.dataset.email).then(function() {
        btn.textContent = 'Copied!'; btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      }).catch(function() {
        btn.textContent = 'Failed';
        setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
      });
    });
  });
}
```

**Step 3: Save state on Find Emails click + use helper for rendering**

In the `FIND_CONTACT` sendMessage callback (around line 945), replace the result rendering block with:

```js
chrome.runtime.sendMessage(msg, function(res) {
  findBtn.disabled    = false;
  findBtn.textContent = 'Find Emails';
  if (chrome.runtime.lastError) {
    resultsEl.innerHTML = '<div class="status-msg">Error \u2014 check extension console.</div>';
    return;
  }
  if (res && res.ok && res.results && res.results.length) {
    _cpRenderResults(shadow, res.results);
    // Persist results and inputs for session restore
    chrome.storage.session.set({
      reach_find_state:   { domain: company, firstName: firstName, lastName: lastName },
      reach_find_results: { results: res.results },
    });
  } else if (res && res.error === 'quota_exceeded') {
    resultsEl.innerHTML = '<div class="status-msg">Monthly lookup limit reached ('
      + res.used + '/' + res.limit + '). Upgrade to find more contacts.</div>';
  } else if (!res || !res.ok) {
    var msgs = {
      no_domain:     'Could not resolve a domain for this company.',
      no_mx:         'No mail server found for this domain.',
      no_candidates: 'No emails found for this company. Try adding a first and last name.',
      all_invalid:   'Unable to find email for this person/company.',
    };
    resultsEl.innerHTML = '<div class="status-msg">'
      + _cpEscapeHtml(msgs[res && res.reason] || 'Unable to find email.') + '</div>';
  } else {
    resultsEl.innerHTML = '<div class="status-msg">No results found.</div>';
  }
});
```

**Step 4: Clear session on search box clear (×)**

In the clear button click handler (search for `_cpResetSelection`), add after the existing reset logic:

```js
chrome.storage.session.remove(['reach_find_state', 'reach_find_results']);
```

**Step 5: Update CSS — remove badge/source styles, fix email wrapping**

In the `PANEL_STYLES` string, find and update `.result-email`:

```css
.result-email {
  flex: 1; font-size: 12px; color: #1c1917;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  word-break: break-all;
}
```

Remove the `.result-status` and `.result-source` CSS rules entirely (lines 434–439).

**Step 6: Manual verification**

1. Open Gmail → open compose → click Reach widget → go to Find Contacts
2. Search for a domain + name → confirm results show: `email  65%  [Copy]` with no badges
3. Close widget → reopen → confirm inputs and results are restored
4. Click × → confirm results clear
5. Close and reopen → confirm cleared state is not restored

**Step 7: Commit**

```bash
git add extension/compose-widget.js
git commit -m "feat(extension): session persistence and simplified result display for Find Contacts"
```

---

## Task 8: Session Persistence — Draft AI in compose-widget.js

**Files:**
- Modify: `extension/compose-widget.js`

**Step 1: Save draft text after generation**

In `setupDraftTab`, in the `DRAFT_EMAIL` sendMessage callback (around line 1047), after `textarea.value = res.text;` add:

```js
chrome.storage.session.set({ reach_draft_state: { text: res.text } });
```

**Step 2: Restore draft text on open**

At the end of `setupDraftTab`, before `return prefillDraftTab;`, add:

```js
// Restore draft from session if present
chrome.storage.session.get('reach_draft_state', function(data) {
  if (data.reach_draft_state?.text) {
    shadow.getElementById('cp-draft-output').value = data.reach_draft_state.text;
  }
});
```

**Step 3: Manual verification**

1. Generate a draft → note the text
2. Close widget → reopen → go to Draft AI → confirm draft text is restored
3. Generate a new draft → confirm it overwrites and the new text persists

**Step 4: Commit**

```bash
git add extension/compose-widget.js
git commit -m "feat(extension): persist draft AI output across widget sessions"
```

---

## Task 9: Handle quota_exceeded in background.js

**Files:**
- Modify: `extension/background.js`

**Context:** The server returns `429 { error: 'quota_exceeded', used, limit }` but `serverFetch` returns a `Response` object. The `FIND_CONTACT` handler needs to pass the error body through to the extension UI.

**Step 1: Update the FIND_CONTACT handler**

Find the `FIND_CONTACT` block in `extension/background.js` (~line 170) and replace it:

```js
if (message.type === 'FIND_CONTACT') {
  (async () => {
    try {
      const res  = await serverFetch('/find-email', {
        method: 'POST',
        body: JSON.stringify({
          company:   message.company,
          firstName: message.firstName || undefined,
          lastName:  message.lastName  || undefined,
          domain:    message.domain    || undefined,
        }),
      });
      const body = await res.json();
      if (res.status === 429) {
        sendResponse({ ok: false, error: 'quota_exceeded', used: body.used, limit: body.limit });
      } else {
        sendResponse(body);
      }
    } catch (e) {
      log.error('/api/find-email fetch failed:', e.message);
      sendResponse({ ok: false, reason: 'all_invalid' });
    }
  })();
  return true;
}
```

**Step 2: Manual verification**

Set `lookupsUsedThisMonth` to the plan limit in the DB, then try a lookup — confirm the extension shows the quota exceeded message.

```sql
-- In psql or Neon console:
UPDATE "User" SET "lookupsUsedThisMonth" = 50 WHERE email = 'your@email.com';
```

**Step 3: Commit**

```bash
git add extension/background.js
git commit -m "feat(extension): surface quota_exceeded error from server in Find Contacts UI"
```

---

## Manual Smoke Test Checklist

After all tasks complete, verify end-to-end:

- [ ] `GET /health` returns 200
- [ ] Find Contacts with domain only (Mode A) → Hunter domain-search called, results shown without badges
- [ ] Find Contacts with name + domain (Mode B) → Hunter email-finder called, single result
- [ ] Results persist after closing and reopening widget
- [ ] Draft AI output persists after closing and reopening widget
- [ ] Quota exceeded → clear UI message shown (not a crash or blank)
- [ ] Suggest domains still works (DNS, no Hunter call)
- [ ] Draft AI still works (Gemini, unchanged)
- [ ] `npm test` in server/ passes all suites
