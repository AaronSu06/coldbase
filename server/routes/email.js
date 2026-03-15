import { Router } from 'express';
import dns from 'dns';
import { z } from 'zod';
import { findEmails } from '../emailFinder.js';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const FindEmailSchema = z.object({
  company: z.string().min(1),
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
  const co = company || 'the company';
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

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /find-email (expensiveRateLimit applied at mount time in index.js)
router.post('/find-email', async (req, res, next) => {
  const parsed = FindEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues.map(i => i.message).join('; '), statusCode: 400 });
  const { company, firstName, lastName, domain } = parsed.data;
  try {
    res.json(await findEmails({ company, firstName, lastName, domain }));
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
