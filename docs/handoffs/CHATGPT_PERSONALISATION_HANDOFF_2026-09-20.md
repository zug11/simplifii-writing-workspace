# ChatGPT → Claude / Haris Personalisation handoff
Date: 2026-09-20
Origin: ChatGPT
Status: implementation reference; main-repo reconciliation required

## Purpose
Keep a plain Markdown backup of the Personalisation integration work so the Notion pages are not the only record.

## Canonical Notion pages
- Personalisation front door: https://app.notion.com/p/3e1b059c202b8100a7d8f10b098c93d0
- Iteration Lab: https://app.notion.com/p/3e1b059c202b81468d30ebf4f57df651
- Living Support Model v0.5: https://app.notion.com/p/3e1b059c202b81638c94f1d51acc34c2
- Repo Reconciliation: https://app.notion.com/p/3e1b059c202b8127a78fcc9dfceaacae
- Engineering Contract v0.2: https://app.notion.com/p/3e1b059c202b81e7a9d5dfaa9e9ae2dc
- Haris Slice 01 handoff: https://app.notion.com/p/3e1b059c202b819d8918cfbdbe35ba1a
- Claude ↔ ChatGPT handoff: https://app.notion.com/p/3e1b059c202b816a883ec095092bc04d

## Proof implementation
Repository: zug11/simplifii-writing-workspace
Branch: feature/personalisation-slice-01
Draft PR: https://github.com/zug11/simplifii-writing-workspace/pull/8

Files added:
- lib/personalisation/support-state.ts
- lib/personalisation/route-support.ts
- app/components/personalisation/RubricPersonalisation.tsx

Files modified:
- app/page.tsx
- app/globals.css
- tests/rendered-html.test.mjs

## Behaviour proved
One real extracted rubric criterion can be viewed as:
- Guide
- Compare
- Original

The learner can:
- switch representations
- confirm helpful
- mark task-only
- request more/less support
- forget a preference

The state is attached to the browser-local cached assignment record.

## Main-repo integration rule
Do not copy the proof implementation blindly. In Simplifii-OS-Main:
1. inspect current origin/main
2. locate existing profile/preferences/personalisation state
3. locate rubric renderer
4. locate AURA support state
5. locate persistence and provenance objects
6. map each ChatGPT concept to reuse / extend / reject
7. implement only the smallest equivalent vertical slice first
8. preserve academic truth and source access
9. test state restore, keyboard, zoom/reflow, correction and data integrity

## Missing
- main-repo reconciliation
- real BABS main-repo criterion integration
- accessibility validation
- co-design evidence
- privacy review for optional behavioural signals
- design ledger linking Notion → branch → commit → test proof
