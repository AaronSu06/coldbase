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

export async function draftBump(record) {
  const daysSince = getDaysSince(record.sentDate);
  const isGhosted = record.status === 'Ghosted';
  const notesCtx = record.notes ? `\nExtra context from notes: ${record.notes}` : '';

  const prompt = `You are helping Aaron, a second-year CS student at Queen's University, write a follow-up email for a software engineering internship cold outreach that received no reply.

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Original subject: ${record.subject}
- Days since first email: ${daysSince}
- Status: ${isGhosted ? 'Ghosted — this is a last-ditch check-in' : 'No reply yet'}${notesCtx}

Write a ${isGhosted ? 'brief, low-pressure final check-in (2 sentences max)' : 'short 2-3 sentence follow-up'}. Casual but professional. Don't open with "I hope this email finds you well." Reference the original email naturally. Sign off as Aaron.

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

export async function draftReply(record) {
  const lastMessage = extractLastInboundMessage(record.snippet);
  const notesCtx = record.notes ? `\nExtra context from notes: ${record.notes}` : '';

  const prompt = `You are helping Aaron, a second-year CS student at Queen's University, write a natural reply to a recruiter/contact who responded to his cold outreach for a software engineering internship.

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Original subject: ${record.subject}${lastMessage ? `\n- Their message: "${lastMessage}"` : ''}${notesCtx}

Write a short, natural reply (2-4 sentences) that directly responds to what they said. Conversational, not stiff. No buzzwords. Sign off as Aaron.

Return ONLY the email text. No preamble, commentary, or explanation.`;

  return callGemini(prompt);
}

export async function draftInterviewFollowUp(record) {
  const notesCtx = record.notes ? `\nExtra context from notes: ${record.notes}` : '';

  const prompt = `You are helping Aaron, a second-year CS student at Queen's University, write a thank-you / follow-up email after an interview or interview scheduling for a software engineering internship.

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the interviewer'}
- Original subject: ${record.subject}${notesCtx}

Write a concise 3-4 sentence follow-up. Thank them for their time, reaffirm enthusiasm, mention you're looking forward to next steps. Professional but warm. Sign off as Aaron.

Return ONLY the email text. No preamble, commentary, or explanation.`;

  return callGemini(prompt);
}

export async function generateConversationFeedback(record) {
  const notesCtx = record.notes ? `\nCandidate notes: ${record.notes}` : '';
  const threadCtx = record.snippet
    ? `\nConversation (format: [OUT] = sent by candidate, [IN] = received):\n${record.snippet.slice(0, 1200)}`
    : '';
  const prompt = `You are an expert career coach reviewing a job outreach email thread for Aaron, a second-year CS student at Queen's University.

Context:
- Company: ${record.company}
- Contact: ${record.contactName || 'the recruiter'}
- Subject: ${record.subject}
- Status: ${record.status}
- Days since sent: ${getDaysSince(record.sentDate)}${threadCtx}${notesCtx}

Provide concise, specific feedback in four labeled sections:
1. What Aaron did well (1-2 sentences)
2. What to improve (1-2 sentences, specific)
3. Tone assessment (1 sentence)
4. Suggested next move given the current status (1-2 sentences)

Be direct and actionable. No filler phrases.`;
  return callGemini(prompt);
}
