import test from "node:test";
import { isAllowedRequestOrigin } from "../lib/request-origin";
import { copyBlockStyles, pasteBlockStyles } from "../lib/presentation-styles";
import assert from "node:assert/strict";
import { convertPublication } from "../lib/publication-migration";
import { createPublicationPage, createPublicationBlock, createTable, emptyBackground } from "../lib/publication-layout";
import { normalizeDeck, slideDimensions, newObject, newSlide, newSlideBlock, normalizeSlideShadow, slideShadowFilter, duplicateSlide, duplicateObjects, fitObject, applySlideLayout, resizeDeck } from "../lib/presentation";
import { PDF_PAGE_SIZES, pdfDeckSize, pdfPageSlide, type PdfPageSize } from "../lib/pdf-import-layout";
import { readPdfImportResponse } from "../lib/pdf-import-response";
import { renderPdfSlides, PdfImportError } from "../lib/pdf-presentation";
import { jsPDF } from "jspdf";
import { createCanvas } from "@napi-rs/canvas";
import { collectMediaRefs } from "../lib/media-usage";

const source = () => ({ title: "Fixture", status: "draft", kind: "zine", presentationSize: { width: 1440, height: 1080 }, pages: [{ ...createPublicationPage(), id: "first" }] });

test("editable PDF conversion preserves shapes, text styles, images, and stacking through save", async () => {
  const pdf = new jsPDF({ unit: "pt", format: [600, 400], orientation: "landscape" });
  pdf.setFillColor("#ff0000"); pdf.rect(20, 20, 100, 50, "F");
  pdf.setDrawColor("#00ff00"); pdf.setLineWidth(2); pdf.ellipse(200, 100, 30, 20, "FD");
  pdf.setFont("helvetica", "bolditalic"); pdf.setFontSize(20); pdf.setTextColor("#123456"); pdf.text("Hello <world>", 40, 150);
  const image = createCanvas(20,20); image.getContext("2d").fillRect(0,0,20,20);
  pdf.addImage(image.toDataURL("image/png"), "PNG", 200, 200, 30, 30);
  let checked = false;
  await renderPdfSlides(new Uint8Array(pdf.output("arraybuffer")), async page => {
    assert.equal(page.editable?.fallbackReason, undefined);
    const entries = page.editable!.objects;
    assert.deepEqual(entries.map(entry => entry.object.type), ["block", "block", "text", "image"]);
    const saved = normalizeDeck({ title: "Editable", aspect: "custom", pageUnit: "px", customWidth: page.width, customHeight: page.height, slides: [{ ...newSlide(), objects: entries.map(entry => entry.object) }] });
    const [rectangle, ellipse, text, bitmap] = saved.slides[0].objects;
    assert.equal(rectangle.block?.type, "customShape");
    assert.equal(rectangle.block?.color, "rgba(255,0,0,1)");
    assert.match(rectangle.vectorPath!.d, /^M.*L.*Z$/);
    assert.match(ellipse.vectorPath!.d, /C/);
    assert.equal(ellipse.block?.borderColor, "rgba(0,255,0,1)");
    assert.ok(Math.abs(ellipse.block!.borderWidth! - (2 * 2560/600)/16) < 0.001);
    assert.equal(text.color, "rgba(18,52,86,1)");
    assert.equal(text.fontFamily, "Arial");
    assert.match(text.html, /font-weight:bold/);
    assert.match(text.html, /font-style:italic/);
    assert.match(text.html, /Hello &lt;world&gt;/);
    assert.ok(Math.abs(text.fontSize - 20*2560/600) < 0.001);
    assert.ok(Math.abs(rectangle.x - 20*2560/600) < 0.001);
    assert.equal(bitmap.locked, false);
    assert.equal(entries[3].png!.subarray(1,4).toString(), "PNG");
    assert.equal(entries[3].pixelWidth, 20);
    assert.ok(page.editable!.warnings.some(warning => warning.includes("fonts")));
    assert.deepEqual(duplicateSlide(saved.slides[0]).objects[0].vectorPath, rectangle.vectorPath);
    checked = true;
  }, undefined, 2560, "editable");
  assert.ok(checked);
});

test("editable PDF conversion falls back per page for clipping and block limits", async () => {
  const pdf = new jsPDF();
  pdf.text("Supported page", 10, 10);
  pdf.addPage();
  pdf.rect(10, 10, 40, 40); pdf.clip(); pdf.discardPath(); pdf.text("Clipped", 20, 20);
  pdf.addPage();
  for (let i = 0; i < 101; i++) pdf.rect(10 + i % 10, 10 + Math.floor(i/10), 1, 1, "F");
  const reasons: (string | undefined)[] = [];
  await renderPdfSlides(new Uint8Array(pdf.output("arraybuffer")), async page => {
    reasons.push(page.editable!.fallbackReason);
    if (page.editable!.fallbackReason) {
      assert.deepEqual(page.editable!.objects, []);
      assert.equal(page.png.subarray(1,4).toString(), "PNG");
    }
  }, undefined, 2560, "editable");
  assert.equal(reasons[0], undefined);
  assert.match(reasons[1]!, /clip/i);
  assert.match(reasons[2]!, /100-block/);
});

test("page-image mode does not invoke editable conversion", async () => {
  const pdf = new jsPDF(); pdf.text("Default mode", 10, 10);
  await renderPdfSlides(new Uint8Array(pdf.output("arraybuffer")), async page => {
    assert.equal(page.editable, undefined);
    assert.ok(page.png.length > 0);
  });
});

test("PDF origin check accepts the configured public origin behind a proxy", () => {
  const request = (origin?: string, extra = {}) => new Request("http://localhost:3000/api/admin/presentations/import", {
    headers: { ...(origin === undefined ? {} : { origin }), ...extra },
  });
  assert.equal(isAllowedRequestOrigin(request("http://localhost:3000")), true);
  assert.equal(isAllowedRequestOrigin(request("https://community.example"), "https://community.example/"), true);
  assert.equal(isAllowedRequestOrigin(request("https://localhost:3000"), "https://localhost:3000"), true);
  assert.equal(isAllowedRequestOrigin(request()), true);
  for (const origin of ["null", "", "https://evil.example", "https://community.example.evil.example", "https://community.example:8443", "http://community.example", "https://community.example/path", "https://user@community.example"]) {
    assert.equal(isAllowedRequestOrigin(request(origin), "https://community.example"), false, origin);
  }
  assert.equal(isAllowedRequestOrigin(request("https://evil.example", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }), "https://community.example"), false);
  assert.equal(isAllowedRequestOrigin(request("https://community.example"), "invalid configuration"), false);
});

test("PDF pages fit each supported canvas without cropping, including mixed page sizes", () => {
  for (const choice of Object.keys(PDF_PAGE_SIZES) as PdfPageSize[]) {
    const size = pdfDeckSize(choice, { width: 600, height: 800 });
    const frame = slideDimensions(size);
    for (const page of [{ number: 1, width: 600, height: 800 }, { number: 2, width: 1600, height: 900 }]) {
      const slide = pdfPageSlide(page, size, { url: "/uploads/media/page.png", id: "a".repeat(24), alt: "PDF page" });
      const deck = normalizeDeck({ title: "Import", ...size, slides: [slide] });
      const image = deck.slides[0].objects[0];
      assert.ok(image.locked);
      assert.equal(image.type, "image");
      assert.ok(Math.abs(image.width / image.height - page.width / page.height) < 0.00001);
      assert.ok(image.x >= -0.00001 && image.y >= -0.00001);
      assert.ok(image.x + image.width <= frame.width + 0.00001);
      assert.ok(image.y + image.height <= frame.height + 0.00001);
      assert.ok(Math.abs(image.x * 2 + image.width - frame.width) < 0.00001);
    }
  }
  assert.deepEqual(slideDimensions(pdfDeckSize("16:9-4k", { width: 10, height: 10 })), { width: 3840, height: 2160 });
});

test("applying and reapplying layouts preserves PDF and user content across saves", () => {
  const size = pdfDeckSize("16:9", { width: 1600, height: 900 });
  const slide = pdfPageSlide({ number: 1, width: 1600, height: 900 }, size, { url: "/uploads/media/page.png", id: "a".repeat(24), alt: "Page" });
  slide.objects.push(newSlideBlock("richText"));
  const layout = { id: "layout", name: "Header", slide: { ...newSlide(), objects: [newSlideBlock("richText")] } };
  const applied = applySlideLayout(slide, layout);
  const saved = normalizeDeck({ title: "Import", ...size, slides: [applied] });
  const reapplied = applySlideLayout(saved.slides[0], { ...layout, id: "replacement" });
  assert.equal(reapplied.objects.length, 3);
  assert.deepEqual(reapplied.objects.slice(0, 2).map(o => o.id), slide.objects.map(o => o.id));
  assert.equal(reapplied.objects[2].layoutSourceId, "replacement");
  assert.notEqual(reapplied.objects[2].id, applied.objects[2].id);
  assert.equal(duplicateSlide(reapplied).objects[2].layoutSourceId, "replacement");
  assert.equal(duplicateObjects([reapplied.objects[2]])[0].layoutSourceId, undefined);
  const full = { ...slide, objects: Array.from({ length: 100 }, () => newObject("text")) };
  assert.throws(() => applySlideLayout(full, layout), /100 blocks/);
  assert.equal(full.objects.length, 100);
});

test("resizing fits locked PDF content and layouts without changing image proportions", () => {
  const size = pdfDeckSize("16:9", { width: 1600, height: 900 });
  const slide = pdfPageSlide({ number: 1, width: 1600, height: 900 }, size, { url: "/uploads/media/page.png", id: "a".repeat(24), alt: "Page" });
  const deck = normalizeDeck({ title: "Import", ...size, slides: [slide], layouts: [{ id: "layout", name: "Layout", slide: duplicateSlide(slide) }] });
  const enlarged = resizeDeck(deck, { aspect: "16:9", pageUnit: "px", resolution: "4k" }, true);
  assert.equal(enlarged.slides[0].objects[0].width, 3840);
  assert.equal(enlarged.layouts![0].slide.objects[0].width, 3840);
  assert.equal(deck.slides[0].objects[0].width, 1920);
  const portrait = resizeDeck(deck, { aspect: "9:16", pageUnit: "px" }, true).slides[0].objects[0];
  assert.equal(portrait.width, 1080);
  assert.equal(portrait.height, 607.5);
  assert.equal(portrait.y, (1920 - 607.5) / 2);
  assert.deepEqual(resizeDeck(deck, { aspect: "9:16", pageUnit: "px" }, false).slides, deck.slides);
});

test("PDF import reports gateway failures without exposing JSON parse errors", async () => {
  await assert.rejects(readPdfImportResponse(new Response("<html>Too large</html>", { status: 413 })), /too large/);
  await assert.rejects(readPdfImportResponse(new Response(null, { status: 504 })), /timed out/);
  await assert.rejects(readPdfImportResponse(Response.json({ error: "Unlock this PDF" }, { status: 400 })), /Unlock this PDF/);
  await assert.rejects(readPdfImportResponse(Response.json({ id: "invalid" })), /could not be confirmed/);
  assert.deepEqual(await readPdfImportResponse(Response.json({ id: "a".repeat(24) }, { status: 201 })), { id: "a".repeat(24) });
});

test("PDF renderer stops on a page persistence failure and honors cancellation", async () => {
  const pdf = new jsPDF(); pdf.text("One", 10, 10); pdf.addPage();
  let called = 0;
  await assert.rejects(renderPdfSlides(new Uint8Array(pdf.output("arraybuffer")), async () => { called++; throw new Error("Storage unavailable"); }), /Storage unavailable/);
  assert.equal(called, 1);
  const controller = new AbortController();
  called = 0;
  await assert.rejects(renderPdfSlides(new Uint8Array(pdf.output("arraybuffer")), async () => { called++; controller.abort(); }, controller.signal), { name: "AbortError" });
  assert.equal(called, 1);
});

test("duplicating selections preserves independent groups, content, effects and relative positions", () => {
  const originals = [newSlideBlock("shape"), newObject("line"), newObject("text")];
  originals[0].groupId = originals[1].groupId = "original-group";
  originals[1].x = 430;
  originals[0].shadow = { enabled: true, x: 4, y: 8, blur: 12, color: "#000000" };
  const copies = duplicateObjects(originals);
  assert.equal(copies[0].groupId, copies[1].groupId);
  assert.notEqual(copies[0].groupId, originals[0].groupId);
  assert.equal(copies[2].groupId, undefined);
  copies.forEach((copy, index) => {
    assert.notEqual(copy.id, originals[index].id);
    assert.equal(copy.x, originals[index].x + 20);
    assert.equal(copy.y, originals[index].y + 20);
    assert.equal(copy.width, originals[index].width);
  });
  assert.deepEqual(copies[0].shadow, originals[0].shadow);
  copies[0].shadow!.blur = 50;
  copies[0].block!.color = "#ffffff";
  assert.equal(originals[0].shadow.blur, 12);
  assert.notEqual(originals[0].block!.color, copies[0].block!.color);
});

test("style clipboard transfers appearance and effects without content or geometry", () => {
  const source = newSlideBlock("shape");
  source.block = { ...source.block!, color: "rgba(255,0,0,0.5)", borderWidth: 0.5, borderColor: "#00ff00", radius: 1 };
  source.shadow = { enabled: true, x: 8, y: -12, blur: 16, color: "#123456" };
  const clipboard = copyBlockStyles(source);
  source.shadow.blur = 99;
  const target = { ...newSlideBlock("customShape"), x: 321, width: 456, html: "Keep me", aspectLocked: true };
  target.block!.shapeSlug = "keep-shape";
  const pasted = pasteBlockStyles(target, clipboard);
  assert.equal(pasted.block!.color, "rgba(255,0,0,0.5)");
  assert.equal(pasted.block!.borderWidth, 0.5);
  assert.equal(pasted.block!.shapeSlug, "keep-shape");
  assert.equal(pasted.id, target.id);
  assert.equal(pasted.x, 321);
  assert.equal(pasted.width, 456);
  assert.equal(pasted.html, "Keep me");
  assert.equal(pasted.aspectLocked, true);
  assert.equal(pasted.shadow!.blur, 16);
  const text = pasteBlockStyles(newObject("text"), clipboard);
  assert.equal(text.borderWidth, 8);
  assert.equal(pasteBlockStyles(pasted, newObject("text")).shadow!.enabled, false);
  const legacy = { ...newObject("publication"), publication: createPublicationBlock("shape") };
  const converted = pasteBlockStyles(legacy, clipboard);
  assert.equal(converted.publication!.shapeStyle!.backgroundColor, clipboard.block!.color);
  assert.equal(pasteBlockStyles(target, converted).block!.borderWidth, 0.5);
});

test("shape aspect locks preserve proportions for fields, dragging, limits, and saving", () => {
  for (const type of ["shape", "customShape"] as const) {
    const object = { ...newSlideBlock(type), width: 400, height: 200, aspectLocked: true };
    assert.equal(fitObject(object, { width: 600 }).height, 300);
    assert.equal(fitObject(object, { height: 300 }).width, 600);
    const dragged = fitObject(object, { width: 410, height: 300 });
    assert.equal(dragged.width / dragged.height, 2);
    const bounded = fitObject(object, { height: 32000 });
    assert.equal(bounded.width, 32000);
    assert.equal(bounded.height, 16000);
    assert.equal(fitObject(object, { aspectLocked: false, width: 600 }).height, 200);
    const { deck } = convertPublication(source());
    deck.slides[0].objects = [object];
    assert.equal(normalizeDeck(deck).slides[0].objects[0].aspectLocked, true);
    assert.equal(duplicateSlide(deck.slides[0]).objects[0].aspectLocked, true);
  }
});

test("drop shadows persist for every object type and survive slide duplication", () => {
  const original = source();
  original.pages[0].blocks = [createPublicationBlock("table")];
  const { deck } = convertPublication(original);
  const objects = [
    ...deck.slides[0].objects,
    ...(["text", "image", "video", "rectangle", "ellipse", "line"] as const).map(type => newObject(type)),
    ...(["icon", "shape", "customShape", "button", "qrCode", "videoEmbed"] as const).map(type => newSlideBlock(type)),
  ];
  const shadow = { enabled: true, x: -8, y: 16, blur: 24, color: "rgba(20,30,40,0.5)" };
  deck.slides[0].objects = objects.map(object => ({ ...object, shadow }));
  const normalized = normalizeDeck(deck);
  for (const object of normalized.slides[0].objects) {
    assert.deepEqual(object.shadow, shadow);
    assert.equal(slideShadowFilter(object.shadow), "drop-shadow(-8px 16px 24px rgba(20,30,40,0.5))");
  }
  for (const object of duplicateSlide(normalized.slides[0]).objects) assert.deepEqual(object.shadow, shadow);
  const disabled = normalizeSlideShadow({ ...shadow, enabled: false });
  assert.equal(slideShadowFilter(disabled), undefined);
  assert.equal(disabled.blur, shadow.blur);
  assert.equal(slideShadowFilter(undefined), undefined);
  assert.equal(normalizeSlideShadow({ blur: -5 }).blur, 0);
  assert.equal(normalizeSlideShadow({ x: Infinity }).x, 0);
});

test("preserves canvas dimensions, geometry, rich text, links, tables and stacking", () => {
  const original = source();
  const table = { ...createPublicationBlock("table"), id: "table", x: 140, rotation: 17, zIndex: 2, table: createTable(2, 2) };
  table.table.cells[0][0].block.html = "<p>Table text</p>";
  const text = { ...createPublicationBlock("richText"), id: "text", zIndex: 1, html: "<p><strong>Example</strong></p>", clickAction: "page" as const, clickTarget: "appendix" };
  original.pages[0].blocks = [table, text];
  const backup = structuredClone(original);
  const { deck } = convertPublication(original);
  assert.deepEqual(original, backup);
  assert.deepEqual(slideDimensions(deck), { width: 1440, height: 1080 });
  assert.equal(deck.slides[0].objects[0].publication?.id, "text");
  assert.equal(deck.slides[0].objects[0].publication?.clickTarget, "appendix");
  assert.equal(deck.slides[0].objects[1].rotation, 17);
  assert.equal(deck.slides[0].objects[1].publication?.table?.cells[0][0].block.html, "<p>Table text</p>");
  assert.deepEqual(normalizeDeck(deck), deck);
});

test("materializes locked layout and repeated blocks without duplicating starter blocks", () => {
  const original = source();
  original.pages[0].templateId = "layout";
  original.pages[0].backgroundType = "none";
  const converted = convertPublication({ ...original,
    repeatedBlocks: [{ ...createPublicationBlock("qrCode"), id: "repeated" }],
    pageTemplates: [{ ...emptyBackground, id: "layout", name: "Layout", backgroundType: "image", backgroundMediaUrl: "/uploads/image.png", blocks: [
      { ...createPublicationBlock("shape"), id: "locked", locked: true },
      { ...createPublicationBlock("richText"), id: "starter", locked: false },
    ] }],
  });
  assert.equal(converted.deck.slides[0].objects.length, 2);
  assert.equal(converted.deck.slides[0].publicationBackground?.backgroundMediaUrl, "/uploads/image.png");
  assert.equal(converted.deck.layouts?.length, 1);
  assert.equal(converted.warnings.length, 1);
});

test("creates separate post variants and applies saved overrides without altering source", () => {
  const original = source();
  original.pages[0].blocks = [{ ...createPublicationBlock("image"), id: "photo", x: 20 }];
  original.pages[0].viewOverrides = { portrait: [{ id: "photo", x: 150 }] };
  const result = convertPublication({ ...original, kind: "post", postView: "portrait", postViews: [
    { id: "square", width: 1080, height: 1080 }, { id: "portrait", width: 1080, height: 1350 },
  ] });
  assert.equal(result.defaultView, "portrait");
  assert.equal(result.deck.slides[0].objects[0].x, 150);
  assert.equal(result.variants.square.slides[0].objects[0].x, 20);
  assert.deepEqual(slideDimensions(result.deck), { width: 1080, height: 1350 });
});

test("retains hidden pages, back links, media backgrounds and playback settings", () => {
  const original = source();
  original.pages.push({ ...createPublicationPage(), id: "appendix", hidden: true, showBack: true, backLabel: "Return", audioUrl: "/uploads/voice.mp3" });
  const { deck } = convertPublication({ ...original, transition: "slide", slideshow: { enabled: true, autoplay: true, loop: false, intervalMs: 9000 }, audio: { url: "/uploads/music.mp3", loop: false, autoplay: false, volume: 0.3 } });
  assert.equal(deck.slides[1].hidden, true);
  assert.equal(deck.slides[1].backLabel, "Return");
  assert.equal(deck.slides[1].audioUrl, "/uploads/voice.mp3");
  assert.equal(deck.duration, 9);
  assert.equal(deck.transition, "slide");
  assert.equal(deck.autoPlay, true);
  assert.equal(deck.loop, false);
  assert.equal(deck.audioLoop, false);
  assert.equal(deck.audioAutoplay, false);
  assert.equal(deck.audioVolume, 0.3);
});

test("empty drafts gain one slide; invalid/oversized publications fail without truncation", () => {
  assert.equal(convertPublication({ ...source(), pages: [] }).deck.slides.length, 1);
  assert.throws(() => convertPublication({ ...source(), status: "published", pages: [] }), /no pages/);
  assert.throws(() => convertPublication({ ...source(), pages: Array(201).fill(source().pages[0]) }), /200/);
  const original = source();
  original.pages[0].blocks = Array.from({ length: 101 }, () => createPublicationBlock("image"));
  assert.throws(() => convertPublication(original), /maximum 100/);
});

test("deterministic conversion retains sponsor and content references", () => {
  const original = source();
  original.pages[0].blocks = [createPublicationBlock("sponsorScroll"), { ...createPublicationBlock("story"), storyId: "a".repeat(24) }];
  assert.deepEqual(convertPublication(original), convertPublication(original));
  assert.equal(convertPublication(original).deck.slides[0].objects[1].publication?.storyId, "a".repeat(24));
});

test("media tracking reaches table cells inside a published post variant", () => {
  const table = createTable(1, 1);
  table.cells[0][0].block = { ...createPublicationBlock("image"), mediaId: "b".repeat(24), mediaUrl: "/uploads/table-image.png" };
  const urls = new Set<string>(), ids = new Set<string>();
  collectMediaRefs([{ publishedVariants: { portrait: { slides: [{ objects: [{ publication: { table } }] }] } } }], urls, ids);
  assert.ok(ids.has("b".repeat(24)));
  assert.ok(urls.has("/uploads/table-image.png"));
});

test("PDF import renders pages and rejects non-PDF input", async () => {
  await assert.rejects(() => renderPdfSlides(new Uint8Array([1, 2, 3]), async () => {}), PdfImportError);
  const pdf = new jsPDF(); pdf.text("Slide one", 10, 10); pdf.addPage(); pdf.text("Slide two", 10, 10);
  const pages: number[] = [];
  await renderPdfSlides(new Uint8Array(pdf.output("arraybuffer")), async page => {
    pages.push(page.number);
    assert.equal(page.png.subarray(1, 4).toString(), "PNG");
    assert.ok(page.width > 0 && page.height > 0);
  });
  assert.deepEqual(pages, [1, 2]);
});
