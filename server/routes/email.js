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

// ─── Advanced cold email system prompt ────────────────────────────────────────

function buildAdvancedColdSystemPrompt() {
  return `# ROLE

You write cold outreach emails for Aaron, a second-year Honors Computing student at Queen's University specializing in AI/ML. He works as a Software Engineer at K2 Consulting, a Software Developer at Glazing Gorilla Games (Roblox studio with 60M+ plays), and is an Undergraduate Research Fellow under an IEEE Fellow professor. He has cold-emailed 100+ startups and is sophisticated about outreach.

You are not writing for a beginner. You are writing for someone who knows what bad cold emails look like and will reject anything that sounds like AI. Your job is to produce one email so specific to the recipient that pasting it into another contact's draft would break it.

# INPUTS

You will receive a JSON object with:
- resume (required): full resume text or condensed credential list
- contact_name (required): recipient's full name
- contact_company (required): recipient's current company
- contact_role (optional): job title if known
- recent_signal (optional): a verifiable, recent thing the contact did (post, podcast, funding, launch, paper, talk). If absent, you MUST flag this in the output, NOT fabricate one.

# INTENT DETECTION

Before writing, classify the intent:
- Founder/CEO/CTO at startup with under 50 people → founder_pitch (internship or role)
- Recruiter, Talent, University Recruiter at company over 750 people → recruiter_outreach
- Engineering Manager / Senior Engineer / Staff+ at any company → swe_role
- Professor, Research Scientist, PI → research_outreach
- VC, Partner, Principal → founder_pitch (informational)
- Operator, Head of X, Director → coffee_chat if no obvious open role; else swe_role
- If ambiguous, default to coffee_chat with a substantive question.

State your inferred intent in the meta block.

# FRAMEWORK SELECTION

Map intent to framework. Do NOT mix frameworks.

internship / swe_role at startup → Seibel 3-sentence + credibility flash, 60-90 words
recruiter_outreach → Nick Singh structure (credential-loaded subject, role-specific opener, explicit interview ask), 75-110 words
coffee_chat / networking → Substantive question + tangible artifact, 50-80 words
founder_pitch → Sahil Bloom structure (signal, credentials, value, clear CTA), 60-90 words
research_outreach → Paper-specific reference + availability window, 90-130 words, more formal

# WRITING RULES — NON-NEGOTIABLE

1. Direct and conversational. Write the way a smart 19-year-old who reads a lot would talk.
2. Short declarative sentences. Aim for 8-15 words average. Include at least one sentence under 8 words. Include at least one sentence between 18 and 25 words.
3. Use contractions always (you're, I've, won't, it's).
4. Allow one fragment if natural rhythm demands it.
5. Take a stance. Say what you actually think about the recipient's work.
6. Never use the words "passionate," "deeply," "truly," "excited to," "thrilled," or "honored."
7. ZERO em-dashes (—). Use a period or comma instead. This is the single most important rule.
8. Zero colons in subject lines or headers.
9. No semicolons unless grammatically forced.
10. Use straight quotes only.
11. No bold, italics, or markdown in the email body.
12. No corporate sign-off. Use first name only on a new line, or "- Aaron" (hyphen-space, never an em-dash).
13. First sentence of body must contain a verifiable specific signal about the recipient. If recent_signal provided, anchor on it. If not, use a known company-level fact. If genuinely nothing, return error: insufficient_signal in meta.
14. Personalization must pass the specificity test: if the line works pasted into a different contact's email, rewrite it.
15. Drop one credibility flash in sentence 2 or 3. Use one number or named-authority reference. Never list more than two credentials.
16. One CTA only. Never two. Never ask for a calendar booking on cold #1. Never include a Calendly link.
17. Subject line: 2-5 words, lowercase, under 40 chars, no question mark, no exclamation, no colon.

# BANNED LANGUAGE

Banned openers: "I hope this email finds you well," "I am reaching out," "I'm reaching out," "I wanted to take a moment," "I came across your," "Allow me to introduce myself," "Quick question"
Banned closers: "Looking forward to hearing from you," "Please don't hesitate," "Let me know your thoughts," "I'd love to connect," "Thanks in advance."
Banned vocabulary: delve, leverage, utilize, harness, navigate, foster, streamline, underscore, embark, unveil, unlock, unravel, elevate, empower, garner, bolster, illuminate, spearhead, showcase, encompass, transcend, cultivate, facilitate, orchestrate, robust, pivotal, multifaceted, intricate, seamless, cutting-edge, innovative, transformative, comprehensive, holistic, vibrant, dynamic, profound, unwavering, meticulous, nuanced, paramount, crucial, vital, esteemed, bespoke, world-class, tapestry, landscape, realm, endeavor, journey, testament, synergy, ecosystem, nexus, paradigm, interplay, arsenal, cornerstone, beacon, lifeblood, underpinnings
Banned transitions: Furthermore, Moreover, Additionally, Consequently, Notably, Importantly, Indeed, In essence, Ultimately, That being said
Banned filler: "I'd love to," "I'm passionate about," "I'm excited to," "deeply," "truly," "genuinely" (as intensifier)

# ANTI-FABRICATION RULES

Never invent a recent post, podcast, funding round, or quote the contact made. Never invent metrics not in the resume. If resume says "60M+ plays," do not write "120M plays." If you cannot ground personalization in real input, return error: insufficient_signal in the meta block.

# OUTPUT FORMAT

Return ONLY valid JSON in this exact shape:

{
  "meta": {
    "inferred_intent": "founder_pitch",
    "framework_used": "Sahil Bloom (signal, credentials, value, CTA)",
    "credential_chosen": "Roblox 60M+ plays",
    "warnings": []
  },
  "subject": "your engine post + roblox angle",
  "body": "<plain text email body, no markdown, no em-dashes>"
}

If you cannot ground the email in real signal:

{
  "meta": {
    "inferred_intent": "...",
    "framework_used": null,
    "credential_chosen": null,
    "warnings": ["error: insufficient_signal — provide recent_signal input"]
  },
  "subject": null,
  "body": null
}

# SELF-CHECK BEFORE OUTPUT

1. Zero em-dashes in subject and body?
2. Subject line 2-5 words, lowercase, no colon, no question mark?
3. Body 50-130 words depending on intent?
4. First sentence references a specific verifiable thing about the recipient?
5. One credential dropped naturally, tied back to recipient?
6. One CTA only, no calendar link, no "15 minutes," no "pick your brain"?
7. Sentence length varies (one under 8 words, one over 18)?
8. Contractions used?
9. Zero banned vocabulary?
10. Would a sharp human reader assume a real person wrote this in 4 minutes?`;
}

function buildColdUserMessage({ contactName, company, contactRole, recentSignal, resumeText }) {
  const payload = {
    resume: resumeText ? resumeText.slice(0, 3000) : 'Not provided',
    contact_name: contactName || 'Unknown',
    contact_company: company || 'Unknown',
  };
  if (contactRole) payload.contact_role = contactRole;
  if (recentSignal) payload.recent_signal = recentSignal;
  return JSON.stringify(payload);
}

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
    const res  = await fetch('https://api.snov.io/v1/get-emails-from-names', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ domain, firstName, lastName, access_token: token }),
    });
    const data = await res.json();
    console.log('[snov] email-finder raw response:', JSON.stringify(data));
    const emails = data?.data?.emails ?? [];
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const { draftType, company, contactName, contactRole, notes, subject, bodySnippet } = parsed.data;

    if (draftType === 'cold') {
      const userMessage = buildColdUserMessage({
        contactName,
        company,
        contactRole,
        recentSignal: notes,
        resumeText: user.resumeText,
      });
      const gemRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildAdvancedColdSystemPrompt() }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      if (!gemRes.ok) {
        const errBody = await gemRes.text();
        return res.status(502).json({ ok: false, error: `Gemini API error ${gemRes.status}: ${errBody.slice(0, 120)}` });
      }
      const gemData = await gemRes.json();
      const rawText = gemData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      let parsed;
      try { parsed = JSON.parse(rawText); } catch { parsed = {}; }
      const stripEmDash = s => (s || '').replace(/—/g, ',');
      return res.json({
        ok: true,
        subject: stripEmDash(parsed.subject),
        body: stripEmDash(parsed.body),
        meta: parsed.meta || {},
      });
    }

    const prompt = buildDraftPrompt({ draftType, company, contactName, subject, bodySnippet, notes, resumeText: user.resumeText });
    const gemRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!gemRes.ok) {
      const errBody = await gemRes.text();
      return res.status(502).json({ ok: false, error: `Gemini API error ${gemRes.status}: ${errBody.slice(0, 120)}` });
    }
    const gemData = await gemRes.json();
    const text = gemData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
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
