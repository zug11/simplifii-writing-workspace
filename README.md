# Simplifii Writing Workspace

## Legacy scope integration assessment

This repository contains the focused Simplifii writing workspace. Its current
product loop is intentionally narrow:

> import an assignment brief and rubric → understand the task → choose a
> structure → write → receive rubric-aware guidance

There is a separate legacy repository,
[`Simplifii-OS-Main`](https://github.com/zug11/Simplifii-OS-Main), that describes
a much larger learning platform. Integrating that scope into this application is
not a normal feature merge. It is a staged product and platform rebuild.

**A credible integrated MVP is a minimum five-month engineering programme.**
That estimate assumes a full-time experienced technical lead, prompt product
decisions, stable access to required services and a frozen MVP scope.

Five months does **not** buy literal parity with every legacy screen, service,
prototype and roadmap item. The complete stated vision is a multi-year,
multidisciplinary programme. The inspected snapshot supports a provisional
30–48+ month solo-engineering lower bound, but no fixed full-scope commitment is
reliable until the conflicting legacy specifications are reconciled.

This document describes the engineering reality, the minimum viable integration
scope and the conditions under which the five-month estimate remains possible.
It is a planning assessment, not a commitment to deliver unspecified work.

## What works in this repository now

The current application already provides a coherent assignment workflow:

- PDF, DOCX, image and text assignment-material import
- assignment brief and rubric extraction
- a student-facing review of the task, requirements and marking criteria
- a choice between Simplifii-created blocks and a student-controlled structure
- preservation and structuring of an existing student draft
- automatic rubric analysis when an existing draft enters the workspace
- block view and continuous full-draft view
- responsive guidance that updates as the student writes
- whole-draft and individual-block analysis
- rubric-aware red, yellow and green inline annotations
- assignment and writing-block creation and deletion
- browser-local assignment persistence
- invite-code access using a signed server cookie
- tester feedback delivered by email

This is already suitable for controlled concept testing. It should remain the
primary product surface while the platform foundations are rebuilt around it.

There is **no ChatGPT sign-in and no user-account system** in the working
product. A tester enters the shared invite code, the server issues a signed
30-day cookie, and assignment data remains local to that browser. That is the
intended access and persistence model for this MVP.

## Why the repositories cannot simply be merged

### 1. They use different application architectures

The current workspace uses:

- React 19 and TypeScript
- vinext/Vite
- Vercel-compatible server routes
- the Vercel AI SDK with OpenAI
- browser Cache API and local storage as the primary persistence layer
- a small set of server endpoints for AI, invite access and feedback

The legacy repository uses or contains:

- React 18, Create React App and JavaScript
- an Express server and Railway-oriented deployment
- Supabase authentication, PostgreSQL, storage and row-level security
- Anthropic integrations alongside several other model and media SDKs
- TipTap, Zustand and multiple overlapping state/service layers
- 129 API files, hundreds of UI components and many feature flags

Moving a React component between those environments does not move the behaviour
that surrounds it. Storage, API contracts, routing, editor state, environment
variables and deployment assumptions all have to be redesigned. The legacy
authentication and database layers are not requirements for this MVP.

### 2. The legacy repository is a product archive, not a clean module library

A repository-wide inventory found approximately:

- 3,267 tracked files
- 1,018 files under `src/`
- 129 API files
- 229 top-level frontend components
- 84 service files
- 575 Markdown documents
- 43 proposed product surfaces across four visual directions

It also contains compiled builds, source maps, screenshots, logs, backups,
prototype HTML, duplicated reference builds and multiple AI-agent control
planes. Repository size is not the same thing as useful product code.

The old source cannot be treated as 3,267 reusable building blocks. Much of the
work is documentation, generated output, stale alternatives or code written for
an architecture this repository does not use.

### 3. The legacy specifications contradict one another

Different legacy documents define the product as:

- a five-screen canvas-first rebuild;
- a five-stage, seven-audience learning operating system;
- a provenance-first platform with 43 surfaces in four themes; and
- a collection of assessment, planning, integrity, research, accessibility,
  wellbeing, community and institutional products.

They also disagree about what is shipped, pending, deprecated or authoritative.
Some features are described as complete in one document and unwired,
flag-gated, pending or unsafe in another.

Engineering cannot resolve contradictory product strategy by importing more
files. A single written product decision must precede every substantial legacy
feature.

### 4. The data models are fundamentally different

The current workspace stores complete assignment workspaces in the user's
browser. It does not currently have user accounts, cross-device sync, a course
graph, a source library, a learning profile or an authorship ledger.

The legacy product assumes a multi-user cloud model containing courses,
assessments, rubrics, drafts, sources, provenance events, learner preferences,
institutional context, analytics and safeguarding records.

That legacy model should not be smuggled into this MVP. If account-based cloud
sync is explicitly commissioned later, it would require:

- stable identity and account ownership;
- database migrations and backup/recovery procedures;
- row-level access policies and account-scoped file storage;
- conflict resolution between local and cloud copies;
- deletion, export and retention behaviour;
- consent boundaries for sensitive learning and accessibility data; and
- an incident response path.

This would be a separate infrastructure and security project, not a UI feature
and not a hidden dependency of the five-month MVP. No ChatGPT sign-in, user
account, production database or cross-device sync is required or planned here.

### 5. The AI systems do not share one contract

The current application has a small number of explicit structured AI actions:
assignment extraction, block planning, existing-draft structuring, guidance
allocation and rubric analysis.

The legacy repository spreads AI behaviour across many endpoints and services:
tutoring, planning, rewriting, source search, integrity, hidden-curriculum
decoding, practice generation, knowledge graphs, learner modelling, voice and
more.

Before any of those capabilities can be brought across, each one needs:

- a clearly permitted student outcome;
- a structured request and response contract;
- prompt-injection handling for uploaded documents;
- factual grounding and uncertainty behaviour;
- cost and rate limits;
- evaluation fixtures;
- failure states that do not lose student work; and
- a decision about whether the capability belongs in the primary interface.

Calling a collection of prompts an “expert system” does not make it reliable.
The integrated MVP should use the smallest explicit data model and AI contract
that supports the student workflow. It should not recreate the legacy ontology
merely because documents describing it already exist.

### 6. Security must be re-established, not inherited

The legacy history documents previous findings involving signup controls,
account-scoped drafts, file storage, stale deployments and inconsistent release
status. Several were later fixed, but they show why the old deployment and
database cannot be assumed safe by association.

The integration must not copy:

- environment files or secret values;
- production database credentials;
- existing student documents or test accounts;
- unreviewed row-level-security policies; or
- retired deployment configuration.

All secrets must be newly provisioned. Every data boundary must be retested in
the target architecture.

### 7. Both applications already contain concentration risks

The current product is small, but most interaction state lives in a large
`app/page.tsx`, most styling lives in `app/globals.css`, and the AI contract is
concentrated in `app/api/ai/route.ts`. That is manageable for the current
prototype and unsafe as the foundation for dozens of additional systems.

The legacy repository has its own large screens, hooks, dashboards and
duplicated state pathways. Copying them into the current monolith would produce
a larger monolith, not an integrated platform.

The current workspace needs controlled modularisation before major scope is
added. This must preserve the existing interface and behaviour; it is not an
excuse for an open-ended rewrite.

## What integrating the complete legacy scope would actually mean

“Integrate everything from `Simplifii-OS-Main`” sounds like a request to move
finished features from one application into another. The repositories do not
support that interpretation. The legacy repository is a mixture of application
code, partially connected prototypes, competing redesigns, database migrations,
feature-flagged experiments, generated artefacts, audit records, aspirational
architecture and product strategy. Some documents call a capability built while
other documents call the same capability partial, dormant, schema-only or unsafe.
The work is therefore not a merge and not a conventional migration. It is the
reconstruction of a very broad product portfolio from requirements that first
have to be reconciled.

The scale difference is material. An `scc` inventory of the legacy working tree,
excluding Git metadata and dependencies, reports 557,001 physical lines across
2,741 counted files, including 166,664 lines of JavaScript, 116,496 lines of JSX,
52,742 lines of CSS, 97,778 lines of Markdown, 56,330 lines of HTML and 34,984
lines of YAML. The same inventory reports 443,676 lines classified as code. The
current writing workspace's implementation files contain approximately 6,400
physical lines of TypeScript, JavaScript and CSS, excluding this documentation.
The figures do not mean that the legacy repository contains 557,001 lines of
valuable functionality. They demonstrate the opposite problem: finding the
authoritative, production-worthy behaviour inside that volume is itself a major
engineering and product-analysis task. The inventory was captured with `scc`
while excluding Git metadata and dependencies; file-reference counts use
`git ls-files` and `rg`, so exact totals may move with the repository snapshot.

The legacy system map names eleven domains: onboarding, dashboard,
transformation, canvas, tools, AURA, export, integrity reporting, support,
community and profile/growth. Other specifications add multiple education tiers,
course planning, exam preparation, curriculum data, accessibility adaptation,
offline operation, voice, research search, predictive modelling, an AI-literacy
passport, institutional assurance, standards conformance, policy monitoring,
payments and LMS integration. Collectively, that is not one application feature
set. It is several student products, an AI and data platform, a safeguarding
surface and an institutional analytics product sharing a name.

For planning purposes, “all scope” must be frozen to the repository at commit
`8fc23c3` and then reduced to a human-approved capability register. A later Jira
ticket, meeting transcript, ChatGPT conversation, Claude artefact, strategy
document or redesign is a change request, not an automatic reinterpretation of
the estimate. Without that boundary, the target can expand faster than any team
can build it and no delivery date has meaning.

### The production-code reuse verdict

The integration policy is **zero direct production-code reuse** from
`Simplifii-OS-Main`. No legacy runtime component, route, store, service or schema
is approved to be copied or adapted into the successor application.

That does not mean every legacy idea has no value. The useful assets are the
problem statements, user journeys, sample assessment documents, terminology,
research references, screenshots, acceptance ideas and records of what confused
testers. Those can inform a new implementation. Some pure calculations may also
be understandable enough to re-express after their assumptions have been
verified. None of that justifies copying a component, service, store, endpoint or
schema into this repository and declaring the feature integrated.

Any apparent exception would have to pass a strict extraction test. The code
would need to be framework-independent, side-effect-free, covered by meaningful
tests, free of legacy global state, free of Supabase and Railway assumptions,
compatible with the current licence and dependency set, and demonstrably aligned
with an accepted current requirement. It would then need fresh tests in this
repository. In practice, verifying all those conditions and adapting the code is
usually more expensive and riskier than implementing the small behaviour again
from an explicit contract. Even where an algorithm inspires the new code, this
should be described as a from-contract reimplementation of behaviour, not code
reuse.

This distinction matters because counting copied files would create a false
sense of progress. A legacy React card can render correctly while reading stale
state, bypassing the current AI contract, failing on refresh, exposing another
user's data model, or contradicting the one-interface design. The visual result
may look integrated while the product underneath is less coherent and less safe.
The integration metric must be an end-to-end student outcome with tests, not the
number of old components imported.

The old repository should therefore be frozen and treated as an evidence
archive. It should not become a package dependency, Git subtree, source folder or
second runtime inside the current application. No build configuration, lockfile,
environment file, database migration, authentication provider, state store or
deployment manifest should cross the boundary. If a capability is accepted, its
observable behaviour is specified and built natively in the current TypeScript
architecture.

The inspected legacy snapshot also contains third-party reference builds, PDFs
and design assets without a root `LICENSE` or `NOTICE` explaining all bundled
material. This says nothing conclusive about ownership of the application code,
but every third-party asset and dependency would need a provenance and permission
review before copying. Requirements can be retained without importing those
unknown obligations into the new runtime.

### Why direct reuse fails technically

#### Runtime and framework mismatch

The applications are built around different generations and deployment models.
The current workspace uses React 19, TypeScript, vinext/Vite and compact
Vercel-compatible server routes. The legacy application uses React 18, Create
React App, mostly JavaScript, an Express server and Railway-oriented deployment,
with separate serverless-style API files also present. Its environment variables
are often build-time `REACT_APP_*` flags; the current application relies on
server-only runtime secrets and a much smaller route surface. Copying legacy JSX
would import assumptions about bundling, routing, globals, polyfills, CSS order,
server mounting and environment evaluation that do not hold here.

Resolving that mismatch is not a syntax conversion. Replacing JavaScript with
TypeScript does not establish data contracts. Changing import paths does not make
an Express handler safe in the current runtime. Installing the legacy dependency
set would introduce React-version constraints, duplicate editor packages,
browser-only libraries and SDKs for features that are not accepted. It would also
turn a small application into a dependency-maintenance problem before producing
student value.

#### State and interaction mismatch

The current product has one deliberately focused assignment workflow and stores
its assignment workspace locally in the browser. The legacy product distributes
state through React contexts, component state, local storage, IndexedDB, Zustand,
Supabase, custom events, an event bus, feature flags and duplicated service
layers. Its own audits identify dormant listeners, orphaned services, competing
cognitive-state implementations and features that are built but have no caller.
A component copied without its original state graph will not behave correctly;
copying the graph with it would reproduce the legacy architecture rather than
integrate it.

The user experience is also conceptually different. This repository treats the
assignment review, guidance and draft as the primary interface. The legacy
material alternates between a five-screen canvas product, a dashboard-led course
system, a multi-panel operating system and a 43-surface design programme. Those
are incompatible navigation and attention models. Combining their components
would make the cognitive-overload problem worse. Every accepted behaviour has to
be redesigned so it either fits the current interface or earns a new surface by
demonstrating that it genuinely cannot fit.

The coupling is measurable. The legacy `CanvasScreen.jsx` is about 3,690 lines
and imports roughly 98 modules; `AuraChatOverlay.jsx` is about 3,474 lines. The
tree references approximately 99 feature-flag names and 73 environment-variable
names. Supabase appears across roughly 166 files, browser storage across more
than 130, and EventBus or CustomEvent behaviour across more than 100. A copied
component therefore carries an invisible graph of configuration and side effects
far larger than the file itself.

#### Persistence and identity mismatch

There is no ChatGPT sign-in, user account or production database in the current
product. Testers enter an invite code; the server issues a signed 30-day cookie;
the assignment workspace stays in that browser. The legacy code assumes or
partially implements Supabase authentication, account-scoped PostgreSQL rows,
object storage, row-level security, cloud draft sync, profile data, course data,
telemetry and institutional projections.

Those systems cannot be half-adopted. A database-backed feature needs a complete
identity, ownership, authorisation, migration, backup, deletion, retention and
incident-response design. Adding a legacy table because one copied component
expects it would silently create an account platform that this MVP neither needs
nor promises. The five-month MVP must preserve invite access and browser-local
persistence. If accounts or cross-device sync are later commissioned, they are a
separate platform project with their own product decision and security review.

#### Editor and document-model mismatch

The writing workspace already has a product-specific block model, a continuous
draft view, per-block guidance, whole-draft analysis and inline red/yellow/green
annotations. The legacy canvas uses TipTap and multiple layers concerned with
sections, rich-text JSON, tiered authorship, provenance marks, preview state,
editor extensions and per-section cloud drafts. Both products use words such as
“section”, “block”, “draft” and “feedback”, but the objects do not have the same
identity or lifecycle.

An editor is a state machine, not a text box. Selection, composition, undo,
formatting, autosave, section movement, annotation ranges, paste handling,
version restoration and export must all agree on one canonical document. Trying
to place TipTap-era components beside the current editor would create two sources
of truth and make data loss likely. Desired legacy behaviours such as version
history, source links or provenance must be designed against the current document
model and implemented as new extensions of that model.

#### AI contract and “RAG” mismatch

The current AI surface performs a bounded set of structured operations:
assignment extraction, structure generation, draft allocation, guidance and
rubric-aware analysis. The legacy repository has endpoints or designs for
tutoring, rubric decoding, hidden-curriculum explanation, course planning,
question transformation, practice generation, essay scoring, rewriting,
research search, claim verification, OCR, voice, knowledge graphs, learner
modelling and more. It also refers to several model providers and to RAG-like
systems with different persistence and retrieval assumptions.

There is no single legacy AI subsystem to transplant. Each capability needs a
new schema, authorised input set, output constraints, model selection, prompt
version, uncertainty policy, latency budget, token budget, retry behaviour and
evaluation fixture. Retrieval additionally needs ingestion, chunking, stable
source identity, permissions, citation back-links, ranking, stale-index handling
and a way to show the student what evidence was actually used. Calling this RAG
does not supply those pieces. Without them, the feature is merely a prompt that
can sound authoritative.

#### Security, privacy and safeguarding mismatch

The legacy scope contains sensitive categories: learner preferences,
accessibility settings, behavioural signals, distress and crisis handling,
authorship histories, community presence, parent/child relationships and
institutional aggregates. Its documents also record historical issues involving
signup truthfulness, public file storage, row-level security, false success
states and consent ambiguity. Copying code would copy the assumptions around
those incidents without proving that the fixes remain valid in the new runtime.

Community and minors are especially not ordinary UI work. Channels, direct
messages, body doubling, accountability partners and parent sharing require
abuse reporting, blocking, moderation, audit trails, age gates, consent,
retention rules and a staffed response process. An always-visible crisis link or
phrase matcher does not constitute an operational safeguarding system. These
features cannot be inherited from schemas or mock screens and cannot ship merely
because a component exists.

#### Design-system mismatch

The legacy repository contains multiple visual constitutions and theme
directions, including Obsidian, Lumen, Paper and Manuscript, as well as old CSS,
redesign CSS, standalone HTML mock-ups and component-local styles. Some documents
mandate a dark Obsidian interface; the current product intentionally begins with
the supplied light design. Importing legacy CSS would create conflicting tokens,
specificity problems, inaccessible colour semantics and inconsistent spacing.

The new product needs one semantic design system derived from the current
interface: typography, density, focus, motion, borders, annotations, responsive
behaviour and accessibility states. Legacy screenshots can provide comparison
material, but the styles themselves are not an asset to merge.

#### Status and specification mismatch

The legacy repository repeatedly labels different files as canonical. One spec
says five screens and removes voice, social features and multiple controls;
later roadmaps revive voice, community, learner models, institutional layers and
additional surfaces. The system map describes features as built, partial,
to-build or schema-only. The dormant-organs audit reports roughly 115 items that
exist but are never wired, including duplicate services and flags whose values
are never read. Other audits document false-success paths where the interface
reported completion despite missing or failed data.

This makes source presence a poor indicator of feature maturity. Before rebuilding
anything, a human product owner must choose the requirement and define its
acceptance criteria. Code cannot decide whether an abandoned prototype, a later
strategy document or the current writing workflow is authoritative.

### Scope-by-scope rebuild required for full coverage

The following workstreams describe what “all the scope” actually expands into.
They are not all part of the five-month MVP. They show why complete legacy parity
would require a programme of independent releases.

#### 1. Import, extraction and transformation

The useful core is the ability to ingest a brief, rubric, course outline,
formatting guide and optional draft, then show what was understood. Full legacy
coverage extends this into OCR, document classification, multi-document authority
rules, course synthesis, curriculum extraction, assessment splitting, confidence
scoring, source provenance and correction workflows across many document
formats. It also claims coverage across university, TAFE and school materials,
which use different terminology, calendars, grading structures and assessment
patterns.

The new implementation would need a canonical extraction schema, per-field
evidence, explicit confidence, document-level prompt-injection defence, fixtures
for representative courses and deterministic fallbacks. It would need to
distinguish “not found”, “not applicable”, “ambiguous” and “failed to read”. A
single impressive demonstration is not sufficient. Every field later used for a
deadline, task, rubric judgement or export has to remain traceable to a document
or a student correction.

#### 2. Course home, dashboard, dates and planning

The legacy dashboard scope includes course cards, every assessment, due dates,
weights, a term calendar, “up next”, overdue handling, time-aware plans, focus
mode, energy-aware pacing, reminders, browser notifications and cross-task
nudges. Implementing it requires more than drawing cards. The system must resolve
date ambiguity, time zones, teaching weeks, extensions, changed due dates,
dependencies, word-count targets and the difference between a requirement and an
action.

The current writing workspace can feed a restrained assignment switcher and one
meaningful next action. Rebuilding the wider planner would require a local
course/assessment model, scheduling rules, correction UI, notification consent,
recovery and tests for conflicting documents. If the dashboard becomes a second
place where requirements and progress are independently computed, it will drift.
It must derive from the same accepted assignment state as the writing screen.

#### 3. Writing canvas and document intelligence

Full canvas scope includes structured sections, free drafting, block/full-draft
views, rich formatting, annotations, rubric guidance, blank-page support,
Socratic prompts, section balance, depth, structure and formatting lenses,
version history, autosave, preview, section navigation, word targets and export.
Some legacy designs additionally divide AI pre-writing, Socratic coaching and
student prose into authorship tiers.

This needs one canonical document model and a carefully specified transaction
for every edit. Annotation offsets must survive typing. Guidance must refresh
without overwriting student work or moving focus. Analysis must distinguish a
whole claim from a highlightable phrase. The block view and full draft must be
two projections of the same content. History restoration must not corrupt newer
work. These requirements sit at the most failure-sensitive part of the product;
they should extend the current workspace rather than import any old canvas code.

#### 4. Rubric, guidance and feedback intelligence

The legacy materials describe rubric translation, band-aware explanations,
hidden-curriculum decoding, essay scoring, “what is missing”, worked examples,
question approaches, feedback layers and automatic scaffold fading. These are
different pedagogical actions and should not be collapsed into one generic model
call. Nor should the product pretend to grade when it is only offering guidance.

Each action requires a purpose-specific output contract, evidence citations,
calibrated language, prohibited behaviours and evaluation sets. Guidance should
tell the student where to begin and respond to their actual writing; it should
not repeatedly paraphrase the imported brief. Rubric percentages should only be
shown when they are meaningful to the task, not as a fabricated score of the
student. A reliable system also needs regression evaluation across sparse,
contradictory and adversarial uploads, not just prompt wording that sounds
empathetic.

#### 5. AURA, tools and proactive coaching

AURA is variously described as a tutor, operating layer, hovering panel, voice
assistant, tool router, proactive next-step engine and learner-aware coach. The
tool inventory includes brief simplification, rubric translation, references,
reading aids, speaking support, question decoding, practice generation,
glossaries, multiple representations, debates, audio summaries and more. Full
coverage would require a tool registry, context assembly, permissions, priority
rules, cancellation, cost control, accessible presentation and an explanation
of why each suggestion appeared.

Proactive behaviour adds a harder class of risk: stale context can interrupt the
student with the wrong advice. A learner model can amplify a bad inference. Voice
adds streaming transcription, synthesis, latency, consent and audio retention.
The clean rebuild should begin with explicit user-triggered actions in the
existing guidance panel. Proactivity, voice and adaptive orchestration only
follow after the underlying actions are individually reliable and measurable.

#### 6. Sources, research, citations and retrieval

Legacy scope includes a source library, search across open academic services,
Zotero connection, uploaded readings, source-type classification, citation
styles, claim-to-source links, source integrity, open textbooks and RAG over
course materials. This is an entire research workflow. It needs stable source
records, deduplication, metadata correction, file and URL ingestion, chunking,
retrieval evaluation, quotation boundaries, page-level locators and licensing
rules.

Search results cannot be treated as evidence until the student can inspect the
source. Generated citations must never invent metadata. Retrieval must respect
the active assignment and distinguish supplied course readings from general web
material. A minimum useful release might let a student attach sources to one
assignment and export accurate references. Open-database search, Zotero,
knowledge graphs and cross-course retrieval are later systems, not components to
copy into the first release.

#### 7. Provenance, authorship, integrity and submission

The legacy “moat” is described as a History of Thought, Work Provenance Record,
Authenticity Report, AI declaration, red-to-blue authorship transition,
claim-verification layer and signed export. These phrases conceal difficult
questions: what event is captured, whether it is complete, how edits are mapped
to text ranges, what happens offline, which model contributions are recorded,
whether the log can be altered and what can honestly be inferred from it.

A new provenance system would need an event schema, local integrity controls,
clear consent, versioning, export semantics and adversarial tests. It must avoid
claiming that telemetry proves authorship, cognition or absence of external AI.
Cryptographic signing can prove that a particular record has not changed since
signing; it cannot prove that the record observed every action or that a person
wrote the text. Submission adds DOCX/PDF fidelity, reference lists, cover pages,
formatting rules and recovery from export failure. This is a separate trust
programme, not a footer widget.

#### 8. Accessibility and learner-controlled adaptation

The legacy specifications cover WCAG 2.2 AA, keyboard and screen-reader support,
reduced motion, reading rulers, tints, font changes, bionic text, audio-first
output, voice input, pictograms, switch control, eye-tracking compatibility,
plain language, softer pacing and tier-dependent presentation. Some documents
also propose behavioural stress detection and automatic adaptation.

Accessibility cannot be integrated by copying a settings panel. Each control has
to apply consistently to import, review, guidance, editor, dialogs, export and
failure states. Rich-text editing and drag/reorder interactions need specific
keyboard and assistive-technology testing. Automatic adaptation must be
transparent, reversible and never infer a diagnosis. The current light interface
should remain the visual baseline while a small number of proven, user-controlled
preferences are added and tested end to end.

#### 9. Profiles, learning models and predictive systems

Legacy plans include a strengths-based profile, focus preferences, energy,
mastery, weak spots, study patterns, calibration, scaffolding fade, cognitive
load, emotional states, predictive analytics and an AI-literacy passport. Most
of those require longitudinal data and valid outcome definitions. A service file
or an event stream does not make the inference scientifically or ethically sound.

Rebuilding this scope means defining what is measured, why it benefits the
student, how it can be corrected or deleted, how long it persists and how its
validity is evaluated. It also changes the current no-account architecture: a
cross-device or cross-term profile eventually requires stable identity and
secure persistence. That decision must remain outside the current MVP. Until
there is enough evidence, the product should prefer explicit student choices and
session-local observations over hidden predictions.

#### 10. School, TAFE, curriculum and exam modes

The repository proposes primary, junior-secondary, senior-secondary, TAFE,
undergraduate and postgraduate variants, plus Australian curriculum search,
NESA exam papers, question transformation, multiple solution paths, practice
generation, rehearsal and course-specific calendars. Supporting those groups is
not a copy change. They have different safeguarding obligations, assessment
forms, vocabulary, autonomy expectations, accessibility needs and institutional
contexts.

Each tier would need its own research, content fixtures, extraction evaluation,
prompt behaviour, design testing and support policy. Exam practice adds answer
validation, marking guidance, copyright and content-source questions. A
university assignment tool should not claim universal education support until
each tier has an independently tested vertical slice.

#### 11. Support, wellbeing and community

The proposed support directory, crisis path, body-doubling rooms,
accountability partners, community channels, direct messages, reactions and
co-working events create responsibilities well beyond the current product. A
directory needs verified service records and a revalidation schedule. Crisis
handling needs clear boundaries and real escalation information. Community needs
moderation tooling, reporting, blocking, abuse response, privacy controls and
operational staffing.

For minors, consent and safeguarding have to be enforced server-side, not merely
stated in copy. These features also necessarily introduce accounts and shared
cloud state, so they cannot coexist with the current invite-only browser-local
architecture without a separately designed platform. They should be treated as
an independent product phase after the core assignment loop is proven, not as
missing cards on the dashboard.

#### 12. Institutional, governance and commercial layers

The broadest legacy documents propose de-identified cohort analytics, UDL
assessment-quality scoring, learning-assurance evidence, institutional
dashboards, policy monitoring, LMS connectors, conformance measurement,
standards work, subscriptions and payments. This requires a second customer and
a second product. Students need private, actionable help; institutions need
governed aggregates, procurement assurances, support agreements and auditable
data boundaries.

The institutional layer would require explicit consent, tenant isolation,
minimum-cohort suppression, aggregation pipelines, administrator roles, audit
logs, contracts, security review and evidence that metrics are valid. LMS
integration adds vendor APIs, OAuth, mapping, sync conflicts and institutional
approval. Standards claims require independent governance so the product is not
simultaneously defining the rule, running the compliance check and selling the
thing being judged. Payments add billing state, entitlements, tax and support.
None of this can be inferred from a mock dashboard or a table migration.

#### 13. Offline, native, biometric and adjacent product experiments

The repository and its roadmap material also include fully offline tutoring,
local models, native iOS, multimodal and slide-deck output, lecture capture,
voice interfaces, HealthKit/Fitbit/Whoop signals, real-time stress detection,
federated learning, smart-glasses concepts, device lockdown, rewards, regulation
and arcade tools, budget/income tools, marketplaces and other adjacent product
ideas. Some
strategy backlogs go further into projects that are not part of an assignment
workspace at all. Literal repository-wide parity would therefore include
experiments with different users, hardware, operating systems, privacy risks and
commercial models.

Offline AI is not a toggle: it requires model distribution, hardware capability
detection, storage, updates, quality evaluation and a fallback for devices that
cannot run the model. Native applications require another client lifecycle,
release process, accessibility test matrix and sync strategy. Wearable or
biometric inputs introduce health-adjacent data whose consent, interpretation
and retention need specialist review; an interaction signal must not be
presented as a diagnosis or reliable measure of stress. Federated learning is a
research and infrastructure programme, not a privacy slogan.

These ideas may become separate future proposals, but they cannot be counted as
latent functionality in the old source tree. Their presence is further evidence
that “everything in the repository” is not a bounded MVP. Each would need its own
business case, target user, technical architecture, risk review and funded
release plan before it entered the successor product.

### The only credible integration method

The programme must migrate **decisions and observable behaviours**, not files.
For every proposed legacy capability, the sequence is:

1. identify the real student problem and the exact evidence for it;
2. locate every conflicting legacy description and choose one interpretation;
3. classify the capability as required for the focused MVP, later, rejected or
   an independent product;
4. define the smallest end-to-end user outcome and its failure states;
5. define a new typed contract for data, AI output and UI state;
6. decide whether it fits the current primary interface;
7. implement it from scratch in the current repository;
8. test it against real documents, accessibility needs and failure conditions;
9. observe it with invited users before expanding it; and
10. remove or replace a scope item whenever a new one is promoted into the fixed
    schedule.

Month 1 is therefore partly requirements archaeology. A feature ledger should
record the legacy claim, its source files, evidence of live wiring, contradictions,
accepted outcome, dependencies, data sensitivity and decision. Screenshots and
prototype components are evidence of an interaction idea, not proof of working
behaviour. Database migrations are evidence of a proposed storage model, not
proof that the product safely uses it. Tests are useful only after confirming
that they exercise the actual production path.

The clean architecture should be built as vertical slices around the current
student loop. The first slice remains import, understand, structure, write and
receive guidance. Planning can then derive one next action from the same
assignment state. Sources can attach to the same assignment. Export can consume
the same canonical draft. Every slice must include its data ownership, loading,
empty, success, uncertainty and failure states. Shared abstractions should be
extracted only after two real slices need them; designing the entire OS ontology
up front would recreate the legacy problem in a new language.

Legacy behaviour should be evaluated side-by-side only at the level of outcomes.
For example, the question is not whether the old `PlanChecklistTab` can be made
to render. The question is whether a tester can identify and start the next
meaningful action without losing context. It is not whether a provenance service
can emit an event. It is whether the resulting report makes a narrow, truthful,
verifiable claim. This keeps implementation accountable to the product rather
than to the volume of inherited artefacts.

### Delivery reality for complete scope

The five-month plan later in this README is already aggressive and covers only a
focused integrated MVP. It assumes one experienced full-time technical lead,
fast product decisions, protected engineering capacity with no parallel delivery
responsibilities, a frozen backlog and access to specialist review. It does not
include complete AURA orchestration, universal
education tiers, community, minors, institutional analytics, standards,
wearables, native applications, LMS integration or literal parity with every
legacy tool.

A production-quality implementation of the complete stated scope is a multi-year
programme because several workstreams require
specialists and ongoing operations rather than a one-off build. A realistic team
would include product ownership, frontend/editor engineering, backend/data and
security engineering, AI/evaluation engineering, accessibility quality
assurance, design/research and—before community, minors or institutional
claims—legal, privacy and safeguarding expertise.

As planning lower bounds rather than delivery promises, one experienced
engineer working alone should assume roughly 30–48+ months for the currently
enumerable complete scope, with severe continuity and review risk. Three
engineers with dedicated product, design and QA support should assume roughly
18–30 months. A cross-functional team of five to eight may reduce that to
roughly 12–24 months, but only with closed requirements and parallel specialist
review. Staffing does not divide the calendar linearly: coordination, migration,
integration testing and operational readiness grow with the team and the number
of products being built.

An indicative sequence after the five-month MVP would be:

- **Months 6–9:** take the MVP's minimal sources, citations, export and local
  revision history to production-grade depth, then add the most valuable
  user-triggered learning tools;
- **Months 10–14:** broaden the MVP's simple planning into evaluated retrieval,
  multi-course planning, tested accessibility preferences, multi-assessment
  continuity and selected exam workflows;
- **Months 15–20:** evaluate adaptive guidance, learner-owned longitudinal
  records, AI-literacy evidence and a production-grade but carefully bounded
  expansion of the MVP's provenance record;
- **Months 21–30:** only with dedicated staff, consider accounts, cloud sync,
  selected learner tiers, role models and shared platform foundations; and
- **Months 31–48+:** separately address community operations, LMS and
  institutional products, native clients, device or biometric experiments and
  independently governed standards work.

Those ranges are not promises. They assume scope closure and successful earlier
validation. Community moderation, institutional procurement, standards activity
and native-device work can each extend beyond them. Attempting all streams in
parallel with one developer would not compress the schedule; it would eliminate
the stable core, multiply unfinished pathways and recreate the 557,001-line
archive inside a second repository.

The non-negotiable conclusion is that `Simplifii-OS-Main` cannot be used as the
implementation foundation for this product. It is a record of ideas, experiments
and lessons. The writing workspace is the foundation. Every retained legacy
capability must justify itself against the focused assignment loop and be rebuilt
from scratch in the current architecture. Five months is the minimum credible
window for the constrained MVP below, not a commitment to absorb the full legacy
vision. “All scope” requires a funded product programme, a team and multiple
releases; presenting it as a merge would materially understate both the work and
the risk.

## Five-month integrated MVP

### Assumptions behind the estimate

The five-month estimate assumes:

- one experienced full-time engineer or technical lead;
- approximately 20 uninterrupted working weeks;
- a product owner who makes blocking decisions within 24–48 hours;
- no parallel demand for pitch decks, speculative prototypes or unrelated
  platform work from the engineer;
- one canonical MVP specification;
- access to design, security and accessibility review when required;
- controlled testing with a small invited cohort; and
- no mid-programme expansion into institutional compliance, national standards
  or a Turnitin replacement.

If the engineering role is part-time, unpaid, frequently interrupted or waiting
on product decisions, the schedule is no longer five months.

### Month 1 — Scope lock, system boundaries and stabilisation

**Objective:** turn two conflicting repositories into one buildable plan without
damaging the working assignment experience.

Work:

- freeze the legacy repository as a read-only reference;
- choose one canonical MVP specification;
- classify every requested legacy capability as keep, rebuild, defer or reject;
- document data ownership, privacy and AI-use boundaries;
- map the current import, review, structure, writing and analysis states;
- split the current page and AI route into testable modules where necessary;
- establish unit, API, browser and accessibility baselines;
- create a decision log and an acceptance test for every MVP capability;
- inventory deployment projects and remove ambiguity about the production URL;
- remove reliance on undocumented manual configuration.

**Exit gate:** the current product still works, its behaviour is covered by
tests, and there is one signed-off backlog with no “OS”, “empire” or future
platform item silently classified as MVP.

**Hard truth:** Month 1 may produce little visible new functionality. Skipping it
means paying for the same decisions repeatedly during every later month.

### Month 2 — Invite access, local persistence and security hardening

**Objective:** harden the existing no-account architecture without turning
cloud identity or database work into an undeclared requirement.

Work:

- retain the invite-code gate and signed 30-day server cookie;
- test invite expiry, invalid codes and access checks on every protected route;
- keep assignment, rubric, writing-block, draft and feedback state browser-local;
- define browser-local deletion, recovery and storage-limit behaviour;
- make the consequences of clearing browser data explicit to testers;
- add a local export/import backup only if user testing establishes the need;
- introduce server-side rate limits and model-cost controls;
- add structured logs, health checks and error reporting;
- threat-model uploaded documents and AI prompt injection;
- test interrupted saves and recovery in the same browser;
- verify that secrets and invite signing material never reach the client; and
- do not add ChatGPT sign-in, user accounts, a production database or
  cross-device sync.

**Exit gate:** an invalid invite cannot call protected endpoints, assignments
recover reliably in the same browser, local-data limitations are clear, and no
secret is exposed client-side.

### Month 3 — Course, assignment and planning integration

**Objective:** extend the focused assignment flow into a minimal study-work
system without recreating the legacy dashboard sprawl.

Work:

- harden PDF, DOCX, text and image ingestion;
- classify briefs, rubrics and supporting materials;
- extract course, assessment, date, word-limit and rubric information;
- attach confidence and source evidence to extracted facts;
- let the student correct ambiguous extraction;
- introduce the minimum course/assignment relationship;
- add a restrained assignment dashboard and one next-action calculation;
- generate a simple time-aware plan from real assessment information;
- carry the plan into the existing writing workspace;
- preserve one primary interface and avoid separate tools where the behaviour
  belongs in the writing flow.

**Exit gate:** a student can import a real assignment pack, verify what was
understood, see what matters next and enter the correct writing context without
manually reconstructing the assignment.

### Month 4 — Sources, writing intelligence and export

**Objective:** complete the core academic-work loop rather than accumulating
more planning surfaces.

Work:

- add a minimal source library linked to the active assignment;
- support citation metadata and consistent referencing output;
- add draft version history and safe restore;
- retain block-level and full-draft editing as two views of the same document;
- strengthen rubric-aware guidance, block review and inline annotations;
- add AI evaluation fixtures for extraction and feedback quality;
- record only the minimum provenance needed to explain imported material and AI
  feedback;
- avoid claiming authorship proof or integrity certification that the product
  cannot technically establish;
- build a reliable DOCX export and submission checklist;
- verify that exports contain the student's complete current draft.

**Exit gate:** a student can move from assignment documents to a supported,
referenced draft and export it without copying work between disconnected tools.

### Month 5 — Accessibility, hardening and controlled pilot

**Objective:** make the integrated MVP safe and stable enough for evidence-based
testing.

Work:

- complete keyboard, screen-reader, focus and contrast testing;
- honour reduced-motion and basic reading-comfort preferences globally;
- complete responsive/mobile navigation and editor behaviour;
- test long documents, slow networks, failed model calls and interrupted saves;
- verify rate limiting, browser-local deletion and recovery against production;
- run cost and latency tests on the real model configuration;
- remove false or unverified product claims from the interface;
- conduct a controlled pilot with a small invited cohort;
- triage defects separately from feature ideas;
- write the operational runbook and final technical handoff.

**Exit gate:** the defined end-to-end workflow passes its acceptance suite and a
small pilot can use it without engineering supervision or access to private
infrastructure.

## What the five-month MVP includes

The integrated MVP is limited to:

1. secure invite-code access and browser-local persistence;
2. assignment-material ingestion and student-confirmed extraction;
3. a minimal course and assessment model;
4. a focused dashboard showing the next meaningful assignment action;
5. time-aware assignment planning;
6. the existing block/full-draft writing workspace;
7. responsive rubric-aware guidance and analysis;
8. a minimal assignment source and citation layer;
9. draft history, recovery and DOCX export;
10. essential accessibility preferences; and
11. feedback, observability, rate limits and production verification.

This is already a substantial product. Each item affects data, UI, APIs,
testing and operations.

## What is not in the five-month MVP

The following legacy areas remain separate post-MVP initiatives unless an
existing MVP item is removed:

- 43-screen or four-theme parity
- primary, secondary, TAFE, homeschool and institutional product variants
- LMS or institution scraping/sync
- Turnitin replacement or institutional integrity enforcement
- cryptographically verified authorship reports
- continuous learner modelling and predictive analytics
- educational knowledge graphs
- native device lockdown
- community rooms, peer exchange and body doubling
- rewards, arcade and regulation applications
- budget and income tools
- full exam-practice system
- voice cloning, conversational voice mode and lecture capture
- parent/child accounts and safeguarding case management
- institutional dashboards, national standards or conformance certification
- payments, subscriptions and commercial administration

These are not “small additions after the MVP”. Several are independent products
with their own legal, safeguarding, privacy, moderation, infrastructure and
support requirements.

## Delivery risks

| Risk | Consequence | Required response |
|---|---|---|
| Scope changes during implementation | The five-month date becomes fictional | Remove equivalent work or move the date |
| Legacy files treated as production-ready | Old defects and architectural assumptions enter the new product | Rebuild behind current contracts and tests |
| Product decisions delegated to AI transcripts | Contradictory requirements and endless artefacts | One human-owned canonical backlog |
| Shared or copied credentials | Security and ownership ambiguity | Provision new secrets in the target environment |
| Cloud identity or sync slips into the MVP | A separate account, database and security programme consumes the schedule | Defer it unless scope and timeline are explicitly replaced |
| “Provenance” sold as proof | Legal and credibility exposure | Make only claims supported by measured behaviour |
| One developer also owns testing, operations and product management | Delays and unreviewed risk | Allocate decision, QA and operational support |
| User testing treated as another build system | Product remains unvalidated | Test the current flow with a small cohort |
| Every suggestion becomes a requirement | No stable definition of done | Require explicit acceptance and trade-off |

## Integration rules

1. **No wholesale code merge.** Legacy source is reference material only.
2. **The current workspace remains authoritative for the writing experience.**
3. **One primary interface remains the default.** A new surface requires a
   demonstrated interaction or information need that cannot fit coherently.
4. **No feature enters the backlog without an owner, user problem, acceptance
   test, data boundary and explicit MVP priority.**
5. **No legacy database, student data, credentials or deployment state is
   imported.**
6. **Existing student writing is never sacrificed for a migration.**
7. **AI output remains guidance, not an unreviewable product decision or claim
   of academic judgement.**
8. **A scope addition requires a scope removal or schedule change.**

## Definition of done

The integrated MVP is done when an invited student can:

1. enter the invite code and access the workspace;
2. import an assignment brief, rubric and optional existing draft;
3. verify Simplifii's understanding;
4. see one meaningful next action;
5. write in blocks or as one continuous document;
6. receive responsive rubric-aware guidance without having their work written
   for them;
7. manage the sources used for that assignment;
8. return in the same browser without losing the draft;
9. export the complete document; and
10. delete their stored work.

Anything beyond this definition belongs to a later release.

## Current development

### Requirements

- Node.js `>=22.13.0`

### Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Do not commit `.env.local` or any production secret.

### Server configuration

The application currently recognises these server-only environment variables:

- `OPENAI_API_KEY`
- `AI_MODEL`
- `SIMPLIFII_INVITE_CODE`
- `SIMPLIFII_INVITE_SESSION_SECRET`
- `RESEND_API_KEY`
- `FEEDBACK_FROM_EMAIL`
- `FEEDBACK_TO_EMAIL`

Never prefix secret values with `NEXT_PUBLIC_`.

`app/chatgpt-auth.ts`, the empty database schema and the D1 example code are
unused starter scaffolding. They are not imported by the live application and
must not be interpreted as current functionality or future requirements. They
can be removed during Month 1 cleanup; they should not be implemented.

### Verification

```bash
npm run lint
npm test
npm run build:vercel
```

Passing a build is necessary but not sufficient. Production verification must
also cover invite access, assignment import, automatic draft analysis, browser
recovery, per-block analysis, feedback delivery and complete-document export
when export is introduced.

## Handoff boundary

This repository and roadmap document the technical work required to integrate a
defined MVP subset of the legacy scope. They do not promise:

- automatic incorporation of every legacy feature;
- compatibility with the legacy database or deployment;
- delivery of features that have not been explicitly accepted;
- an unchanged deadline after scope expansion; or
- indefinite development, maintenance, user testing or operational support by
  any individual contributor.

Licensing, ownership, compensation and ongoing responsibilities must be agreed
separately. A README is technical documentation and must not be treated as an IP
assignment or employment agreement.
