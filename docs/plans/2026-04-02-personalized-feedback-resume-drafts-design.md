# Personalized AI Feedback + Resume-Tailored Drafts + Pro Gate Redirect

**Date:** 2026-04-02

## Context

Three related gaps in the AI-powered features:

1. "View Personalized Feedback" in the Sidebar calls `/api/feedback` but doesn't use the user's imported resume, and truncates the conversation snippet to 1200 chars (leaving context on the table).
2. Web draft functions (`draftBump`, `draftReply`, `draftInterviewFollowUp`, `generateConversationFeedback`) in `lib/gemini.js` call Gemini directly from the frontend with no resume context — prompts hardcode "Aaron, a second-year CS student at Queen's University."
3. Non-Pro users clicking "View Personalized Feedback" see an inline error string instead of being routed to the upgrade flow.

## Architecture

### Data flow for `resumeText`

`resumeText` is already stored in the DB (added in migration `20260322221517`) and used by `/api/draft-email` (server-side, extension). It is NOT currently exposed to the web frontend. The fix: add it to the `/auth/me` response (capped at 3000 chars), so it flows into the existing `useUser`/`useAuth` hook and is available anywhere in the web app.

### Conversation history

The `snippet` field on outreach records is already structured as `[OUT] Name: text\n\n[IN] Name: text` — it IS the conversation history. No new fetching needed. The current feedback prompt truncates it to 1200 chars; we increase this to 2000 (the field's actual limit).

### ProModal lifting

`ProModal` currently lives inside `HomePage`. Lifting it to `App.jsx` with a single `proModalOpen` state allows any component to trigger it. The non-Pro feedback click triggers a single `onUpgradePrompt` callback on App that closes the sidebar, navigates home, and opens the modal.

---

## Changes

### 1. Backend — `server/routes/auth.js`
Add `resumeText: user.resumeText?.slice(0, 3000) ?? null` to the `/auth/me` response.

### 2. Backend — `server/routes/email.js` (`POST /api/feedback`)
The handler already fetches the user row for plan-gating, so `user.resumeText` is available. Add a resume context block to the prompt and increase snippet usage from 1200 → 2000 chars:

```
You are an expert career coach reviewing a job outreach thread...

[If resumeText exists]
Candidate background:
{resumeText.slice(0, 3000)}

Conversation ([OUT] = sent by candidate, [IN] = received):
{snippet.slice(0, 2000)}

Provide concise feedback in four labeled sections:
1. What the candidate did well (1-2 sentences)
2. What to improve (1-2 sentences, specific)
3. Tone assessment (1 sentence)
4. Suggested next move given the current status (1-2 sentences)
```

### 3. Frontend — `web/src/lib/gemini.js`
Add `resumeText` parameter to all four exported functions. Prepend to prompts when present (1500 char cap for drafts, 3000 for feedback). Replace hardcoded identity with `"the candidate"` as the no-resume fallback.

```js
export async function draftBump(record, resumeText) { ... }
export async function draftReply(record, resumeText) { ... }
export async function draftInterviewFollowUp(record, resumeText) { ... }
export async function generateConversationFeedback(record, resumeText) { ... }
```

### 4. Frontend — `web/src/components/Sidebar.jsx`
- Pass `user?.resumeText` as the second argument wherever Gemini functions are called.
- Accept an `onUpgradePrompt` prop.
- Replace the non-Pro error-string path with: `if (!canUseFeedback) { onUpgradePrompt(); return; }`

### 5. Frontend — `web/src/App.jsx`
- Add `const [proModalOpen, setProModalOpen] = useState(false)`.
- Add `handleUpgradePrompt`: sets `selectedThreadId(null)` → `navigate('/')` → `setProModalOpen(true)`.
- Render `<ProModal open={proModalOpen} onClose={() => setProModalOpen(false)} />` at App level.
- Pass `onUpgradePrompt={handleUpgradePrompt}` to Sidebar.
- Pass `onOpenProModal={() => setProModalOpen(true)}` to HomePage.

### 6. Frontend — `web/src/components/HomePage.jsx`
- Remove `<ProModal>` render and its local state.
- Wire UpgradeCard button to call `onOpenProModal` prop.

---

## Decision log

- **No Gemini function calling / agent tools** — all context is available at call time; structured prompting is sufficient and simpler.
- **`resumeText` in `/auth/me`** over a dedicated endpoint — avoids a new round-trip, already fetched once per session, user's own data.
- **Token budget** — ~1500 chars resume + ~2000 chars conversation + prompt ≈ 1200–1500 tokens per call. Predictable and moderate.
- **ProModal lifted to App** over URL query params — avoids URL pollution, cleaner state ownership.

---

## Verification

1. **Feedback with resume**: Upload a resume in Settings, open a tracked thread with replies, click "View Personalized Feedback" — response should reference your actual background/skills.
2. **Feedback without resume**: Remove resume, repeat — feedback still works with generic "the candidate" language.
3. **Draft personalization**: Trigger a bump/reply draft — generated copy should reflect resume context.
4. **Non-pro redirect**: As a free user, click "View Personalized Feedback" — sidebar closes, navigates to `/`, ProModal opens.
5. **Pro user unaffected**: As a pro user, all features work normally with no redirect.
