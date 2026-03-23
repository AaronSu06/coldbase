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

// ─── Draft prompt builder ─────────────────────────────────────────────────────

function buildDraftPrompt({ draftType, company, contactName, subject, bodySnippet, notes, resumeText }) {
  const who = contactName || 'the recruiter';
  const co = company || 'the company';
  const notesCtx = notes ? `\nExtra context: ${notes}` : '';
  const resumeCtx = resumeText ? `\n\nSender's resume for context:\n${resumeText.slice(0, 3000)}` : '';
  if (draftType === 'cold') {
    return `You are helping a job seeker write a cold outreach email.${resumeCtx}

Company: ${co}
Contact: ${who}
Subject: ${subject || ''}${notesCtx}

Write a short, personalized cold email (3–4 sentences). Casual but professional. Sign off using the sender's name from the resume if available, otherwise sign off naturally.
Return ONLY the email body. No subject line, no preamble.`;
  }
  if (draftType === 'bump') {
    return `You are helping a job seeker write a brief follow-up to a cold outreach that got no reply.${resumeCtx}

Company: ${co}
Contact: ${who}
Original subject: ${subject || ''}${bodySnippet ? `\nOriginal email excerpt: ${bodySnippet.slice(0, 200)}` : ''}${notesCtx}

Write a short 2–3 sentence follow-up. Low pressure. Reference the original email naturally. Sign off using the sender's name from the resume if available, otherwise sign off naturally.
Return ONLY the email body. No subject line, no preamble.`;
  }
  return `You are helping a job seeker write a reply to a recruiter or contact.${resumeCtx}

Company: ${co}
Contact: ${who}
Their message: ${bodySnippet || '(context not available)'}${notesCtx}

Write a short, natural reply (2–4 sentences). Conversational. Sign off using the sender's name from the resume if available, otherwise sign off naturally.
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

// POST /find-email (expensiveRateLimit + checkQuota applied at mount time in app.js)
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

  const { domain, firstName, lastName } = parsed.data;

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
  const geminiKey = process.env.GEMINI_KEY;
  if (!geminiKey) return res.status(500).json({ ok: false, error: 'Gemini API key not configured on server.' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { plan: true, isAdmin: true },
    });
    if (!user || (!user.isAdmin && user.plan !== 'pro')) {
      return res.status(403).json({ ok: false, error: 'pro_required', message: 'Feedback AI is a Pro feature. Upgrade to use it.' });
    }
    const { company, contactName, subject, status, sentDate, snippet, notes } = req.body;
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
