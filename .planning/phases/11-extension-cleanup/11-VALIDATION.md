---
phase: 11
slug: extension-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` (v18+) |
| **Config file** | None — invoked directly via CLI |
| **Quick run command** | `node --test extension/*.test.js` |
| **Full suite command** | `npm test` (root) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test extension/*.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | EXT-01 | manual grep | `grep -n "setInterval" web/src/hooks/useOutreach.js` (expect no match) | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | EXT-02 | unit | `node --test extension/reply-checker.test.js` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | EXT-02 | unit | `node --test extension/reply-checker.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `extension/reply-checker.test.js` — stubs for EXT-02 body-over-snippet and fallback behavior
- [ ] Export `buildConversationPreview` from `extension/reply-checker.js` (prerequisite for import in test)

*EXT-01 (interval removal) is verified by grep/code inspection — no runtime test file needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `useOutreach` contains no `setInterval` call | EXT-01 | Hook requires DOM + React environment to test at runtime; grep is sufficient for a pure deletion | Run `grep -n "setInterval" web/src/hooks/useOutreach.js` — must return no matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
