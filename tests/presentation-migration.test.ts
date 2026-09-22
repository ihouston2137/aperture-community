import test from "node:test";
import assert from "node:assert/strict";
import { convertPublication } from "../lib/publication-migration";
import { createPublicationPage, createPublicationBlock, createTable, emptyBackground } from "../lib/publication-layout";
import { normalizeDeck, slideDimensions, newObject, newSlideBlock, normalizeSlideShadow, slideShadowFilter, duplicateSlide, fitObject } from "../lib/presentation";
import { renderPdfSlides, PdfImportError } from "../lib/pdf-presentation";
import { jsPDF } from "jspdf";
import { collectMediaRefs } from "../lib/media-usage";

const source = () => ({ title: "Fixture", status: "draft", kind: "zine", presentationSize: { width: 1440, height: 1080 }, pages: [{ ...createPublicationPage(), id: "first" }] });

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
