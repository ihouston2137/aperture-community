import assert from "node:assert/strict";
import test from "node:test";
import { staticHtmlTitle } from "../lib/static-html-title";

test("uses the HTML title with decoded entities and normalized whitespace", () => {
  assert.equal(staticHtmlTitle('<HTML><HEAD><TITLE>Annual &amp; Financial\n Report &#8212; 2026 &copy;</TITLE></HEAD></HTML>', "file.html"), "Annual & Financial Report — 2026 ©");
});

test("ignores false titles and uses the filename when no title is provided", () => {
  assert.equal(staticHtmlTitle('<!-- <title>Fake</title> --><script>const x="<title>Fake</title>";</script><title>Actual</title>', "file.html"), "Actual");
  assert.equal(staticHtmlTitle('<html><head><title>  </title></head><body><svg><title>Image title</title></svg></body></html>', "file.html"), "file.html");
  assert.equal(staticHtmlTitle("<h1>Heading only</h1>", "file.html"), "file.html");
});
