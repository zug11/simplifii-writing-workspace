# AGENTS.md

## Repository-local rules
This file applies to work on `zug11/simplifii-writing-workspace`. If a parent or main Simplifii repository contains its own AGENTS.md / agent.md, that repository-local file takes precedence for that repository.

## Cross-agent coordination · Personalisation

Canonical design truth:
- Notion Personalisation front door: `3e1b059c202b8100a7d8f10b098c93d0`
- Living Support Model v0.5: `3e1b059c202b81638c94f1d51acc34c2`
- Engineering Contract v0.2: `3e1b059c202b81e7a9d5dfaa9e9ae2dc`
- Cross-agent handoff: `3e1b059c202b816a883ec095092bc04d`

Current proof implementation:
- branch: `feature/personalisation-slice-01`
- draft PR: `#8`

Rules:
1. Never copy this proof implementation into `Simplifii-OS-Main` without reconciling current main-repo architecture.
2. Before starting Personalisation work, read the latest Notion handoff and latest git state.
3. Preserve existing iteration history; do not overwrite earlier prototype/design records.
4. One authoritative academic object; multiple representations.
5. Personalisation may change pathway, density, support, navigation, and restore behaviour. It must not change academic truth.
6. Slice 01 stays explicit-choice-first and browser-local. No passive behavioural inference, diagnosis inference, cross-device profile, life/capacity data, or cohort analytics.
7. Keep original source/criterion one action away.
8. All representation switches must preserve the selected criterion and assignment truth.
9. Add or update tests with every material implementation change.
10. End substantial sessions with a handoff:
   - CHANGED
   - DECIDED
   - CORRECTED
   - BLOCKED
   - NEXT
   - LINKS / COMMITS

## Current status
[CHATGPT · 2026-09-20]
CHANGED:
- Added browser-local supportState proof.
- Added deterministic rubric support router.
- Added Guide / Compare / Original rubric representations.
- Added explicit learner feedback controls.
- Added tests and draft PR #8.

DECIDED:
- Keep first integration slice small and additive.
- Do not introduce Supabase learner modelling in this proof repo.

BLOCKED:
- ChatGPT does not currently have connector access to `01Aaron-Saint-James-dev10/Simplifii-OS-Main`.
- Main-repo mapping must be performed by an agent with current main-repo access.

NEXT:
- Reconcile Personalisation concepts against main repo profile/preferences/AURA/rubric/persistence objects.
- Implement equivalent vertical slice in main only after that mapping.
