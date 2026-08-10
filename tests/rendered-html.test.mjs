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

test("keeps the approved P0 choices and light-theme contract", async () => {
  const [page, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
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

  assert.match(css, /--bg:\s*#f6f5f2/);
  assert.match(css, /--card:\s*#ffffff/);
  assert.match(css, /color-scheme:\s*light/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/);
  assert.match(layout, /lang="en-AU"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
