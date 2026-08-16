import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `worker-${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const workerEnv = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const workerContext = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the Simplifii invite gate", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Simplifii — Assignment workspace<\/title>/i);
  assert.match(html, /Opening Simplifii…/);
  assert.match(html, /Checking access/);
  assert.match(html, /No account is needed|Checking whether this browser already has early access/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("invite code issues an expiring HttpOnly access cookie and protects AI", async () => {
  process.env.SIMPLIFII_INVITE_CODE = "test-code-12";
  process.env.SIMPLIFII_INVITE_SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
  const worker = await loadWorker();

  try {
    const entry = await worker.fetch(new Request("http://localhost/api/invite", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ code: process.env.SIMPLIFII_INVITE_CODE }),
    }), workerEnv, workerContext);
    assert.equal(entry.status, 200);
    const setCookie = entry.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /simplifii_invite_v1=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    const cookie = setCookie.split(";")[0];

    const status = await worker.fetch(new Request("http://localhost/api/invite", { headers: { cookie } }), workerEnv, workerContext);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { granted: true });
    assert.match(status.headers.get("cache-control") ?? "", /no-store/);
    assert.match(status.headers.get("vary") ?? "", /(?:^|,\s*)Cookie(?:,|$)/);

    const blockedAi = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ action: "analyse", input: {} }),
    }), workerEnv, workerContext);
    assert.equal(blockedAi.status, 401);
  } finally {
    delete process.env.SIMPLIFII_INVITE_CODE;
    delete process.env.SIMPLIFII_INVITE_SESSION_SECRET;
  }
});

test("places every word of an existing draft into blocks without rewriting it", async () => {
  const {
    blockTokens,
    projectDraftIntoBlocks,
    projectDraftIntoOneBlock,
    segmentDraft,
    writingTokens,
  } = await import(new URL("../lib/draft-structure.ts", import.meta.url));
  const draft = [
    "Introduction",
    "Sleep restriction affects attention. This paragraph explains why the question matters.",
    "Evidence",
    "Two studies report reduced accuracy. Two studies report reduced accuracy.",
  ].join("\r\n\r\n");
  const segments = segmentDraft(draft);
  const blocks = projectDraftIntoBlocks(draft, [
    { segmentIds: segments.slice(0, 2).map((segment) => segment.id), guidanceIds: ["context"] },
    { segmentIds: segments.slice(2).map((segment) => segment.id), guidanceIds: ["evidence"] },
  ], ["context", "evidence"]);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].heading, "Introduction");
  assert.equal(blocks[1].heading, "Evidence");
  assert.deepEqual(blockTokens(blocks), writingTokens(draft));

  const oneBlock = projectDraftIntoOneBlock("The opening claim is clear. The student keeps writing here.", ["all-guidance"]);
  assert.equal(oneBlock.heading, "The opening claim is clear.");
  assert.equal(oneBlock.body, "The student keeps writing here.");
  assert.deepEqual(oneBlock.guidanceIds, ["all-guidance"]);

  const repaired = projectDraftIntoBlocks(draft, [
    { segmentIds: [segments.at(-1).id, "not-a-real-segment", segments[0].id], guidanceIds: ["evidence"] },
  ], ["all-guidance"]);
  assert.deepEqual(blockTokens(repaired), writingTokens(draft));

  const punctuationDraft = `... Opening words continue. https://example.com/${"x".repeat(220)}`;
  const punctuationBlock = projectDraftIntoOneBlock(punctuationDraft, ["all-guidance"]);
  assert.equal(punctuationBlock.heading, "... Opening words continue.");
  assert.deepEqual(blockTokens([punctuationBlock]), writingTokens(punctuationDraft));

  const unbrokenDraft = `https://example.com/${"x".repeat(400)}`;
  const unbrokenBlock = projectDraftIntoOneBlock(unbrokenDraft, ["all-guidance"]);
  assert.equal(unbrokenBlock.heading, unbrokenDraft);
  assert.equal(unbrokenBlock.body, "");
  assert.deepEqual(blockTokens([unbrokenBlock]), writingTokens(unbrokenDraft));
});

test("keeps the approved P0 choices, rich editor, local assignment cache, AI wiring and light-theme contract", async () => {
  const [page, richEditor, css, layout, packageJson, aiRoute, inviteRoute, inviteAccess, envExample, gitignore, browserCache, hostingConfig, draftStructure] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/RichTextEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/invite/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/invite-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../lib/browser-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft-structure.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Simplifii structures it/);
  assert.match(page, /I’ll structure it myself/);
  assert.match(page, /function insertBlock|const insertBlock/);
  assert.match(page, /reallocateGuidance/);
  assert.match(page, /guidanceIds: \[\.\.\.anchor\.guidanceIds\]/);
  assert.match(page, /headingSource: "student"/);
  assert.match(page, /heading: ""/);
  assert.match(page, /className="block-heading-editor"/);
  assert.match(page, /data-block-heading-id/);
  assert.match(page, /this becomes the section heading/);
  assert.doesNotMatch(page, /function inferHeading/);
  assert.doesNotMatch(page, /heading: "New section"/);
  assert.doesNotMatch(page, /GUIDE · \{displayHeading/);
  assert.match(page, /ViewMode = "guide" \| "full-draft"/);
  assert.doesNotMatch(page, />Required</);
  assert.doesNotMatch(page, />Suggested</);
  assert.match(page, /fetch\("\/api\/ai"/);
  assert.match(page, /requestAi<DraftAnalysis>\("analyse"/);
  assert.match(page, /Existing draft \(optional\)/);
  assert.match(page, /Simplifii structures my draft/);
  assert.match(page, /Keep my draft in one block/);
  assert.match(page, /projectDraftIntoBlocks/);
  assert.match(page, /projectDraftIntoOneBlock/);
  assert.match(page, /"structure-draft"/);
  assert.match(page, /plannedBlocks: structurePlan/);
  assert.match(page, /file\.role !== "Current draft"/);
  assert.match(
    page,
    /if \(\/brief\|guide\|instructions\/\.test\(lower\)\) return "Assignment instructions";\s+if \(\/draft\|report-v\|submission\/\.test\(lower\)\) return "Current draft";\s+if \(\/assessment\|assignment\/\.test\(lower\)\) return "Assignment instructions";\s+if \(\/essay\/\.test\(lower\)\) return "Current draft";/,
  );
  assert.match(page, /import\("mammoth"\)/);
  assert.match(page, /reader\.readAsDataURL\(file\)/);
  assert.doesNotMatch(page, /AI_GATEWAY_API_KEY/);
  assert.match(page, /function AssignmentSwitcher/);
  assert.match(page, /Create new assignment/);
  assert.match(page, /Saved on this browser/);
  assert.match(page, /CachedAppState/);
  assert.match(page, /version: 1/);
  assert.match(page, /salvageCachedAssignments/);
  assert.match(page, /Local cache needs attention/);
  assert.match(page, /analysisResult/);
  assert.match(page, /bodyHtml/);
  assert.match(page, /annotationStateById/);
  assert.match(page, /blockAnalysis: Array/);
  assert.match(page, /blockAnalysisMap/);
  assert.match(page, /writingBlockWordCount/);
  assert.match(page, /headingSource === "student"/);
  assert.match(page, /renderableAnnotations/);
  assert.match(page, /renderedAnnotationIdsByBlock/);
  assert.match(page, /displayedAnnotations/);
  assert.match(page, /pendingAnnotationId/);
  assert.match(page, /onAnnotationsRendered=\{reportRenderedAnnotations\}/);
  assert.match(page, /currentState === "edited" \|\| firstOccurrence !== lastOccurrence/);
  assert.match(page, /RichTextBody/);
  assert.match(page, /EditorToolbar/);
  assert.match(page, /className="block-analysis/);
  assert.match(page, /className="block-findings"/);
  assert.match(page, /type ResponsiveBlockGuide/);
  assert.match(page, /guide-next-step/);
  assert.match(page, /guide-bigger-picture/);
  assert.match(page, /Review this block/);
  assert.match(page, /"analyse-block"/);
  assert.match(page, /scheduleGuidanceRefresh/);
  assert.match(page, /}, 2200\);/);
  assert.match(page, /revealAnnotation\(annotation\.id\)/);
  assert.match(page, /select a finding to jump to its highlighted text/);
  assert.match(page, /check\.met \? "✓" : "·"/);
  assert.match(page, /check\.met \? "Met: " : "Not yet met: "/);
  assert.match(page, /See \$\{annotationCount\} highlight/);
  assert.doesNotMatch(page, /activeCriterion\.weight/);
  assert.doesNotMatch(page, /coachCriterion\.weight/);
  assert.doesNotMatch(page, /criterion\.weight}%/);
  assert.match(page, /Nothing is rewritten for you\. What changes is your call\./);
  assert.match(page, /onRemove=\{removeBlock\}/);
  assert.match(page, /Natural height/);
  assert.match(page, />Remove</);
  assert.match(page, /assignmentMenu=/);
  assert.match(page, /function InviteBoundary/);
  assert.match(page, /Enter your invite code\./);
  assert.match(page, /No account is needed/);
  assert.match(page, /type="password"/);
  assert.match(page, /fetch\("\/api\/invite"/);
  assert.doesNotMatch(page, /SIMPLIFII_INVITE_CODE/);

  assert.match(browserCache, /simplifii-local-workspaces-v1/);
  assert.match(browserCache, /window\.caches\.open/);
  assert.match(browserCache, /window\.localStorage/);
  assert.match(browserCache, /__simplifii_cache__\/materials/);
  assert.match(browserCache, /prepareBrowserCache/);
  assert.match(browserCache, /writeBrowserJournal/);
  assert.match(browserCache, /externaliseMaterials/);
  assert.match(browserCache, /MissingMaterialError/);
  assert.match(browserCache, /quarantineUnreadableBrowserCache/);
  assert.match(browserCache, /readBrowserCache/);
  assert.match(browserCache, /writeBrowserCache/);
  assert.equal(JSON.parse(hostingConfig).d1, null);

  assert.match(aiRoute, /generateText/);
  assert.match(aiRoute, /Output\.object/);
  assert.match(aiRoute, /createOpenAI/);
  assert.match(aiRoute, /process\.env\.OPENAI_API_KEY/);
  assert.match(aiRoute, /type: "file" as const/);
  assert.match(aiRoute, /existing_draft_blocks/);
  assert.match(aiRoute, /rubric_feedback/);
  assert.match(aiRoute, /encouragement/);
  assert.match(aiRoute, /nextStep/);
  assert.match(aiRoute, /biggerPicture/);
  assert.match(aiRoute, /calm, empathetic writing coach/i);
  assert.match(aiRoute, /Do not limit guidance to sentences that could receive an inline highlight/i);
  assert.match(aiRoute, /Do not mention criterion weights, percentages, estimated marks or grades/i);
  assert.match(aiRoute, /body\.action === "analyse-block"/);
  assert.match(aiRoute, /type BlockAnalysis/);
  assert.match(aiRoute, /blockAnalysis: BlockAnalysis\[\]/);
  assert.match(aiRoute, /checklist: Array/);
  assert.match(aiRoute, /minItems: 3/);
  assert.match(aiRoute, /maxItems: 6/);
  assert.match(aiRoute, /allowedBlockIds\.has\(item\.blockId\)/);
  assert.match(aiRoute, /return input\.blocks\.map\(\(block\) =>/);
  assert.match(aiRoute, /There is no writing to assess in this block yet\./);
  assert.match(aiRoute, /checklist: checklist\.slice\(0, 6\)/);
  assert.match(aiRoute, /derive each check from the imported rubric and requirements/i);
  assert.match(aiRoute, /rubric criteria as the authority for analysis and priority/i);
  assert.match(aiRoute, /do not grade a block merely against the assignment brief/i);
  assert.match(aiRoute, /mark every checklist item false/i);
  assert.match(aiRoute, /annotations/);
  assert.match(aiRoute, /severity: "high" \| "med" \| "low"/);
  assert.match(aiRoute, /block\.body\.lastIndexOf\(anchor\) !== start/);
  assert.match(aiRoute, /Never rewrite the student's prose/);
  assert.match(aiRoute, /segmentIds/);
  assert.match(aiRoute, /file\.role !== "Current draft"/);
  assert.match(aiRoute, /Never rewrite the student's prose/);
  assert.match(aiRoute, /checkInviteAccess/);
  assert.match(aiRoute, /status: 401/);
  assert.match(inviteRoute, /export async function GET/);
  assert.match(inviteRoute, /export async function POST/);
  assert.match(inviteRoute, /set-cookie/);
  assert.match(inviteRoute, /cache-control/);
  assert.match(inviteAccess, /process\.env\.SIMPLIFII_INVITE_CODE/);
  assert.match(inviteAccess, /process\.env\.SIMPLIFII_INVITE_SESSION_SECRET/);
  assert.match(inviteAccess, /crypto\.subtle\.digest/);
  assert.match(inviteAccess, /name: "HMAC"/);
  assert.match(inviteAccess, /parsed\.exp > now/);
  assert.match(inviteAccess, /constantTimeEqual/);
  assert.match(inviteAccess, /__Host-simplifii-invite/);
  assert.match(inviteAccess, /requestOrigin/);
  assert.match(inviteAccess, /HttpOnly/);
  assert.match(inviteAccess, /SameSite=Lax/);
  assert.doesNotMatch(inviteAccess, /NEXT_PUBLIC_/);
  assert.match(envExample, /^OPENAI_API_KEY=/m);
  assert.match(envExample, /^AI_MODEL=gpt-5\.6-terra/m);
  assert.match(envExample, /^SIMPLIFII_INVITE_CODE=$/m);
  assert.match(envExample, /^SIMPLIFII_INVITE_SESSION_SECRET=$/m);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(packageJson, /"ai"/);
  assert.match(packageJson, /"@ai-sdk\/openai"/);
  assert.match(draftStructure, /projectDraftIntoBlocks/);
  assert.match(draftStructure, /projectDraftIntoOneBlock/);
  assert.match(draftStructure, /MAX_DRAFT_BLOCKS/);

  assert.match(richEditor, /contentEditable/);
  assert.match(richEditor, /role="textbox"/);
  assert.match(richEditor, /sanitiseEditorHtml/);
  assert.match(richEditor, /editorHtmlMatchesValue/);
  assert.match(richEditor, /buildEditorTextIndex/);
  assert.match(richEditor, /node\.tagName === "BR"/);
  assert.match(richEditor, /replace\(\/ \*\\n \*\/g, "\\n"\)/);
  assert.match(richEditor, /replace\(\/\\n\+\/g, "\\n"\)/);
  assert.match(richEditor, /onAnnotationsRendered/);
  assert.match(richEditor, /querySelectorAll<HTMLElement>\("mark\[data-annotation-id\]"\)/);
  assert.match(richEditor, /textNode\.data\.replaceAll\("\\u00a0", " "\)/);
  assert.match(richEditor, /captureSelection/);
  assert.match(richEditor, /restoreSelection/);
  assert.match(richEditor, /onPaste=\{handlePaste\}/);
  assert.match(richEditor, /onDrop=\{handleDrop\}/);
  assert.match(richEditor, /combined\.lastIndexOf\(annotation\.anchor\) !== start/);
  assert.match(richEditor, /if \(state === "open"\) wrapAnnotation/);
  assert.match(richEditor, /mark\.dataset\.annotationId/);
  assert.match(richEditor, /annotation-mark annotation-\$\{annotation\.severity\}/);
  assert.match(richEditor, /"undo" \| "redo" \| "justifyLeft"/);
  assert.match(richEditor, /aria-label="Text formatting"/);

  assert.match(css, /--bg:\s*#f6f5f2/);
  assert.match(css, /--card:\s*#ffffff/);
  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /\.annotation-high/);
  assert.match(css, /\.annotation-med/);
  assert.match(css, /\.annotation-low/);
  assert.match(css, /\.annotation-mark\.annotation-jump/);
  assert.match(css, /\.block-analysis/);
  assert.match(css, /\.block-finding/);
  assert.match(css, /\.coach-note/);
  assert.match(css, /\.criterion-focus-bar/);
  assert.match(css, /\.guidance-list \{ list-style: none; display: grid;/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
  assert.match(layout, /lang="en-AU"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
