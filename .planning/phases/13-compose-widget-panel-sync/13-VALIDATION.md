---
phase: 13
slug: compose-widget-panel-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — extension content scripts require a real browser environment |
| **Config file** | none |
| **Quick run command** | Manual: load unpacked extension in Chrome, spot-check changed behavior |
| **Full suite command** | Manual: verify all three requirements in Chrome (see Manual-Only Verifications) |
| **Estimated runtime** | ~5 minutes per full manual pass |

---

## Sampling Rate

- **After every task commit:** Load unpacked extension in Chrome, spot-check the specific behavior that task changed
- **After every plan wave:** Run full manual checklist (all three requirements)
- **Before `/gsd:verify-work`:** All three manual checks pass
- **Max feedback latency:** ~5 minutes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | UI-SYNC-01 | manual | N/A — browser only | N/A | ⬜ pending |
| 13-01-02 | 01 | 1 | UI-SYNC-02 | manual | N/A — browser only | N/A | ⬜ pending |
| 13-01-03 | 01 | 1 | UI-SYNC-03 | manual | N/A — browser only | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing infrastructure (manual browser testing) covers all phase requirements. No automated test framework is applicable to vanilla JS extension content scripts in this project's current setup.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Widget visible only on most-recent compose window | UI-SYNC-01 | DOM manipulation in content script — no Node test runner can simulate Gmail DOM | 1. Open Gmail. 2. Open compose window A. 3. Open compose window B. 4. Verify widget shows on B only. 5. Close B. Verify widget moves to A. |
| Tracking toggle syncs to new compose when sidebar already open | UI-SYNC-02 | Requires live Chrome extension + Gmail DOM interaction | 1. Open sidebar panel. 2. Open a new compose window. 3. Toggle tracking on/off in sidebar. 4. Verify compose widget reflects the toggle without reopening sidebar. |
| Non-Gmail sidebar shows three-tab layout; Draft tab disabled | UI-SYNC-03 | Requires extension running on non-Gmail page | 1. Navigate to any non-Gmail page. 2. Click extension icon. 3. Verify sidebar shows three tabs (Overview, Find Contacts, Draft with AI). 4. Verify Draft tab shows "Open a compose window to use this feature" message. 5. Verify Overview and Find Contacts tabs are functional. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
