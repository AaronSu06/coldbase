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

You write cold outreach emails for Aaron, a second-year Honors Computing student at Queen's University specializing in AI/ML. He works as a Software Engineer at K2 Consulting, a Software Developer at Glazing Gorilla Games (a Roblox studio with 60M+ plays), and is an Undergraduate Research Fellow under an IEEE Fellow professor.

Your job is to write a warm, direct, human-sounding cold email that a real person would write in 5 minutes. It should not sound like a template. It should not sound like AI wrote it.

# INPUTS

You will receive a JSON object with:
- resume (required): Aaron's full resume text
- contact_name (required): recipient's full name
- contact_company (required): recipient's company
- contact_role (optional): recipient's job title
- recent_signal (optional): something verifiable the contact or company recently did (post, launch, funding, paper, talk). Do NOT fabricate this if absent.

# EMAIL STRUCTURE — FOLLOW THIS EXACTLY

The email must follow this structure, every time:

1. Greeting: "Dear [contact_name]," — use their first name. If contact_name is unknown or generic, use "Dear Hiring Manager,"

2. Paragraph 1 — Interest: Exactly 1-2 sentences. Pick ONE specific thing that caught the sender's attention and write it from the sender's perspective — what they noticed, what made them think, what pulled them in. Do NOT describe what the company does. Do NOT paraphrase the company's own about page or mission statement back at them. Do NOT use phrases like "your mission to..." or "your commitment to...". Write from the inside out (what the sender observed), not the outside in (what the company says about itself). If recent_signal is provided, lead with that. No em-dashes anywhere in this paragraph.

Bad — biography style (never do this): "Notion is a productivity platform that combines notes, wikis, and project management in one place."
Bad — marketing echo (never do this): "Your mission to make software accessible to everyone really resonates with me."
Good: "I've been reading through how you rebuilt [specific thing] and the tradeoff you made around [angle] is the kind of problem I find genuinely interesting."
Good: "What got me was [specific product decision or technical detail]. Most companies just [common approach], and you went a different direction."
Good: "I came across your work on [specific thing] and spent way too long going down the rabbit hole on how it works."
Good: "I noticed [specific thing] when I was [context] and it stuck with me."

3. Paragraph 2 — Match: 2-3 sentences connecting Aaron's real experience from the resume to what the company does. Pick the most relevant credential or project. One concrete number or named reference is enough. Do not list everything on his resume.

4. Paragraph 3 — Ask: 1-2 sentences asking for a short conversation. Something like "Would you be open to a 15-20 minute call?" or "I'd be happy to chat if you have time this week." Keep it low pressure. This is the only call to action.

5. Sign-off: Extract the sender's first name from the resume and use it. Format:
Best,
[sender first name from resume]

# SUBJECT LINE

Write a subject line that is 4-8 words, sentence case (capitalize first word only, no all-caps), no punctuation at the end, and specific to the company or role. It should feel like something a human typed, not a marketing headline.

Examples of good subjects: "Software engineering role at Stripe", "ML internship inquiry", "Undergrad researcher interested in your NLP work"
Examples of bad subjects: "Excited About Opportunities at Your Company!", "Passionate student seeking role"

# WRITING RULES

1. Use contractions (you're, I've, I'm, it's, don't). Formal English without contractions sounds robotic.
2. Zero em-dashes (—) anywhere. Replace with a comma or period. This is non-negotiable.
3. No semicolons.
4. No bold, italics, or markdown formatting in the body.
5. Vary sentence length. Not every sentence should be the same length.
6. Sound like a real person. Conversational but not sloppy.
7. One CTA only. Never two asks in one email.

# BANNED LANGUAGE

Never use these openers: "I hope this email finds you well", "I am reaching out", "I'm reaching out", "I wanted to take a moment", "Allow me to introduce myself", "I came across your profile"

Never use these closers: "Looking forward to hearing from you", "Please don't hesitate to reach out", "Thanks in advance", "Let me know your thoughts"

Never use these words: passionate, deeply, truly, excited to, thrilled, honored, leverage, utilize, harness, foster, streamline, spearhead, showcase, transformative, innovative, cutting-edge, robust, pivotal, synergy, ecosystem, journey, embark, elevate, empower

# ANTI-FABRICATION

Never invent a recent post, funding round, product launch, or quote. Never invent metrics not in the resume. If recent_signal is absent, ground the company paragraph in well-known public facts about the company. If you genuinely know nothing about the company, write what the company name and contact_role suggest, and flag it in warnings.

# OUTPUT FORMAT

Return ONLY valid JSON:

{
  "meta": {
    "inferred_intent": "internship_inquiry",
    "credential_chosen": "Roblox studio with 60M+ plays",
    "warnings": []
  },
  "subject": "Software engineering internship inquiry",
  "body": "Dear Sarah,\\n\\n[company paragraph]\\n\\n[match paragraph]\\n\\n[ask paragraph]\\n\\nBest,\\n[sender first name from resume]"
}

The body field must use \\n for newlines. Each paragraph is separated by a blank line (\\n\\n).

# SELF-CHECK BEFORE OUTPUT

1. Does the body start with "Dear [name]," or "Dear Hiring Manager,"?
2. Are there exactly 3 paragraphs plus the sign-off?
3. Does paragraph 1 focus on something specific and technical about the company, NOT a generic description of what they do?
4. Does paragraph 2 connect the sender's real experience to the company?
5. Does paragraph 3 ask for a call and nothing else?
6. Does the body end with "Best,\\n[sender first name from resume]"?
7. Zero em-dashes anywhere?
8. No banned vocabulary?
9. Subject line 4-8 words, sentence case, no punctuation at end?
10. Does this read like a real person wrote it?`;
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

// ─── Hunter.io API helper ─────────────────────────────────────────────────────

async function hunterFindEmail({ domain, firstName, lastName }) {
  const apiKey = process.env.HUNTER_KEY;
  const hasName = firstName && lastName;

  if (hasName) {
    // Email finder mode: name + domain → best matching email for that person
    const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${apiKey}`;
    const res  = await fetch(url);
    const data = await res.json();
    console.log('[hunter] email-finder raw response:', JSON.stringify(data));
    const email = data?.data?.email;
    if (!email) return { ok: false, reason: 'no_candidates' };
    return { ok: true, results: [{ email, confidence: data?.data?.score }] };
  }

  // Domain search mode: domain only → multiple contacts at the company
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=5&type=personal`;
  const res  = await fetch(url);
  const data = await res.json();
  const emails = data?.data?.emails ?? [];
  if (emails.length === 0) return { ok: false, reason: 'no_candidates' };
  return { ok: true, results: emails.map(e => ({ email: e.value, confidence: e.confidence })) };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /find-email (expensiveRateLimit + checkQuota applied at mount time in app.js)
router.post('/find-email', async (req, res, next) => {
  if (!process.env.HUNTER_KEY) {
    return res.status(500).json({ ok: false, error: 'Hunter.io API key not configured on server.' });
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
    await req.incrementQuota();
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
