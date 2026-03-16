---
phase: 4
slug: extension-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — extension has no automated test runner |
| **Config file** | none |
| **Quick run command** | `grep -rn "catch {" extension/*.js && grep -rn "\.catch(() =>" extension/*.js` |
| **Full suite command** | Manual smoke test: reload unpacked extension in `chrome://extensions`, navigate to Gmail, send a test email |
| **Estimated runtime** | ~2 seconds (grep); ~2 minutes (full manual) |

---

## Sampling Rate

- **After every task commit:** Run `grep -rn "catch {" extension/*.js` (zero results expected after EXT-04 tasks)
- **After every plan wave:** Run full manual smoke test sequence
- **Before `/gsd:verify-work`:** Full smoke test must pass + grep must return zero silent catches
- **Max feedback latency:** 120 seconds (manual smoke)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| background-split | 01 | 1 | EXT-01 | manual | `grep -rn "catch {" extension/background.js` | ✅ | ⬜ pending |
| content-split | 01 | 1 | EXT-02 | manual | Reload Gmail tab; widget appears; send triggers scan | ✅ | ⬜ pending |
| logger-module | 02 | 1 | EXT-03 | manual+grep | `grep -rn "console\.log" extension/*.js` (zero after EXT-03) | ❌ W0 | ⬜ pending |
| catch-escalation | 02 | 2 | EXT-04 | automated | `grep -rn "catch {" extension/*.js && grep -rn "\.catch(() =>" extension/*.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `extension/logger.js` — stub file created (required by all other modules before they can be tested)

*All other test infrastructure is manual — no test runner setup needed for this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| background.js is orchestrator-only; auth/api/reply in modules | EXT-01 | No Chrome extension unit test harness | Reload extension, send email, verify tracking fires; check DevTools Network tab |
| content.js is orchestrator-only; modules loaded via manifest | EXT-02 | Requires live Gmail DOM | Reload Gmail tab, open compose, verify widget appears; send email, verify scan triggers |
| logger.js prefixes output `[Reach/module]`; debug suppressed when DEBUG=false | EXT-03 | Requires DevTools inspection | Set `DEBUG=false` in logger.js, reload extension, open DevTools console, confirm no verbose logs |
| No bare catch blocks remain | EXT-04 | Code review + grep | `grep -rn "catch {" extension/*.js` returns zero; `grep -rn "\.catch(() =>" extension/*.js` returns zero |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
