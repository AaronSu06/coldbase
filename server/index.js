import 'dotenv/config';
import dns from 'dns';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { findEmails } from './emailFinder.js';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// ─── Secret validation middleware ─────────────────────────────────────────────

function requireSecret(req, res, next) {
  const secret = process.env.REACH_SECRET;
  if (secret && req.headers['x-reach-secret'] !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// GET /api/outreach — list all records ordered by sentDate desc
app.get('/api/outreach', async (req, res) => {
  try {
    const records = await prisma.outreach.findMany({
      orderBy: { sentDate: 'desc' }
    });
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/outreach — create record; 409 if threadId already exists
app.post('/api/outreach', async (req, res) => {
  try {
    const record = await prisma.outreach.create({ data: req.body });
    res.status(201).json(record);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'threadId already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/outreach/:threadId — partial update
app.patch('/api/outreach/:threadId', async (req, res) => {
  try {
    const record = await prisma.outreach.update({
      where: { threadId: req.params.threadId },
      data: req.body
    });
    res.json(record);
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/outreach/:threadId — delete
app.delete('/api/outreach/:threadId', async (req, res) => {
  try {
    await prisma.outreach.delete({ where: { threadId: req.params.threadId } });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/find-email', requireSecret, async (req, res) => {
  const { company, firstName, lastName, domain } = req.body;
  if (!company) return res.status(400).json({ ok: false, reason: 'no_domain' });
  try {
    res.json(await findEmails({ company, firstName, lastName, domain }));
  } catch (e) {
    console.error('[Reach] /api/find-email error:', e.message);
    res.status(500).json({ ok: false, reason: 'all_invalid' });
  }
});

app.post('/api/suggest-domains', requireSecret, async (req, res) => {
  const { company } = req.body;
  if (!company) return res.status(400).json({ ok: false });

  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return res.status(400).json({ ok: false });

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

app.post('/api/draft-email', requireSecret, async (req, res) => {
  const geminiKey = process.env.GEMINI_KEY;
  if (!geminiKey) {
    return res.status(500).json({ ok: false, error: 'Gemini API key not configured on server.' });
  }
  try {
    const prompt = buildDraftPrompt(req.body);
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
    console.error('[Reach] /api/draft-email error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Reach server] Listening on http://localhost:${PORT}`);
});
