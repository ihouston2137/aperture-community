import assert from "node:assert/strict";
import test from "node:test";
import { MAX_STATIC_HTML_BYTES, readStaticHtml, staticHtmlResponse, staticHtmlSlug, validStaticHtmlSlug } from "../lib/static-html";

test("filenames become stable URL slugs across extensions and accents", () => {
  assert.equal(staticHtmlSlug("Annual Report.HTML"), "annual-report");
  assert.equal(staticHtmlSlug("Café project.htm"), "cafe-project");
  assert.equal(staticHtmlSlug("report.v2.html"), "report-v2");
  for (const name of ["../file.html", "folder\\file.html", "file.html.exe", ".html", "💡.html", `${"a".repeat(121)}.html`]) {
    assert.throws(() => staticHtmlSlug(name));
  }
  for (const slug of ["../file", "a/b", "A", "-x", "x-", "a--b", ""]) assert.equal(validStaticHtmlSlug(slug), false);
});

test("uploads preserve a self-contained document and reject invalid content", async () => {
  const html = '<!doctype html><html><style>body{color:red}</style><h1>Résumé</h1><script>document.title="Report"</script></html>';
  const result = await readStaticHtml(new File([html], "My Report.html", { type: "text/html" }));
  assert.equal(result.html, html);
  assert.equal(result.slug, "my-report");
  await assert.rejects(readStaticHtml(new File([], "empty.html")), /nonempty/);
  await assert.rejects(readStaticHtml(new File([new Uint8Array(MAX_STATIC_HTML_BYTES + 1)], "large.html")), /5 MB/);
  await assert.rejects(readStaticHtml(new File([new Uint8Array([255])], "bad.html")), /UTF-8/);
  await assert.rejects(readStaticHtml(new File(["\0binary"], "bad.html")), /valid HTML/);
});

test("HTML is delivered inline with origin isolation and no network access", async () => {
  const response = staticHtmlResponse("<!doctype html><h1>Report</h1>");
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await response.text(), "<!doctype html><h1>Report</h1>");
  const policy = response.headers.get("content-security-policy")!;
  assert.match(policy, /sandbox allow-scripts;/);
  assert.doesNotMatch(policy, /allow-same-origin/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
