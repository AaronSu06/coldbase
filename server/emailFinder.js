import dns from 'dns';
import net from 'net';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ResolveDomainOutput = z.object({
  domain: z.string().regex(/^[\w.-]+\.[a-z]{2,}$/i).nullable(),
});

const InferPatternsOutput = z.object({
  patterns: z.array(z.string()).max(3),
});

const GetKnownEmailsOutput = z.object({
  emails: z.array(z.string().email()),
});

const EmailResult = z.object({
  email:      z.string().email(),
  confidence: z.number().int().min(0).max(100),
  status:     z.enum(['VERIFIED', 'UNCONFIRMED', 'UNREACHABLE']),
  source:     z.enum(['gemini-known', 'gemini-pattern', 'standard-fallback']),
  domain:     z.string(),
});

const FinderResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true),  results: z.array(EmailResult) }),
  z.object({ ok: z.literal(false), reason: z.enum(['no_domain', 'no_mx', 'no_candidates', 'all_invalid']) }),
]);

// ─── Session dedup map (email → smtpResult) ───────────────────────────────────

const probedEmails = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanSchema(schema) {
  const s = zodToJsonSchema(schema, { $refStrategy: 'none' });
  delete s.$schema;
  return s;
}

async function geminiToolCall(toolName, description, zodSchema, userPrompt) {
  const geminiKey = process.env.GEMINI_KEY;
  const schema = cleanSchema(zodSchema);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

  let attempt = 0;
  while (attempt < 2) {
    // Fresh controller + timeout per attempt so retries get their own 15s window.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const prompt = attempt === 0 ? userPrompt : userPrompt + '\nReturn only valid JSON matching the schema. No extra fields.';
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{
            function_declarations: [{
              name: toolName,
              description,
              parameters: schema,
            }],
          }],
          tool_config: {
            function_calling_config: {
              mode: 'ANY',
              allowed_function_names: [toolName],
            },
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const args = data.candidates?.[0]?.content?.parts?.[0]?.functionCall?.args;
    if (!args) throw new Error('Gemini returned no function call');

    const parsed = zodSchema.safeParse(args);
    if (parsed.success) return parsed.data;

    attempt++;
    if (attempt >= 2) throw new Error(`Gemini schema validation failed: ${parsed.error.message}`);
  }
}

async function checkMX(domain) {
  try {
    const records = await dns.promises.resolveMx(domain);
    return records
      .map(r => ({ ...r, exchange: r.exchange.replace(/\.$/, '') }))
      .sort((a, b) => a.priority - b.priority);
  } catch {
    return [];
  }
}

function smtpProbe(mxHost, email, timeoutMs = 8000) {
  return new Promise((resolve) => {
    function tryPort(port) {
      let state = 'GREETING';
      let buffer = '';
      let settled = false;

      function done(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { socket.write('QUIT\r\n'); } catch (_) {}
        setTimeout(() => { try { socket.destroy(); } catch (_) {} }, 200);
        resolve(result);
      }

      const socket = new net.Socket();
      const timer = setTimeout(() => {
        if (!settled) {
          socket.destroy();
          if (port === 25) tryPort(587);
          else done('UNREACHABLE');
        }
      }, timeoutMs);

      socket.on('error', (err) => {
        if (settled) return;
        if (port === 25 && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')) {
          socket.destroy();
          tryPort(587);
        } else {
          done('UNREACHABLE');
        }
      });

      socket.connect(port, mxHost, () => {});

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.length < 4) continue;
          const isContinuation = line[3] === '-';
          if (isContinuation) continue; // multi-line response — wait for final

          const code = parseInt(line.slice(0, 3), 10);

          if (state === 'GREETING') {
            if (code === 220) {
              socket.write(`EHLO reach-finder\r\n`);
              state = 'EHLO_SENT';
            } else {
              done('UNREACHABLE');
            }
          } else if (state === 'EHLO_SENT') {
            if (code >= 200 && code < 300) {
              socket.write(`MAIL FROM:<probe@reach-finder.local>\r\n`);
              state = 'MAIL_FROM_SENT';
            } else {
              done('UNREACHABLE');
            }
          } else if (state === 'MAIL_FROM_SENT') {
            if (code >= 200 && code < 300) {
              socket.write(`RCPT TO:<${email}>\r\n`);
              state = 'RCPT_TO_SENT';
            } else {
              done('UNREACHABLE');
            }
          } else if (state === 'RCPT_TO_SENT') {
            if (code === 250) {
              done('EXISTS');
            } else if (code === 550 || code === 551 || code === 553 || code === 554) {
              done('HARD_REJECT');
            } else if (code >= 400 && code < 500) {
              done('TEMP_FAIL');
            } else {
              done('UNREACHABLE');
            }
          }
        }
      });
    }

    tryPort(25);
  });
}

// Source-first scoring: base score reflects how much we trust the source;
// SMTP result adjusts but never makes a Gemini result disappear just because
// outbound SMTP is blocked (which it usually is on home/cloud networks).
function calculateScore(smtpResult, source, isCatchAll) {
  if (smtpResult === 'HARD_REJECT') {
    return { confidence: 0, status: 'UNREACHABLE', suppress: true };
  }

  // Base score by source quality
  let score;
  if (source === 'gemini-known')        score = 40; // Gemini recognises a real public address
  else if (source === 'gemini-pattern') score = 30; // Gemini inferred a plausible pattern
  else                                  score = 0;  // generic guess — only show if SMTP confirms

  let status;
  if (smtpResult === 'EXISTS' && !isCatchAll) {
    score += 35;
    status = 'VERIFIED';
  } else if (smtpResult === 'EXISTS' && isCatchAll) {
    // catch-all: 250 is meaningless — cap to avoid over-confidence
    score = Math.min(score, 40);
    status = 'UNCONFIRMED';
  } else if (smtpResult === 'TEMP_FAIL') {
    score -= 10;
    status = 'UNCONFIRMED';
  } else {
    // UNREACHABLE: SMTP was blocked — we simply don't know
    status = 'UNCONFIRMED';
  }

  score = Math.max(0, Math.min(100, score));
  const suppress = score < 20;
  return { confidence: score, status, suppress };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function findEmails({ company, firstName, lastName, domain: providedDomain }) {
  if (!process.env.GEMINI_KEY) {
    return { ok: false, reason: 'no_domain' };
  }

  // Stage 1: Resolve domain
  let domain;
  if (providedDomain && /^[\w.-]+\.[a-z]{2,}$/i.test(providedDomain)) {
    domain = providedDomain.toLowerCase();
  } else {
    try {
      const result = await geminiToolCall(
        'resolve_domain',
        'Given a company name, return the primary web domain (e.g. "stripe.com"). Return null if unknown.',
        ResolveDomainOutput,
        `What is the primary web domain for the company "${company}"? Return the domain only (e.g. "stripe.com") or null if unknown.`
      );
      domain = result.domain;
    } catch (e) {
      console.error('[Reach] resolve_domain failed:', e.message);
      return { ok: false, reason: 'no_domain' };
    }
    if (!domain) return { ok: false, reason: 'no_domain' };
  }

  const mxRecords = await checkMX(domain);
  if (mxRecords.length === 0) return { ok: false, reason: 'no_mx' };
  const mxHost = mxRecords[0].exchange;

  // Stage 2: Get email candidates
  const candidates = []; // { email, source }
  const seen = new Set();

  function addCandidate(email, source) {
    const norm = email.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      candidates.push({ email: norm, source });
    }
  }

  const hasName = firstName && lastName;

  if (!hasName) {
    // Mode A: no name — ask Gemini for known emails
    try {
      const result = await geminiToolCall(
        'get_known_emails',
        'Return known public email addresses for the given company domain.',
        GetKnownEmailsOutput,
        `List known public email addresses for the company "${company}" (domain: ${domain}). Only include real, publicly known emails.`
      );
      for (const email of result.emails) {
        if (email.toLowerCase().endsWith(`@${domain}`)) {
          addCandidate(email, 'gemini-known');
        }
      }
    } catch (e) {
      console.warn('[Reach] get_known_emails failed:', e.message);
    }
  } else {
    // Mode B: name provided — infer patterns
    const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const l = lastName.toLowerCase().replace(/[^a-z]/g, '');

    try {
      const result = await geminiToolCall(
        'infer_email_patterns',
        'Given a person\'s name and company domain, infer the most likely email address format patterns (e.g. "{first}.{last}", "{f}{last}").',
        InferPatternsOutput,
        `What are the most likely email patterns used at "${company}" (domain: ${domain}) for a person named "${firstName} ${lastName}"? Return up to 3 patterns using placeholders: {first}, {last}, {f} (first initial), {l} (last initial). Example: ["{first}.{last}", "{f}{last}"].`
      );

      for (const pattern of result.patterns) {
        const email = pattern
          .replace(/\{first\}/g, f)
          .replace(/\{last\}/g, l)
          .replace(/\{f\}/g, f[0] || '')
          .replace(/\{l\}/g, l[0] || '')
          + `@${domain}`;
        addCandidate(email, 'gemini-pattern');
      }
    } catch (e) {
      console.warn('[Reach] infer_email_patterns failed:', e.message);
    }

    // Standard fallbacks
    if (f && l) {
      addCandidate(`${f}@${domain}`, 'standard-fallback');
      addCandidate(`${f}.${l}@${domain}`, 'standard-fallback');
      addCandidate(`${f[0]}${l}@${domain}`, 'standard-fallback');
      addCandidate(`${f[0]}.${l}@${domain}`, 'standard-fallback');
    }
  }

  if (candidates.length === 0) return { ok: false, reason: 'no_candidates' };

  // Stage 3: SMTP probing
  // Catch-all probe — cache actual result in the Map
  const catchAllEmail = `zzz_nonexistent_abc123@${domain}`;
  let catchAllResult;
  if (probedEmails.has(catchAllEmail)) {
    catchAllResult = probedEmails.get(catchAllEmail);
  } else {
    catchAllResult = await smtpProbe(mxHost, catchAllEmail);
    probedEmails.set(catchAllEmail, catchAllResult);
  }
  const isCatchAll = (catchAllResult === 'EXISTS');

  // Probe each candidate — reuse cached result if already probed
  const probed = [];
  for (const candidate of candidates) {
    let smtpResult;
    if (probedEmails.has(candidate.email)) {
      smtpResult = probedEmails.get(candidate.email); // reuse actual result
    } else {
      smtpResult = await smtpProbe(mxHost, candidate.email);
      probedEmails.set(candidate.email, smtpResult);
    }
    probed.push({ ...candidate, smtpResult });
  }

  // Stage 4: Score and validate
  const results = [];
  for (const { email, source, smtpResult } of probed) {
    const { confidence, status, suppress } = calculateScore(smtpResult, source, isCatchAll);
    if (suppress) continue;

    const parsed = EmailResult.safeParse({ email, confidence, status, source, domain });
    if (parsed.success) results.push(parsed.data);
  }

  results.sort((a, b) => b.confidence - a.confidence);

  const response = FinderResponse.safeParse(
    results.length > 0
      ? { ok: true, results }
      : { ok: false, reason: 'all_invalid' }
  );

  if (!response.success) return { ok: false, reason: 'all_invalid' };
  return response.data;
}
