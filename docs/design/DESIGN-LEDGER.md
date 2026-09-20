# DESIGN-LEDGER.md

Purpose: link design promises to implementation proof. A design is not considered wired until it has a branch, commit(s), and test evidence.

| Notion page | Page ID | Design claim | Repo / branch | Proof files | Commit(s) | Test evidence | Status |
|---|---|---|---|---|---|---|---|
| Personalisation · Onboarding System · Current + Iterations | 3e1b059c202b8100a7d8f10b098c93d0 | Personalisation changes pathway/support, not academic truth | zug11/simplifii-writing-workspace / feature/personalisation-slice-01 | support-state.ts, route-support.ts, RubricPersonalisation.tsx | 1aacc6c, ec5dfca, b795f14 | rendered-html.test.mjs additions | proof slice |
| Iteration 03 · Try Before You Choose | 3e1b059c202b817591aad38675b8dedf | Experience representations before declaring preference | same | RubricPersonalisation.tsx | b795f14 | representation switch assertions + component wiring assertions | partial proof |
| Iteration 04 · Contextual Calibration | 3e1b059c202b81e188f1cffa6dc7b0ff | Preference can be context-specific | same | support-state.ts, route-support.ts | 1aacc6c, ec5dfca | rubric-context routing / task isolation test | rubric-only proof |
| Iteration 05 · Living Support Model | 3e1b059c202b81638c94f1d51acc34c2 | Personalisation is inspectable, correctable, reversible | same | support-state.ts, RubricPersonalisation.tsx | 1aacc6c, b795f14 | helpful / task-only / forget / more-less state tests | partial proof |
| Repo Reconciliation · writing-workspace truth v0.1 | 3e1b059c202b8127a78fcc9dfceaacae | First slice must fit current browser-local architecture | same | page.tsx integration | ae3b620 | cache wiring assertions | verified in accessible repo |
| Engineering Contract v0.2 · MVP-local supportState | 3e1b059c202b81e7a9d5dfaa9e9ae2dc | versioned local support state + deterministic router | same | support-state.ts, route-support.ts | 1aacc6c, ec5dfca | route-support tests | proof implemented |
| Haris Implementation Handoff · Slice 01 | 3e1b059c202b819d8918cfbdbe35ba1a | Real rubric → Guide / Compare / Original → learner correction | same | all slice files | through 5df2ab6 | rendered-html.test.mjs additions | draft PR #8 |
| Claude ↔ ChatGPT Personalisation Handoff | 3e1b059c202b816a883ec095092bc04d | Cross-agent read order + main-repo reconciliation rules | same | AGENTS.md, docs/handoffs/... | e19ed69, 5f39a6a | process evidence only | current |

## Current draft PR
https://github.com/zug11/simplifii-writing-workspace/pull/8

## Important boundary
This ledger proves behaviour only in `zug11/simplifii-writing-workspace`. It does not prove that `01Aaron-Saint-James-dev10/Simplifii-OS-Main` has been reconciled or implemented. Main-repo rows should be added only by an agent with verified access to current `origin/main`.

## Test status
Tests were added to the repository. ChatGPT's current connector can inspect/write repository files and PRs but cannot execute the Node test suite in the GitHub runtime. CI / Claude Code / local dev must run:
- `npm test`
- `npm run lint`
- `npm run build`

Attach actual pass/fail output before marking Slice 01 done.
