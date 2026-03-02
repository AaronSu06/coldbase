import { GEMINI_API_KEY } from './config.js';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export async function classifyWithGemini(subject, body) {
  const prompt =
    `Analyze this outreach email. Reply with ONLY valid JSON, no markdown:\n{"isColdOutreach": true or false, "company": "Company Name or null"}\n\n- isColdOutreach: true if this is a job/internship application or follow-up\n- company: the target company name (from subject or body), or null if unclear\n\nSubject: ${subject}\nBody: ${body.slice(0, 600)}`;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Reach] Gemini API error ${res.status} — falling back to keywords. ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      isColdOutreach: Boolean(parsed.isColdOutreach),
      company: parsed.company && parsed.company !== 'null' ? parsed.company : null
    };
  } catch (e) {
    console.warn('[Reach] Gemini request failed — falling back to keywords.', e?.message);
    return null;
  }
}
