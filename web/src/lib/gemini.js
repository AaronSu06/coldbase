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
- Status: ${isGhosted ? 'Ghosted - this is a last-ditch check-in' : 'No reply yet'}${notesCtx}

Write a ${isGhosted ? '1-2 sentence final bump. Extremely low pressure - just resurfacing, no desperation' : '2-3 sentence follow-up that feels like a real person sent it'}.

Rules you must follow:
- Never use em-dashes (—). Use commas, periods, or rewrite the sentence instead.
- Never open with "I hope this finds you well", "Just circling back", "I wanted to follow up", or any other cliche opener.
- No buzzwords: do not write "passionate", "leverage", "excited", "opportunity", "reach out", "touch base", "synergy", "impactful".
- Don't grovel or over-explain. Keep it short and confident.
- Reference the original outreach naturally in one clause, not as a whole sentence.
- A good bump sounds like a real person nudging a thread, e.g. "Bumping this up in case it got buried." or "Still interested if there's a good time to connect."
- Sign off using the sender's name from the resume if available, otherwise sign off naturally.

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

Write a short, natural reply (2-4 sentences) that directly responds to what they said.

Rules you must follow:
- Never use em-dashes (—). Use commas, periods, or rewrite the sentence instead.
- No buzzwords: do not write "passionate", "leverage", "excited about the opportunity", "reach out", "touch base", "synergy", "impactful", "looking forward to connecting".
- Mirror their energy - if they are casual, be casual. If they asked a question, answer it first before anything else.
- Don't start with "Thank you for getting back to me" or "Thanks for reaching out" as the opener - it is filler.
- Sound like a real person. Short sentences. No corporate stiffness.
- Sign off using the sender's name from the resume if available, otherwise sign off naturally.

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

Write a concise 3-4 sentence follow-up that feels genuine, not templated.

Rules you must follow:
- Never use em-dashes (—). Use commas, periods, or rewrite the sentence instead.
- No buzzwords: avoid "passionate", "leverage", "exciting opportunity", "touch base", "synergy", "impactful", "circle back".
- Do not open with "I wanted to reach out to thank you" or "I hope this email finds you well."
- Thank them briefly and specifically - if notes give a hint of what was discussed, reference it. Otherwise keep it general but not generic.
- Reaffirm interest in one direct sentence, not multiple effusive ones.
- Keep it warm but short. 3-4 sentences total.
- Sign off using the sender's name from the resume if available, otherwise sign off naturally.

Return ONLY the email text. No preamble, commentary, or explanation.`;

  return callGemini(prompt);
}

export async function generateConversationFeedback(record, resumeText) {
  const notesCtx = record.notes ? `\nCandidate notes: ${record.notes}` : '';
  const resumeCtx = resumeText ? `\nCandidate background:\n${resumeText.slice(0, 3000)}` : '';
  const threadCtx = record.snippet
    ? `\nConversation (format: [OUT] = sent by candidate, [IN] = received):\n${record.snippet.slice(0, 2000)}`
    : '';
  const prompt = `You are an expert career coach reviewing a job outreach email thread. You specialize in cold email and have strong opinions about what works.${resumeCtx}

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Subject: ${record.subject}
- Status: ${record.status}
- Days since sent: ${getDaysSince(record.sentDate)}${threadCtx}${notesCtx}

Provide concise, specific feedback in four labeled sections:
1. What the candidate did well (1-2 sentences)
2. What to improve (1-2 sentences, specific - call out any buzzwords, cliches, or em-dashes used)
3. Tone assessment (1 sentence)
4. Suggested next move given the current status (1-2 sentences)

Your feedback must also follow these rules:
- Never use em-dashes (—) in your feedback text. Use commas or periods instead.
- No filler phrases. Be direct.
- Call out any AI-sounding or corporate language in the email if present (words like "passionate", "leverage", "synergy", "impactful", "circle back", "touch base").
- If there are em-dashes in the original email, flag that as something to fix.`;
  return callGemini(prompt);
}
