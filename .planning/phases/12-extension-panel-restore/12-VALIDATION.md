---
phase: 12
slug: extension-panel-restore
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`) |
| **Config file** | none — existing infrastructure |
| **Quick run command** | `cd server && npm test` |
| **Full suite command** | `npm test` (root) |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (root)
- **After every plan wave:** Run `npm test` (root)
- **Before `/gsd:verify-work`:** Full suite must be green + manual panel smoke test
- **Max feedback latency:** ~12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | EXT-V2-01 | manual | Load extension, click widget in compose — panel opens | N/A | ⬜ pending |
| 12-01-02 | 01 | 1 | EXT-V2-01 | manual | Click extension icon on Gmail tab — panel opens | N/A | ⬜ pending |
| 12-01-03 | 01 | 1 | EXT-V2-02 | manual | Overview tab shows stats and toggle pill | N/A | ⬜ pending |
| 12-01-04 | 01 | 1 | EXT-V2-03 | manual | Find tab returns results; Draft tab inserts into compose | N/A | ⬜ pending |
| 12-01-05 | 01 | 1 | EXT-V2-01 | automated | `npm test` — existing server/extension tests still pass | `npm test` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — the changes are in Chrome extension content scripts which cannot be unit tested outside the browser.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Panel opens from widget click in compose | EXT-V2-01 | Chrome extension content script — no headless test environment | Open Gmail, start compose, click Reach widget → confirm panel appears with 3 tabs |
| Panel opens from extension icon on Gmail tab | EXT-V2-01 | Chrome extension action click — requires real browser | Navigate to mail.google.com, click Reach icon → confirm panel opens |
| Overview tab stats + toggle pill | EXT-V2-02 | Requires live extension + server | Confirm sent/replied/rate load and Auto/On/Off pill responds to clicks |
| Find Contacts end-to-end | EXT-V2-03 | Requires live extension + server + email finder | Enter company name → confirm results appear with copy button |
| Draft with AI end-to-end | EXT-V2-03 | Requires live extension + server + Gemini key | Select draft type → generate → confirm insert button puts text into compose |
| Popup dead CSS removed | EXT-V2-01 | Visual check | Open popup → confirm no extra whitespace or broken layout where settings used to be |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
