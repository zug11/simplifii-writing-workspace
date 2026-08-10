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

test("server-renders the Simplifii import flow", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Simplifii — Assignment workspace<\/title>/i);
  assert.match(html, /Add what your course gave you\./);
  assert.match(html, /Assignment material/);
  assert.match(html, /Read assignment/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the approved P0 choices, local assignment cache, AI wiring and light-theme contract", async () => {
  const [page, css, layout, packageJson, aiRoute, envExample, gitignore, browserCache, hostingConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../lib/browser-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
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
  assert.match(page, /assignmentMenu=/);

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
  assert.match(aiRoute, /process\.env\.AI_GATEWAY_API_KEY/);
  assert.match(aiRoute, /type: "file" as const/);
  assert.match(aiRoute, /Never rewrite the student's prose/);
  assert.match(envExample, /^AI_GATEWAY_API_KEY=/m);
  assert.match(envExample, /^AI_MODEL=openai\/gpt-5\.6-terra/m);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(packageJson, /"ai"/);

  assert.match(css, /--bg:\s*#f6f5f2/);
  assert.match(css, /--card:\s*#ffffff/);
  assert.match(css, /color-scheme:\s*light/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
  assert.match(layout, /lang="en-AU"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
