import { Router } from 'express';
import dns from 'dns';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

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

const FeedbackSchema = z.object({
  threadId:    z.string().optional(),
  company:     z.string().max(200).optional(),
  contactName: z.string().max(200).optional(),
  subject:     z.string().max(500).optional(),
  status:      z.string().max(50).optional(),
  sentDate:    z.string().optional().refine(v => !v || !isNaN(Date.parse(v)), { message: 'sentDate must be a valid date string' }),
  snippet:     z.string().max(2000).optional(),
  notes:       z.string().max(1000).optional(),
});

// ─── Draft prompt builder ─────────────────────────────────────────────────────

function buildDraftPrompt({ draftType, company, contactName, subject, bodySnippet, notes, resumeText }) {
  const who = contactName || 'the recruiter';
  const co = company || 'the company';
  const notesCtx = notes ? `\nExtra context: ${notes}` : '';
  const resumeCtx = resumeText ? `\n\nSender's resume for context:\n${resumeText.slice(0, 3000)}` : '';
  const sharedRules = `
Rules you must follow:
- Never use em-dashes (—). Use commas, periods, or rewrite the sentence instead.
- No buzzwords: never write "passionate", "leverage", "excited about the opportunity", "reach out", "touch base", "synergy", "impactful", "circle back", "looking forward to connecting".
- Do not open with "I hope this email finds you well", "I wanted to reach out", or any cliche opener.
- Sound like a real person. Short sentences. No corporate stiffness.
- Sign off using the sender's name from the resume if available, otherwise sign off naturally.`;

  if (draftType === 'cold') {
    return `You are helping a job seeker write a cold outreach email. The best cold emails are short, specific, and human.${resumeCtx}

Company: ${co}
Contact: ${who}
Subject: ${subject || ''}${notesCtx}

Write a 3-4 sentence cold email. Lead with a specific, genuine reason for reaching out (a project, a product detail, something real). State what you bring in one sentence. End with a single, low-pressure ask - not "I would love to connect", but something concrete like asking if there is a good time to chat or if they have 15 minutes.
${sharedRules}
Return ONLY the email body. No subject line, no preamble.`;
  }
  if (draftType === 'bump') {
    return `You are helping a job seeker write a brief follow-up to a cold outreach that got no reply.${resumeCtx}

Company: ${co}
Contact: ${who}
Original subject: ${subject || ''}${bodySnippet ? `\nOriginal email excerpt: ${bodySnippet.slice(0, 200)}` : ''}${notesCtx}

Write a 1-2 sentence bump. The goal is to resurface the thread without pressure. A good bump sounds like: "Bumping this up in case it got buried." or "Still very interested if there's a good time to connect this week." Reference the original email in at most one clause.
${sharedRules}
Return ONLY the email body. No subject line, no preamble.`;
  }
  return `You are helping a job seeker write a reply to a recruiter or contact.${resumeCtx}

Company: ${co}
Contact: ${who}
Their message: ${bodySnippet || '(context not available)'}${notesCtx}

Write a 2-3 sentence reply. Answer their question or respond to their point first, before anything else. Mirror their tone - casual if they are casual. Do not open with "Thank you for getting back to me" as a standalone opener.
${sharedRules}
Return ONLY the email body. No subject line, no preamble.`;
}

// ─── Snov.io API helper ───────────────────────────────────────────────────────

let _snovToken = null;
let _snovTokenExpiry = 0;

async function getSnovToken() {
  if (_snovToken && Date.now() < _snovTokenExpiry) return _snovToken;
  const res = await fetch('https://api.snov.io/v1/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'client_credentials',
      client_id:     process.env.SNOV_CLIENT_ID,
      client_secret: process.env.SNOV_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  _snovToken = data.access_token;
  _snovTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _snovToken;
}

async function snovFindEmail({ domain, firstName, lastName }) {
  const token = await getSnovToken();
  const hasName = firstName && lastName;

  if (hasName) {
    // Email finder mode: name + domain → best matching email(s) for that person
    const res  = await fetch('https://api.snov.io/v2/email-finder', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ domain, firstName, lastName, access_token: token }),
    });
    const data = await res.json();
    const emails = data?.emails ?? [];
    if (emails.length === 0) return { ok: false, reason: 'no_candidates' };
    return { ok: true, results: emails.map(e => ({ email: e.email })) };
  }

  // Domain search mode: domain only → multiple contacts at the company
  const res  = await fetch('https://api.snov.io/v1/get-domain-emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ domain, access_token: token, type: 'personal', limit: 5 }),
  });
  const data = await res.json();
  const emails = data?.emails ?? [];
  if (emails.length === 0) return { ok: false, reason: 'no_candidates' };
  return { ok: true, results: emails.map(e => ({ email: e.email })) };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /find-email (expensiveRateLimit + checkQuota applied at mount time in app.js)
router.post('/find-email', async (req, res, next) => {
  if (!process.env.SNOV_CLIENT_ID || !process.env.SNOV_CLIENT_SECRET) {
    return res.status(500).json({ ok: false, error: 'Snov.io API credentials not configured on server.' });
  }

  const parsed = FindEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }

  const { domain, firstName, lastName } = parsed.data;

  if (!domain) {
    return res.status(400).json({ ok: false, reason: 'no_domain' });
  }

  try {
    const result = await snovFindEmail({ domain, firstName, lastName });
    if (result.ok) await req.incrementQuota();
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

// POST /suggest-domains (expensiveRateLimit applied at mount time in index.js)
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

// POST /draft-email (expensiveRateLimit applied at mount time in index.js)
router.post('/draft-email', async (req, res, next) => {
  const geminiKey = process.env.GEMINI_KEY;
  if (!geminiKey) return res.status(500).json({ ok: false, error: 'Gemini API key not configured on server.' });
  const parsed = DraftEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues.map(i => i.message).join('; '), statusCode: 400 });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { plan: true, isAdmin: true, resumeText: true },
    });
    if (!user || (!user.isAdmin && user.plan !== 'pro')) {
      return res.status(403).json({ ok: false, error: 'pro_required', message: 'Draft AI is a Pro feature. Upgrade to use it.' });
    }
    const prompt = buildDraftPrompt({ ...parsed.data, resumeText: user.resumeText });
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

// POST /feedback — AI conversation feedback (pro + admin only)
router.post('/feedback', async (req, res, next) => {
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { plan: true, isAdmin: true, resumeText: true },
    });
    if (!user || (!user.isAdmin && user.plan !== 'pro')) {
      return res.status(403).json({ ok: false, error: 'pro_required', message: 'Feedback AI is a Pro feature. Upgrade to use it.' });
    }
    const geminiKey = process.env.GEMINI_KEY;
    if (!geminiKey) return res.status(500).json({ ok: false, error: 'Gemini API key not configured on server.' });
    const { threadId, company, contactName, subject, status, sentDate, snippet, notes } = parsed.data;
    const daysSince = sentDate ? Math.floor((Date.now() - new Date(sentDate).getTime()) / 86_400_000) : 0;
    const resumeCtx = user.resumeText
      ? `\nCandidate background:\n${user.resumeText.slice(0, 3000)}`
      : '';
    const threadCtx = snippet
      ? `\nConversation (format: [OUT] = sent by candidate, [IN] = received):\n${snippet.slice(0, 2000)}`
      : '';
    const notesCtx = notes ? `\nCandidate notes: ${notes}` : '';
    const prompt = `You are an expert career coach reviewing a job outreach email thread. You specialize in cold email and have strong opinions about what works.
${resumeCtx}
Context:
- Company: ${company || 'the company'}
- Contact: ${contactName || 'the recruiter'}
- Subject: ${subject || ''}
- Status: ${status || 'Sent'}
- Days since sent: ${daysSince}${threadCtx}${notesCtx}

Provide concise, specific feedback in four sections using this exact markdown format:

#### What the candidate did well
1-2 sentences.

#### What to improve
1-2 sentences, specific. Call out any buzzwords, cliches, em-dashes, or AI-sounding phrases in the email if present (e.g. "passionate", "leverage", "synergy", "impactful", "touch base", "circle back", em-dashes used as separators).

#### Tone assessment
1 sentence.

#### Suggested next move
1-2 sentences given the current status.

Your feedback must follow these rules:
- Never use em-dashes (—) in your response. Use commas or periods instead.
- Be direct and actionable. No filler phrases.
- Write like a real person talking to someone, not a formal report.`;
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
    if (threadId) {
      await prisma.outreach.updateMany({
        where: { threadId, userId: req.user.userId },
        data: { feedbackText: text },
      });
    }
    res.json({ ok: true, text });
  } catch (e) {
    next(e);
  }
});

export default router;
