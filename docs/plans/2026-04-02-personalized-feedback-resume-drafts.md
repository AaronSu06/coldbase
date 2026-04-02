# Personalized Feedback + Resume Drafts + Pro Gate Redirect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Wire the user's stored `resumeText` into AI feedback and draft prompts, and redirect non-pro users from "View Personalized Feedback" to the upgrade modal instead of showing an inline error.

**Architecture:** Add `resumeText` to `/auth/me` response (capped at 3000 chars) so the web app can access it. Update backend `/api/feedback` to fetch and inject `resumeText` into the Gemini prompt. Update `lib/gemini.js` client-side draft functions to accept and use `resumeText`. Lift `ProModal` to `App.jsx` with a `handleUpgradePrompt` callback that closes the sidebar, navigates home, and opens the modal.

**Tech Stack:** Node.js/Express backend, Prisma ORM, React 18 + Vite frontend, React Router v7, Node built-in test runner (`node:test`), Google Gemini 2.5 Flash API.

---

### Task 1: Expose `resumeText` in `/auth/me`

**Files:**
- Modify: `server/routes/auth.js:82-91`
- Test: `server/auth.test.js` (add to existing `GET /api/auth/me` describe block)

**Step 1: Write the failing test**

Add this test inside the `describe('GET /api/auth/me', ...)` block in `server/auth.test.js` (after the existing three tests, before the closing `});`):

```js
it('includes resumeText (null when none set)', async () => {
  const res = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${token}` });
  assert.equal(res.status, 200);
  assert.ok(Object.hasOwn(res.body, 'resumeText'), 'resumeText field should be present');
  assert.equal(res.body.resumeText, null);
});
```

**Step 2: Run test to confirm it fails**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test server/auth.test.js 2>&1 | grep -A 3 "resumeText"
```

Expected: `AssertionError` — `resumeText field should be present`

**Step 3: Implement the change**

In `server/routes/auth.js` line 84, update the `select` clause and post-process `resumeText`:

```js
// Before (line 82-90):
const user = await prisma.user.findUnique({
  where: { id: req.user.userId },
  select: { id: true, email: true, plan: true, isAdmin: true, resumeName: true, createdAt: true },
});
if (!user) return res.status(404).json({ error: 'Not Found' });
res.json(user);

// After:
const user = await prisma.user.findUnique({
  where: { id: req.user.userId },
  select: { id: true, email: true, plan: true, isAdmin: true, resumeName: true, resumeText: true, createdAt: true },
});
if (!user) return res.status(404).json({ error: 'Not Found' });
res.json({
  ...user,
  resumeText: user.resumeText ? user.resumeText.slice(0, 3000) : null,
});
```

**Step 4: Run test to confirm it passes**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test server/auth.test.js 2>&1 | tail -5
```

Expected: all tests pass, no failures.

**Step 5: Commit**

```bash
cd /Users/aaron/Documents/GitHub/reach
git add server/routes/auth.js server/auth.test.js
git commit -m "feat: expose resumeText in /auth/me response (capped at 3000 chars)"
```

---

### Task 2: Add resume context to `/api/feedback` prompt

**Files:**
- Modify: `server/routes/email.js:228-270`
- Test: `server/email.test.js` (new `describe('POST /api/feedback', ...)` block)

**Step 1: Write the failing tests**

Append to `server/email.test.js`. Note the test user starts with `plan: 'basic'` — we'll upgrade it to `'pro'` and set a `resumeText` for specific tests:

```js
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
    // Update pro user to have no resumeText
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
```

**Step 2: Run to confirm failures**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test server/email.test.js 2>&1 | grep -E "FAIL|feedback"
```

Expected: `POST /api/feedback` tests fail (route doesn't include resume yet, snippet truncation wrong).

**Step 3: Implement the change**

In `server/routes/email.js`, update the `POST /feedback` handler (lines 216-273):

1. Change the user `select` at line 230 to include `resumeText`:
```js
// Before:
select: { plan: true, isAdmin: true },

// After:
select: { plan: true, isAdmin: true, resumeText: true },
```

2. Build a `resumeCtx` block and expand snippet slice from `1200` → `2000` (lines 236-248):
```js
// Before (lines 235-248):
const { company, contactName, subject, status, sentDate, snippet, notes } = parsed.data;
const daysSince = sentDate ? Math.floor((Date.now() - new Date(sentDate).getTime()) / 86_400_000) : 0;
const threadCtx = snippet
  ? `\nConversation (format: [OUT] = sent by candidate, [IN] = received):\n${snippet.slice(0, 1200)}`
  : '';
const notesCtx = notes ? `\nCandidate notes: ${notes}` : '';
const prompt = `You are an expert career coach reviewing a job outreach email thread.

Context:
- Company: ${company || 'the company'}
- Contact: ${contactName || 'the recruiter'}
- Subject: ${subject || ''}
- Status: ${status || 'Sent'}
- Days since sent: ${daysSince}${threadCtx}${notesCtx}

Provide concise, specific feedback in four labeled sections:
1. What the candidate did well (1-2 sentences)
2. What to improve (1-2 sentences, specific)
3. Tone assessment (1 sentence)
4. Suggested next move given the current status (1-2 sentences)

Be direct and actionable. No filler phrases.`;

// After:
const { company, contactName, subject, status, sentDate, snippet, notes } = parsed.data;
const daysSince = sentDate ? Math.floor((Date.now() - new Date(sentDate).getTime()) / 86_400_000) : 0;
const resumeCtx = user.resumeText
  ? `\nCandidate background:\n${user.resumeText.slice(0, 3000)}`
  : '';
const threadCtx = snippet
  ? `\nConversation (format: [OUT] = sent by candidate, [IN] = received):\n${snippet.slice(0, 2000)}`
  : '';
const notesCtx = notes ? `\nCandidate notes: ${notes}` : '';
const prompt = `You are an expert career coach reviewing a job outreach email thread.
${resumeCtx}
Context:
- Company: ${company || 'the company'}
- Contact: ${contactName || 'the recruiter'}
- Subject: ${subject || ''}
- Status: ${status || 'Sent'}
- Days since sent: ${daysSince}${threadCtx}${notesCtx}

Provide concise, specific feedback in four labeled sections:
1. What the candidate did well (1-2 sentences)
2. What to improve (1-2 sentences, specific)
3. Tone assessment (1 sentence)
4. Suggested next move given the current status (1-2 sentences)

Be direct and actionable. No filler phrases.`;
```

**Step 4: Run tests to confirm they pass**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test server/email.test.js 2>&1 | tail -10
```

Expected: all tests pass.

**Step 5: Commit**

```bash
cd /Users/aaron/Documents/GitHub/reach
git add server/routes/email.js server/email.test.js
git commit -m "feat: personalize /api/feedback with resume context and full snippet (2000 chars)"
```

---

### Task 3: Add `resumeText` param to `lib/gemini.js` draft functions

No test framework exists for the web app; verify manually after wiring in Task 4.

**Files:**
- Modify: `web/src/lib/gemini.js`

**Step 1: Update all four exported functions**

Replace the entire file content of `web/src/lib/gemini.js` with:

```js
import { getDaysSince } from './utils';

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

async function callGemini(prompt) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

export function getRecommendedAction(record) {
  if (record?.status === 'Interviewing') return 'interview-followup';
  if (record?.hasReply) return 'reply';
  return 'bump'; // covers Sent, Ghosted, no-reply
}

export async function draftBump(record, resumeText) {
  const daysSince = getDaysSince(record.sentDate);
  const isGhosted = record.status === 'Ghosted';
  const notesCtx = record.notes ? `\nExtra context from notes: ${record.notes}` : '';
  const resumeCtx = resumeText ? `\nCandidate background:\n${resumeText.slice(0, 1500)}` : '';

  const prompt = `You are helping a candidate write a follow-up email for a software engineering internship cold outreach that received no reply.${resumeCtx}

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Original subject: ${record.subject}
- Days since first email: ${daysSince}
- Status: ${isGhosted ? 'Ghosted — this is a last-ditch check-in' : 'No reply yet'}${notesCtx}

Write a ${isGhosted ? 'brief, low-pressure final check-in (2 sentences max)' : 'short 2-3 sentence follow-up'}. Casual but professional. Don't open with "I hope this email finds you well." Reference the original email naturally. Sign off using the name from the resume if available, otherwise sign off naturally.

Return ONLY the email text (subject line + body). No preamble, commentary, or explanation.`;

  return callGemini(prompt);
}

function extractLastInboundMessage(snippet) {
  if (!snippet) return null;
  const parts = snippet.split('\n\n');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].startsWith('[IN]')) {
      const clean = parts[i].replace(/^\[IN\] /, '');
      const colonIdx = clean.indexOf(': ');
      return colonIdx > 0 ? clean.slice(colonIdx + 2).trim() : clean.trim();
    }
  }
  return null;
}

export async function draftReply(record, resumeText) {
  const lastMessage = extractLastInboundMessage(record.snippet);
  const notesCtx = record.notes ? `\nExtra context from notes: ${record.notes}` : '';
  const resumeCtx = resumeText ? `\nCandidate background:\n${resumeText.slice(0, 1500)}` : '';

  const prompt = `You are helping a candidate write a natural reply to a recruiter/contact who responded to their cold outreach for a software engineering internship.${resumeCtx}

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Original subject: ${record.subject}${lastMessage ? `\n- Their message: "${lastMessage}"` : ''}${notesCtx}

Write a short, natural reply (2-4 sentences) that directly responds to what they said. Conversational, not stiff. No buzzwords. Sign off using the name from the resume if available, otherwise sign off naturally.

Return ONLY the email text. No preamble, commentary, or explanation.`;

  return callGemini(prompt);
}

export async function draftInterviewFollowUp(record, resumeText) {
  const notesCtx = record.notes ? `\nExtra context from notes: ${record.notes}` : '';
  const resumeCtx = resumeText ? `\nCandidate background:\n${resumeText.slice(0, 1500)}` : '';

  const prompt = `You are helping a candidate write a thank-you / follow-up email after an interview or interview scheduling for a software engineering internship.${resumeCtx}

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the interviewer'}
- Original subject: ${record.subject}${notesCtx}

Write a concise 3-4 sentence follow-up. Thank them for their time, reaffirm enthusiasm, mention you're looking forward to next steps. Professional but warm. Sign off using the name from the resume if available, otherwise sign off naturally.

Return ONLY the email text. No preamble, commentary, or explanation.`;

  return callGemini(prompt);
}

export async function generateConversationFeedback(record, resumeText) {
  const notesCtx = record.notes ? `\nCandidate notes: ${record.notes}` : '';
  const resumeCtx = resumeText ? `\nCandidate background:\n${resumeText.slice(0, 3000)}` : '';
  const threadCtx = record.snippet
    ? `\nConversation (format: [OUT] = sent by candidate, [IN] = received):\n${record.snippet.slice(0, 2000)}`
    : '';
  const prompt = `You are an expert career coach reviewing a job outreach email thread.${resumeCtx}

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Subject: ${record.subject}
- Status: ${record.status}
- Days since sent: ${getDaysSince(record.sentDate)}${threadCtx}${notesCtx}

Provide concise, specific feedback in four labeled sections:
1. What the candidate did well (1-2 sentences)
2. What to improve (1-2 sentences, specific)
3. Tone assessment (1 sentence)
4. Suggested next move given the current status (1-2 sentences)

Be direct and actionable. No filler phrases.`;
  return callGemini(prompt);
}
```

**Step 2: Commit**

```bash
cd /Users/aaron/Documents/GitHub/reach
git add web/src/lib/gemini.js
git commit -m "feat: add resumeText param to all gemini.js draft/feedback functions"
```

---

### Task 4: Sidebar — non-pro gate calls `onUpgradePrompt`

**Files:**
- Modify: `web/src/components/Sidebar.jsx`

**Step 1: Accept `onUpgradePrompt` prop and update the non-pro gate**

There are two spots to change in `Sidebar.jsx`:

**Change A** — `handleFeedback` (around line 276-292). Replace the `setFeedbackError` non-pro path:
```js
// Before (lines 278-280):
if (!canUseFeedback) {
  setFeedbackError('Feedback AI is a Pro feature. Upgrade to use it.');
  return;
}

// After:
if (!canUseFeedback) {
  onUpgradePrompt?.();
  return;
}
```

**Change B** — the non-pro UI div (around line 679-682). Make it a clickable button:
```jsx
// Before:
<div className="w-full flex items-center justify-center gap-1.5 bg-chrome-deep text-chrome-muted text-[13px] font-medium px-4 py-2 rounded-md border border-chrome-rim cursor-not-allowed select-none">
  <GeminiIcon />
  ✦ Generate Feedback — Pro only
</div>

// After:
<button
  onClick={() => onUpgradePrompt?.()}
  className="w-full flex items-center justify-center gap-1.5 bg-chrome-deep text-chrome-muted text-[13px] font-medium px-4 py-2 rounded-md border border-chrome-rim hover:border-accent hover:text-accent transition-colors">
  <GeminiIcon />
  ✦ Generate Feedback — Upgrade to Pro
</button>
```

**Change C** — add `onUpgradePrompt` to the component's destructured props (the function signature around line 192):
```js
// Before:
}) {

// Find the props destructuring. It will look something like:
// function Sidebar({ record, onClose, onToggleFavorite, onToggleArchived, onDelete, onUpdateRecord, onStatusChange }) {

// After — add onUpgradePrompt:
// function Sidebar({ record, onClose, onToggleFavorite, onToggleArchived, onDelete, onUpdateRecord, onStatusChange, onUpgradePrompt }) {
```

**Step 2: Verify no regressions**

Open the dev server (`npm run dev` in `/Users/aaron/Documents/GitHub/reach/web`) and confirm:
- Pro users still see the working "Generate Feedback" button
- Free users see the "Upgrade to Pro" button (the `onUpgradePrompt` prop won't be wired yet until Task 5)

**Step 3: Commit**

```bash
cd /Users/aaron/Documents/GitHub/reach
git add web/src/components/Sidebar.jsx
git commit -m "feat: sidebar non-pro feedback gate calls onUpgradePrompt instead of inline error"
```

---

### Task 5: Lift ProModal to App.jsx + add `handleUpgradePrompt`

**Files:**
- Modify: `web/src/App.jsx`

**Step 1: Add ProModal import, state, handler, and wire to Sidebar + HomePage**

Open `web/src/App.jsx`. Make these additions:

**A. Add import** (after existing imports near top):
```js
import ProModal from './components/ProModal';
```

**B. Add state** (near other `useState` declarations around line 141-145):
```js
const [proModalOpen, setProModalOpen] = useState(false);
```

**C. Add handler** (near other handler functions, after `const navigate = useNavigate()`):
```js
function handleUpgradePrompt() {
  setSelectedThreadId(null);
  navigate('/');
  setProModalOpen(true);
}
```

**D. Render ProModal at app level** (just before the closing `</UserProvider>` tag, around line 616):
```jsx
{proModalOpen && <ProModal onClose={() => setProModalOpen(false)} />}
```

**E. Wire props to Sidebar** (around line 606-614, update the `<Sidebar>` usage):
```jsx
// Add onUpgradePrompt prop:
<Sidebar
  record={selectedRecord}
  onClose={() => setSelectedThreadId(null)}
  onToggleFavorite={toggleFavorite}
  onToggleArchived={toggleArchived}
  onDelete={deleteRecord}
  onUpdateRecord={updateRecord}
  onStatusChange={updateStatus}
  onUpgradePrompt={handleUpgradePrompt}
/>
```

**F. Wire props to HomePage** (around line 527, add `onOpenProModal` prop):
```jsx
<HomePage
  ...existing props...
  onOpenProModal={() => setProModalOpen(true)}
/>
```

**Step 2: Verify in browser**

- As free user: click "Generate Feedback — Upgrade to Pro" → sidebar closes, navigates to `/`, ProModal opens.
- As pro user: click "Generate Feedback" → generates normally, no redirect.

**Step 3: Commit**

```bash
cd /Users/aaron/Documents/GitHub/reach
git add web/src/App.jsx
git commit -m "feat: lift ProModal to App level with handleUpgradePrompt callback"
```

---

### Task 6: Update `HomePage.jsx` to use `onOpenProModal` prop

**Files:**
- Modify: `web/src/components/HomePage.jsx`

**Step 1: Update `UpgradeCard` to accept and use `onOpenProModal`**

In `web/src/components/HomePage.jsx`:

**A. Remove the `ProModal` import** (line 6 — no longer needed here):
```js
// Remove this line:
import ProModal from './ProModal';
```

**B. Update `UpgradeCard`** (lines 140-184). Remove its internal `open` state and inline `ProModal` render; accept `onOpenProModal` as a prop instead:

```jsx
// Before:
function UpgradeCard() {
  const [open, setOpen] = useState(false);
  // ... features list ...
  return (
    <>
      <ActionCard ...>
        // ...
        <button ... onClick={() => setOpen(true)}>Subscribe to Coldbase Pro</button>
      </ActionCard>
      {open && <ProModal onClose={() => setOpen(false)} />}
    </>
  );
}

// After:
function UpgradeCard({ onOpenProModal }) {
  // ... features list (unchanged) ...
  return (
    <ActionCard ...>
      // ...
      <button ... onClick={onOpenProModal}>Subscribe to Coldbase Pro</button>
    </ActionCard>
  );
}
```

**C. Update the `HomePage` component** (around line 242-245) to accept and pass down `onOpenProModal`:
```jsx
// In the HomePage function signature, add onOpenProModal prop.
// Where UpgradeCard is rendered, pass it:
<UpgradeCard onOpenProModal={onOpenProModal} />
```

**Step 2: Verify in browser**

- On the home page, click "Subscribe to Coldbase Pro" → ProModal opens (now managed by App).
- Close modal works.
- All other home page cards still render correctly.

**Step 3: Run full test suite**

```bash
cd /Users/aaron/Documents/GitHub/reach
npm test 2>&1 | tail -20
```

Expected: all existing tests pass, including the new auth + email tests from Tasks 1 and 2.

**Step 4: Commit**

```bash
cd /Users/aaron/Documents/GitHub/reach
git add web/src/components/HomePage.jsx
git commit -m "feat: move ProModal ownership to App, wire UpgradeCard via onOpenProModal prop"
```
