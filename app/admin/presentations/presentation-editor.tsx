"use client";


import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { BlockSettingsTabs, type BlockSettingsTab } from "./block-settings-tabs";
import { ShapeToolbar } from "./shape-toolbar";
import { PublicationFields } from "./publication-fields";
import { PresentationSources } from "./slide-surface";
import { emptyPublicationSources, type PublicationSources } from "@/components/publication-blocks";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  PAGE_PALETTE,
  BLOCK_LABELS,
} from "@/components/builder/page-block-inspector";
import { IconView } from "@/components/icons";
import type { PageBlockType } from "@/lib/page-layout";
import { SlideBlockFields } from "./slide-block-fields";
import { SlideLineControls, SlideLineFields, SlideLineHandles } from "./slide-line-fields";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/admin/editor-save";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ColorPicker } from "@/components/color-field";
import { MediaPicker } from "@/app/admin/media/media-picker";
import {
  objectBounds,
  newObject,
  lineEndpoints,
  lineFromPoints,
  type LinePoint,
  arrangeObjects,
  fitObject,
  duplicateSlide,
  newSlideBlock,
  PRESENTATION_BLOCK_TYPES,
  newSlide,
  reorderSlides,
  slideDimensions,
  migratePageSize,
  PAGE_DPI,
  MAX_PAGE_PIXELS,
  presentationDefaults,
  slideId,
  type Deck,
  type Slide,
  type SlideObject,
} from "@/lib/presentation";
import {
  Surface,
  PresentationShapes,
  ObjectContent,
  SlideShape,
  shapeHtml,
  objectStyle,
  type PresentationShape,
} from "./slide-surface";
import { PresentationPlayer } from "./presentation-player";
import { CanvasViewport } from "./canvas-viewport";
import { savePresentation } from "./actions";
import { SlideShadowFields } from "./slide-shadow-fields";
import { copyBlockStyles, pasteBlockStyles } from "@/lib/presentation-styles";

export function PresentationEditor({
  initial,
  initialSlug = "",
  view,
  sources = emptyPublicationSources,
  id,
  version = 0,

  fonts = [],
  shapes = [],
  status: initialStatus = "draft",
  published = null,
}: {
  initial: Deck;
  initialSlug?: string;
  view?: string;
  sources?: PublicationSources;
  id?: string;
  version?: number;

  fonts?: string[];
  shapes?: PresentationShape[];
  status?: "draft" | "published";
  published?: Deck | null;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [savedSlug, setSavedSlug] = useState(initialSlug);


  const [deck, setDeck] = useState(() => migratePageSize(initial));
  const [saved, setSaved] = useState(() => JSON.stringify(migratePageSize(initial)));
  const [identity, setIdentity] = useState({ id, version });
  const [pageActive, setPageActive] = useState(initial.slides[0].id);
  const [layoutActive, setLayoutActive] = useState(
    initial.layouts?.[0]?.id || "",
  );
  const [selected, setPrimary] = useState<string | null>(null);
  const [drawingLine, setDrawingLine] = useState(false);
  const [lineStart, setLineStart] = useState<LinePoint | null>(null);
  const [linePreview, setLinePreview] = useState<SlideObject | null>(null);
  const lineClick = useRef(false);
  const [selection, setSelection] = useState<string[]>([]);
  const canPublish = true;
  const canEdit = true;
  const [status, setStatus] = useState(initialStatus);
  const [publishedSnapshot, setPublishedSnapshot] = useState(published);
  const [viewportTools, setViewportTools] = useState<HTMLDivElement | null>(
    null,
  );
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    kind: "slide" | "block" | "canvas";
    id: string;
  } | null>(null);
  const draggedLayer = useRef<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [styleClipboard, setStyleClipboard] = useState<SlideObject | null>(null);
  const [layoutId, setLayoutId] = useState("");
  const [editingLayout, setEditingLayout] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportHost = useRef<HTMLDivElement>(null);
  function setSelected(id: string | null) {
    if (id !== selected) setBlockTab("content");
    if (id !== selected) setEditing(null);
    setPrimary(id);
    setSelection(id ? groupMembers(id) : []);
  }
  function locked(item: SlideObject) {
    return item.locked && !editingLayout;
  }

  const [editing, setEditing] = useState<string | null>(null);
  const [history, setHistory] = useState<Deck[]>([]);
  const [future, setFuture] = useState<Deck[]>([]);
  const [inspector, setInspector] = useState(true);
  const [media, setMedia] = useState(false);
  const [audioPicker, setAudioPicker] = useState<"deck" | "page" | null>(null);
  const [presentationSettings, setPresentationSettings] = useState(false);
  const [blockTab, setBlockTab] = useState<BlockSettingsTab>("content");
  const [dropActive, setDropActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const presentButton = useRef<HTMLButtonElement>(null);
  const draggedSlide = useRef<number | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    ids: string[];
    object: SlideObject;
    before: Deck;
    scale: number;
    mode: "move" | "resize" | "rotate" | "start" | "end";
    centerX: number;
    centerY: number;
    startAngle: number;
  } | null>(null);
  const deckRef = useRef(deck);
  const textHistory = useRef(false);
  const [emptyLayout] = useState<Slide>(() => ({
    ...newSlide(deck.defaults),
    name: "Untitled layout",
  }));
  const editableSlides = editingLayout
    ? (deck.layouts?.length
        ? deck.layouts
        : [
            {
              id: emptyLayout.id,
              name: emptyLayout.name,
              slide: emptyLayout,
            },
          ]
      ).map((l) => ({ ...l.slide, id: l.id, name: l.name }))
    : deck.slides;
  const active = editingLayout ? layoutActive : pageActive;
  function setActive(id: string) {
    if (editingLayout) setLayoutActive(id);
    else setPageActive(id);
  }
  const index = Math.max(
    0,
    editableSlides.findIndex((s) => s.id === active),
  );
  const slide = editableSlides[index] || deck.slides[0];
  function groupMembers(id: string) {
    const item = slide.objects.find((o) => o.id === id);
    return item?.groupId
      ? slide.objects.filter((o) => o.groupId === item.groupId).map((o) => o.id)
      : [id];
  }
  function editable(source: Deck) {
    return editingLayout
      ? (source.layouts?.length
          ? source.layouts
          : [
              {
                id: emptyLayout.id,
                name: emptyLayout.name,
                slide: emptyLayout,
              },
            ]
        ).map((l) => ({
          ...l.slide,
          id: l.id,
          name: l.name,
        }))
      : source.slides;
  }
  function withSlides(source: Deck, slides: Slide[]): Deck {
    return editingLayout
      ? {
          ...source,
          layouts: slides.map((s) => ({ id: s.id, name: s.name, slide: s })),
        }
      : { ...source, slides };
  }
  function switchTab(layouts: boolean) {
    cancelLine();
    setSelected(null);
    setEditing(null);
    setPresentationSettings(false);
    if (layouts && !deck.layouts?.length) {
      const item = newSlide(deck.defaults);
      item.name = "Untitled layout";
      commit({
        ...deck,
        layouts: [{ id: item.id, name: item.name, slide: item }],
      });
      setLayoutActive(item.id);
    }
    setEditingLayout(layouts);
  }
  function lockSelection(value: boolean) {
    if (!canEdit) return;
    setEditing(null);
    patchSlide({ objects: slide.objects.map((item) => selection.includes(item.id) ? { ...item, locked: value } : item) });
  }
  function groupSelection(ungroup = false) {
    const groupId = ungroup ? undefined : slideId();
    patchSlide({
      objects: slide.objects.map((o) =>
        selection.includes(o.id) && !locked(o) ? { ...o, groupId } : o,
      ),
    });
    setEditing(null);
  }
  const dimensions = slideDimensions(deck);
  const object = slide.objects.find((o) => o.id === selected);
  const dirty = JSON.stringify(deck) !== saved || slug !== savedSlug;
  const allowNavigation = useUnsavedChanges(dirty || pending);
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);
  useEffect(() => {
    if (!playing) presentButton.current?.focus();
  }, [playing]);
  function commit(next: Deck, groupText = false) {
    if (groupText && textHistory.current) {
      setDeck(next);
      return;
    }
    setHistory((h) => [...h.slice(-49), deck]);
    setFuture([]);
    setDeck(next);
    textHistory.current = groupText;
  }
  function patchSlide(patch: Partial<Slide>) {
    if (patch.background !== undefined && slide.publicationBackground) patch.publicationBackground = { ...slide.publicationBackground, backgroundType: "color", backgroundColor: patch.background };
    commit(
      withSlides(
        deck,
        editableSlides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s)),
      ),
    );
  }
  function patchObject(patch: Partial<SlideObject>, text = false) {
    if (object && locked(object)) return;
    commit(
      withSlides(
        deck,
        editableSlides.map((s) =>
          s.id === slide.id
            ? {
                ...s,
                objects: s.objects.map((o) =>
                  o.id === selected ? fitObject(o, patch) : o,
                ),
              }
            : s,
        ),
      ),
      text,
    );
  }
  function selectSlide(id: string) {
    cancelLine();
    textHistory.current = false;
    setPresentationSettings(false);
    setActive(id);
    setSelected(null);
    setEditing(null);
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [deck, ...f]);
    setDeck(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setEditing(null);
    setSelected(null);
    textHistory.current = false;
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, deck]);
    setDeck(future[0]);
    setFuture((f) => f.slice(1));
    setSelected(null);
    setEditing(null);
  }
  function removeObject() {
    if (!object) return;
    patchSlide({
      objects: slide.objects.filter(
        (o) => !selection.includes(o.id) || locked(o),
      ),
    });
    setSelected(null);
    setEditing(null);
  }
  function addObject(type: PageBlockType, position?: { x: number; y: number }) {
    cancelLine();
    const item = newSlideBlock(type, deck.defaults);
    if (type === "customShape" && shapes[0])
      item.block!.shapeSlug = shapes[0].slug;
    if (position) {
      item.x = position.x - item.width / 2;
      item.y = position.y - item.height / 2;
    }
    patchSlide({ objects: [...slide.objects, item] });
    setPresentationSettings(false);
    setSelected(item.id);
    setEditing(item.type === "text" ? item.id : null);
  }
  function addSlide(copy = false) {
    const item = copy ? duplicateSlide(slide) : newSlide(deck.defaults);
    if (editingLayout && !copy) item.name = "Untitled layout";
    const slides = [...editableSlides];
    slides.splice(index + 1, 0, item);
    commit(withSlides(deck, slides));
    selectSlide(item.id);
  }
  function moveObject(
    e: PointerEvent<HTMLDivElement>,
    item: SlideObject,
    mode: "move" | "resize" | "rotate" | "start" | "end" = "move",
  ) {
    if (
      !e.currentTarget.contains(e.target as Node) ||
      pending ||
      locked(item) ||
      e.button !== 0 ||
      (mode === "move" &&
        !e.shiftKey &&
        (e.target as Element).closest(".ql-editor"))
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    setPresentationSettings(false);
    if (e.shiftKey && mode === "move") {
      const members = groupMembers(item.id);
      const ids = selection.includes(item.id)
        ? selection.filter((id) => !members.includes(id))
        : [...new Set([...selection, ...members])];
      setSelection(ids);
      setPrimary(ids.at(-1) || null);
      setEditing(null);
      return;
    }
    const ids = selection.includes(item.id) ? selection : groupMembers(item.id);
    if (!selection.includes(item.id)) setSelected(item.id);
    setEditing(null);
    const bounds = e.currentTarget
      .closest(".deck-surface")!
      .getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ids,
      object: item,
      before: deck,
      scale: bounds.width / dimensions.width,
      mode,
      centerX:
        bounds.left +
        ((item.x + item.width / 2) * bounds.width) / dimensions.width,
      centerY:
        bounds.top +
        ((item.y + item.height / 2) * bounds.width) / dimensions.width,
      startAngle: Math.atan2(
        e.clientY -
          (bounds.top +
            ((item.y + item.height / 2) * bounds.width) / dimensions.width),
        e.clientX -
          (bounds.left +
            ((item.x + item.width / 2) * bounds.width) / dimensions.width),
      ),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moving(e: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const dx = (e.clientX - current.x) / current.scale,
      dy = (e.clientY - current.y) / current.scale;
    const item = current.object;
    const angle =
      current.object.rotation +
      ((Math.atan2(e.clientY - current.centerY, e.clientX - current.centerX) -
        current.startAngle) *
        180) /
        Math.PI;
    const rotation = ((angle + 540) % 360) - 180;
    const radians = (item.rotation * Math.PI) / 180;
    const localX = dx * Math.cos(radians) + dy * Math.sin(radians),
      localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
    const endpoints = lineEndpoints(item);
    const endpoint = current.mode === "start" || current.mode === "end" ? current.mode : null;
    const patch = endpoint
      ? lineFromPoints(item,
          endpoint === "start" ? { x: endpoints.start.x + dx, y: endpoints.start.y + dy } : endpoints.start,
          endpoint === "end" ? { x: endpoints.end.x + dx, y: endpoints.end.y + dy } : endpoints.end)
      : current.mode === "rotate"
        ? {
            rotation:
              Math.round(rotation / (e.shiftKey ? 15 : 1)) *
              (e.shiftKey ? 15 : 1),
          }
        : current.mode === "resize"
          ? {
              width: Math.max(
                1,
                Math.min(
                  32000,
                  item.type === "image" &&
                    item.imageFit !== "cover" &&
                    item.imageRatio &&
                    Math.abs(localY / item.height) >
                      Math.abs(localX / item.width)
                    ? fitObject(item, { height: item.height + localY }).width
                    : item.width + localX,
                ),
              ),
              height: Math.max(1, Math.min(32000, item.height + localY)),
            }
          : {
              x: Math.round((item.x + dx) / 5) * 5,
              y: Math.round((item.y + dy) / 5) * 5,
            };
    const next = withSlides(
        current.before,
        editable(current.before).map((s) =>
          s.id === slide.id
            ? {
                ...s,
                objects: s.objects.map((o) =>
                  current.mode === "move" &&
                  current.ids.includes(o.id) &&
                  !locked(o)
                    ? {
                        ...o,
                        x: o.x + (patch.x! - item.x),
                        y: o.y + (patch.y! - item.y),
                      }
                    : o.id === item.id
                      ? fitObject(o, patch)
                      : o,
                ),
              }
            : s,
        ),
      );
    // Pointer-up can precede the effect that mirrors state, notably in WebKit.
    deckRef.current = next;
    setDeck(next);
  }
  function endDrag(cancel = false) {
    const current = drag.current;
    if (!current) return;
    if (cancel) setDeck(current.before);
    else if (
      JSON.stringify(deckRef.current) !== JSON.stringify(current.before)
    ) {
      setHistory((h) => [...h.slice(-49), current.before]);
      setFuture([]);
    }
    drag.current = null;
  }

  function cancelLine() {
    setDrawingLine(false);
    setLineStart(null);
    setLinePreview(null);
  }
  function canvasPoint(e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) {
    const rect = e.currentTarget.querySelector(".deck-surface")!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * dimensions.width / rect.width, y: (e.clientY - rect.top) * dimensions.width / rect.width };
  }
  function placeLinePoint(e: PointerEvent<HTMLDivElement>) {
    if (!drawingLine || e.button !== 0 || !(e.target as Element).closest(".deck-surface")) return;
    e.preventDefault();
    e.stopPropagation();
    lineClick.current = true;
    const point = canvasPoint(e);
    if (!lineStart) {
      setLineStart(point);
      setLinePreview(lineFromPoints(newObject("line", deck.defaults), point, point));
    } else if (Math.hypot(point.x - lineStart.x, point.y - lineStart.y) >= 1) {
      const item = lineFromPoints(linePreview ?? newObject("line", deck.defaults), lineStart, point);
      patchSlide({ objects: [...slide.objects, item] });
      cancelLine();
      setSelected(item.id);
      setInspector(true);
    }
  }

  useEffect(() => {
    if (!menu) return;
    const element = contextMenuRef.current;
    element?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    if (element) {
      const bounds = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    }
    const dismiss = (event: Event) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("click", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("click", dismiss, true);
    };
  }, [menu]);
  function changeLayer(action: string) {
    const ids = selection.filter(
      (id) => !locked(slide.objects.find((o) => o.id === id)!),
    );
    const next = [...slide.objects];
    if (action === "Bring to front" || action === "Send to back") {
      const moving = next.filter((o) => ids.includes(o.id)),
        rest = next.filter((o) => !ids.includes(o.id));
      patchSlide({
        objects:
          action === "Bring to front"
            ? [...rest, ...moving]
            : [...moving, ...rest],
      });
      return;
    }
    if (action === "Bring forward") {
      for (let i = next.length - 2; i >= 0; i--)
        if (ids.includes(next[i].id) && !ids.includes(next[i + 1].id))
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
    } else {
      for (let i = 1; i < next.length; i++)
        if (ids.includes(next[i].id) && !ids.includes(next[i - 1].id))
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
    }
    patchSlide({ objects: next });
  }
  async function exportSlides(format: "png" | "pdf") {
    if (exporting) return;
    setExporting(true);
    setMessage("Preparing export...");
    try {
      const { toPng, getFontEmbedCSS } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const nodes = Array.from(
        exportHost.current!.querySelectorAll<HTMLElement>(".deck-surface"),
      );
      const fontEmbedCSS = await getFontEmbedCSS(nodes[0]);
      const pointsPerPixel = deck.pageUnit === "in" ? 72 / (deck.dpi ?? 144) : 0.75;
      const pdf = new jsPDF({
        orientation:
          dimensions.width >= dimensions.height ? "landscape" : "portrait",
        unit: "pt",
        format: [dimensions.width * pointsPerPixel, dimensions.height * pointsPerPixel],
      });
      const chosen =
        format === "png"
          ? [nodes[editingLayout ? nodes.length - 1 : index]]
          : nodes.slice(0, deck.slides.length);
      const name =
        (deck.title || "Presentation")
          .replace(/[^a-z0-9 -]/gi, "")
          .slice(0, 100) || "Presentation";
      for (let i = 0; i < chosen.length; i++) {
        setMessage(`Exporting page ${i + 1} of ${chosen.length}...`);
        await Promise.all(
          Array.from(chosen[i].querySelectorAll("img")).map((img) =>
            img.decode(),
          ),
        );
        // Full-library icons load asynchronously; don't capture empty placeholders.
        await new Promise<void>((resolve, reject) => {
          const ready = () => Array.from(chosen[i].querySelectorAll(".pb-icon"))
            .every((icon) => icon.querySelector("svg"));
          if (ready()) { resolve(); return; }
          const observer = new MutationObserver(() => {
            if (!ready()) return;
            observer.disconnect();
            clearTimeout(timeout);
            resolve();
          });
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("Icons are still loading. Please try exporting again."));
          }, 10000);
          observer.observe(chosen[i], { childList: true, subtree: true });
        });
        const data = await toPng(chosen[i], {
          fontEmbedCSS,
          pixelRatio: 1,
          width: dimensions.width,
          height: dimensions.height,
        });
        if (format === "png") {
          const a = document.createElement("a");
          a.href = data;
          a.download = `${name} - ${editingLayout ? "layout" : "page"} ${index + 1}.png`;
          a.click();
        } else {
          if (i)
            pdf.addPage(
              [dimensions.width * pointsPerPixel, dimensions.height * pointsPerPixel],
              dimensions.width >= dimensions.height ? "landscape" : "portrait",
            );
          pdf.addImage(
            data,
            "PNG",
            0,
            0,
            dimensions.width * pointsPerPixel,
            dimensions.height * pointsPerPixel,
          );
        }
      }
      if (format === "pdf") pdf.save(`${name}.pdf`);
      setMessage(
        "Export ready. Video and embedded content export as static previews.",
      );
    } catch {
      setMessage(
        "Export failed. Check that slide images and fonts are available, then try again.",
      );
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    function paste(e: ClipboardEvent) {
      if (pending || playing) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      const target = e.target instanceof Element ? e.target : document.body;
      const inText = !!target.closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if (!files.length && inText) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!files.length && !text) return;
      e.preventDefault();
      if (files.length) {
        startTransition(async () => {
          try {
            const data = new FormData();
            files.forEach((f) => data.append("files", f));
            const response = await fetch("/api/admin/media", {
              method: "POST",
              body: data,
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(result.error || "Image upload failed.");
            const additions: SlideObject[] = result.assets.map(
              (
                asset: {
                  _id: string;
                  url: string;
                  width: number;
                  height: number;
                },
                i: number,
              ) =>
                fitObject(newSlideBlock("image", deckRef.current.defaults), {
                  mediaId: asset._id,
                  mediaUrl: asset.url,
                  imageRatio: asset.width / asset.height || 1,
                  x: 80 + i * 24,
                  y: 80 + i * 24,
                }),
            );
            const next = {
              ...deck,
              ...withSlides(
                deck,
                editableSlides.map((s) =>
                  s.id === slide.id
                    ? { ...s, objects: [...s.objects, ...additions] }
                    : s,
                ),
              ),
            };
            next.title ||= "Untitled presentation";
            commit(next);
            setSelected(additions.at(-1)!.id);
            setEditing(null);
            const saved = await savePresentation({ ...identity, view, slug, deck: next });
            if (saved.error)
              throw new Error(
                `Images are in the media library. ${saved.error}`,
              );
            setIdentity({ id: saved.id!, version: saved.version! });
            setSlug(saved.slug!);
            setSavedSlug(saved.slug!);
            setSaved(JSON.stringify(next));
            setMessage(
              "Images pasted, stored in the media library, and linked to this presentation.",
            );
            if (!identity.id) {
              allowNavigation();
              router.replace(`/admin/presentations/${saved.id}/edit`);
            }
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Could not paste images.",
            );
          }
        });
      } else {
        const item = newSlideBlock("richText", deckRef.current.defaults);
        item.html = `<p>${text.slice(0, 50000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>")}</p>`;
        patchSlide({ objects: [...slide.objects, item] });
        setSelected(item.id);
        setEditing(item.id);
      }
    }
    window.addEventListener("paste", paste, true);
    return () => window.removeEventListener("paste", paste, true);
  });
  function save(intent: "draft" | "publish" | "unpublish" = "draft") {
    if (pending) return;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await savePresentation({ ...identity, view, slug, deck, intent });
        if (result.error) {
          setMessage(result.error);
          return;
        }

        setStatus(result.status || "draft");
        if (intent === "publish") setPublishedSnapshot(structuredClone(deck));
        if (intent === "unpublish") setPublishedSnapshot(null);
        setIdentity({ id: result.id!, version: result.version! });
        setSlug(result.slug!);
        setSavedSlug(result.slug!);
        setSaved(JSON.stringify(deck));
        setMessage(result.message!);
        if (!identity.id) {
          allowNavigation();
          router.replace(`/admin/presentations/${result.id}/edit`);
        }
      } catch {
        setMessage("Could not save. Your edits are still here.");
      }
    });
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (playing) return;
      if (e.key === "Escape") {
        cancelLine();
        setMenu(null);
        if (document.querySelector(":popover-open")) return;
        if (drag.current) endDrag(true);
        setEditing(null);
        setSelected(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (
        pending ||
        (e.target as Element).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (object && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeObject();
      } else if (
        object &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy =
          e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        patchSlide({
          objects: slide.objects.map((o) =>
            selection.includes(o.id) && !locked(o)
              ? { ...o, x: o.x + dx, y: o.y + dy }
              : o,
          ),
        });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <PresentationSources.Provider value={sources}><PresentationShapes.Provider value={shapes}>
      <div className="deck-editor" onPointerDown={() => setMenu(null)}>
        <header className="deck-header" inert={playing}>
          <Link className="btn btn-sm" href="/admin/presentations">
            Presentations
          </Link>
          <input
            className="input"
            aria-label="Presentation title"
            placeholder="Presentation title"
            value={deck.title}
            disabled={pending}
            onChange={(e) => commit({ ...deck, title: e.target.value })}
          />
          <button
            className="btn btn-primary"
            disabled={pending||!canEdit}
            onClick={() => save()}
          >
            {pending ? "Saving..." : "Save"}
          </button>
          <span className="deck-publish-state">
            {status === "published"
              ? JSON.stringify(deck) === JSON.stringify(publishedSnapshot)
                ? "Published"
                : "Published / draft changes"
              : "Draft"}
          </span>
          <button
            className="btn btn-sm"
            disabled={pending||!canEdit||!canPublish}
            onClick={() => save("publish")}
          >
            {status === "published" ? "Publish changes" : "Publish"}
          </button>
          {status === "published" && (
            <>
              <button
                className="btn btn-sm"
                disabled={pending||!canPublish}
                onClick={() => save("unpublish")}
              >
                Unpublish
              </button>
              <a
                className="btn btn-sm"
                href={`/presentations/${identity.id}${view ? `?view=${encodeURIComponent(view)}` : ""}`}
                target="_blank"
                rel="noreferrer"
              >
                View published
              </a>
            </>
          )}

          <span role="status">
            {message || (dirty ? "Unsaved changes" : "All changes saved")}
          </span>
          <button
            className="btn btn-sm"
            disabled={!history.length || pending}
            onClick={undo}
          >
            Undo
          </button>
          <button
            className="btn btn-sm"
            disabled={!future.length || pending}
            onClick={redo}
          >
            Redo
          </button>
          <button
            ref={presentButton}
            className="btn btn-sm"
            onClick={() => {
              setPresentIndex(index);
              setPlaying(true);
            }}
          >
            Present
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setInspector(!inspector)}
          >
            {inspector ? "Hide settings" : "Show settings"}
          </button>
          <div className="deck-top-section" inert={pending || playing}>
            <button className="btn btn-sm" onClick={() => addSlide()}>
              {editingLayout ? "New layout" : "New page"}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setPresentationSettings(true);
                setInspector(true);
                setSelected(null);
                setEditing(null);
              }}
            >
              Presentation settings
            </button>
            <hr />
            <div ref={setViewportTools} />
            <hr />
            <button
              className="btn btn-sm"
              disabled={exporting}
              onClick={() => exportSlides("png")}
            >
              Page PNG
            </button>
            <button
              className="btn btn-sm"
              disabled={exporting}
              onClick={() => exportSlides("pdf")}
            >
              Presentation PDF
            </button>
          </div>
        </header>
        <div
          className={`deck-body${inspector ? "" : " settings-hidden"}`}
          inert={pending || playing}
        >
          <aside className="deck-filmstrip" aria-label="Pages and layouts">
            <div role="tablist" aria-label="Presentation editing">
              <button
                role="tab"
                aria-selected={!editingLayout}
                onClick={() => switchTab(false)}
              >
                Pages
              </button>
              <button
                role="tab"
                aria-selected={editingLayout}
                onClick={() => switchTab(true)}
              >
                Layouts
              </button>
            </div>
            <p className="help-text">Drag to reorder</p>
            {editableSlides.map((s, i) => (
              <button
                type="button"
                key={s.id}
                className={`deck-thumbnail${s.id === slide.id ? " active" : ""}`}
                aria-label={`${editingLayout ? "Layout" : "Page"} ${i + 1}${s.name ? `: ${s.name}` : ""}`}
                title={s.name || undefined}
                draggable
                onDragStart={(e) => {
                  draggedSlide.current = i;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", s.id);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedSlide.current !== null)
                    commit(
                      withSlides(
                        deck,
                        reorderSlides(editableSlides, draggedSlide.current, i),
                      ),
                    );
                  draggedSlide.current = null;
                }}
                onDragEnd={() => {
                  draggedSlide.current = null;
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  selectSlide(s.id);
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    kind: "slide",
                    id: s.id,
                  });
                }}
                onClick={() => selectSlide(s.id)}
              >
                <Surface slide={s} dimensions={dimensions} />
              </button>
            ))}
          </aside>
          <main className="deck-workspace">
            <div className="deck-format">
              {!object && (
                <div className="block-palette deck-block-palette">
                  {PAGE_PALETTE.filter((item) =>
                    PRESENTATION_BLOCK_TYPES.includes(
                      item.type as PageBlockType,
                    ),
                  ).map((item) => (
                    <Fragment key={item.type}>
                    <button
                      type="button"
                      className="palette-item"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-aperture-slide-block",
                          item.type,
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onDragEnd={() => setDropActive(false)}
                      onClick={() => addObject(item.type as PageBlockType)}
                    >
                      <IconView name={item.icon} width={24} height={24} />
                      <span>{item.label}</span>
                    </button>
                    {item.type === "customShape" && (
                      <button type="button" className="palette-item" aria-pressed={drawingLine} onClick={() => {
                        if (drawingLine) cancelLine();
                        else { setDrawingLine(true); setLineStart(null); setLinePreview(null); setEditing(null); setPresentationSettings(false); }
                      }}>
                        <IconView name="Spline" width={24} height={24} />
                        <span>Line</span>
                      </button>
                    )}
                    </Fragment>
                  ))}
                </div>
              )}
              <div ref={setToolbar} />
              {object && (selection.length > 1 ? <>
                <button type="button" className="btn btn-sm" disabled={!canEdit || selection.every((id) => slide.objects.find((o) => o.id === id)?.locked)} aria-label="Lock blocks" title="Lock blocks" onClick={() => lockSelection(true)}><Lock size={18} aria-hidden="true" /></button>
                <button type="button" className="btn btn-sm" disabled={!canEdit || !selection.some((id) => slide.objects.find((o) => o.id === id)?.locked)} aria-label="Unlock blocks" title="Unlock blocks" onClick={() => lockSelection(false)}><LockOpen size={18} aria-hidden="true" /></button>
              </> : <button type="button" className="btn btn-sm" disabled={!canEdit} aria-label={object.locked ? "Unlock block" : "Lock block"} title={object.locked ? "Unlock block" : "Lock block"} onClick={() => lockSelection(!object.locked)}>
                {object.locked ? <LockOpen size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
              </button>)}

              {object && selection.length === 1 && <ShapeToolbar object={object} shapes={shapes} disabled={Boolean(locked(object)) || !canEdit} update={patchObject} onSettings={() => { setInspector(true); setPresentationSettings(false); setBlockTab("content"); }} />}
              {object?.type === "line" && selection.length === 1 && (
                <fieldset className="deck-line-toolbar" aria-label="Line settings" disabled={Boolean(locked(object))}>
                  <SlideLineControls object={object} update={patchObject} />
                </fieldset>
              )}
              {selection.length > 1 && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() => groupSelection()}
                  >
                    Group
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={
                      !slide.objects.some(
                        (o) => selection.includes(o.id) && o.groupId,
                      )
                    }
                    onClick={() => groupSelection(true)}
                  >
                    Ungroup
                  </button>
                </>
              )}
              {selection.length > 1 && (
                <div className="deck-group-tools">
                  <span>{selection.length} selected</span>
                  {[
                    "left",
                    "center",
                    "right",
                    "top",
                    "middle",
                    "bottom",
                    "distribute horizontal",
                    "distribute vertical",
                  ].map((action) => (
                    <button
                      className="btn btn-sm"
                      key={action}
                      onClick={() =>
                        patchSlide({
                          objects: arrangeObjects(
                            slide.objects,
                            selection,
                            action,
                          ),
                        })
                      }
                    >
                      {action.startsWith("distribute")
                        ? action
                        : `Align ${action}`}
                    </button>
                  ))}
                </div>
              )}
              {object && !locked(object) && selection.length === 1 && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const copy = {
                        ...object,
                        id: slideId(),
                        x: object.x + 20,
                        y: object.y + 20,
                      };
                      patchSlide({ objects: [...slide.objects, copy] });
                      setSelected(copy.id);
                      setEditing(null);
                    }}
                  >
                    Duplicate block
                  </button>
                  <button className="btn btn-sm" onClick={removeObject}>
                    Delete block
                  </button>
                  {["image", "video"].includes(object.type) && (
                    <button
                      className="btn btn-sm"
                      onClick={() => setMedia(true)}
                    >
                      Select {object.type}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="deck-scroll-area">
              <div
                className={`deck-canvas-space${dropActive ? " is-block-drop" : ""}${drawingLine ? " is-drawing-line" : ""}`}
                onPointerDownCapture={placeLinePoint}
                onPointerMoveCapture={(e) => {
                  if (drawingLine && lineStart && linePreview) {
                    e.stopPropagation();
                    setLinePreview(lineFromPoints(linePreview, lineStart, canvasPoint(e)));
                  }
                }}
                onClickCapture={(e) => {
                  if (drawingLine || lineClick.current) { e.preventDefault(); e.stopPropagation(); lineClick.current = false; }
                }}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes(
                      "application/x-aperture-slide-block",
                    )
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropActive(true);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDropActive(false);
                }}
                onDrop={(e) => {
                  const type = e.dataTransfer.getData(
                    "application/x-aperture-slide-block",
                  ) as PageBlockType;
                  setDropActive(false);
                  if (!PRESENTATION_BLOCK_TYPES.includes(type)) return;
                  e.preventDefault();
                  const rect = e.currentTarget
                    .querySelector(".deck-surface")!
                    .getBoundingClientRect();
                  addObject(type, {
                    x:
                      ((e.clientX - rect.left) * dimensions.width) / rect.width,
                    y: ((e.clientY - rect.top) * dimensions.width) / rect.width,
                  });
                }}
                onContextMenu={(e) => {
                  if (
                    !e.currentTarget.contains(e.target as Node) ||
                    (e.target as Element).closest("[data-slide-object]")
                  )
                    return;
                  e.preventDefault();
                  setSelected(null);
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    kind: "canvas",
                    id: slide.id,
                  });
                }}
                onClick={() => {
                  setSelected(null);
                  setEditing(null);
                }}
              >
                <CanvasViewport
                  key={`${dimensions.width}:${dimensions.height}`}
                  width={dimensions.width}
                  height={dimensions.height}
                  controlsTarget={viewportTools}
                  onMarquee={(rect) => {
                    const ids = slide.objects
                      .filter(
                        (o) =>
                          objectBounds(o).x < rect.x + rect.width &&
                          objectBounds(o).x + objectBounds(o).width > rect.x &&
                          objectBounds(o).y < rect.y + rect.height &&
                          objectBounds(o).y + objectBounds(o).height > rect.y,
                      )
                      .flatMap((o) => groupMembers(o.id));
                    setSelection([...new Set(ids)]);
                    setPrimary(ids.at(-1) || null);
                    setEditing(null);
                  }}
                >
                  <Surface slide={slide} dimensions={dimensions} editing>
                    {slide.objects.map((item) => (
                      <div
                        key={item.id}
                        data-slide-object={item.id}
                        className={`deck-object${item.type === "line" ? " is-line" : ""}${selection.includes(item.id) ? " selected" : ""}`}
                        style={{ ...objectStyle(item), overflow: "visible" }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!selection.includes(item.id))
                            setSelected(item.id);
                          setMenu({
                            x: e.clientX,
                            y: e.clientY,
                            kind: "block",
                            id: item.id,
                          });
                        }}
                        onPointerDown={(e) => moveObject(e, item)}
                        onPointerMove={moving}
                        onPointerUp={() => endDrag()}
                        onPointerCancel={() => endDrag(true)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPresentationSettings(false);
                          if (e.shiftKey && locked(item)) {
                            const ids = selection.includes(item.id) ? selection.filter((id) => id !== item.id) : [...selection, item.id];
                            setSelection(ids); setPrimary(ids.at(-1) || null); setEditing(null);
                          }
                          if (!e.shiftKey && !selection.includes(item.id))
                            setSelected(item.id);
                        }}
                        onDoubleClick={() => {
                          if (locked(item)) return;
                          if (item.type === "text" || item.block?.type === "shape" || item.block?.type === "customShape") setEditing(item.id);
                          else if (["image", "video"].includes(item.type))
                            setMedia(true);
                        }}
                      >
                        <div
                          className="deck-object-content"
                          style={{
                            overflow:
                              editing === item.id || item.type === "line" ? "visible" : "hidden",
                          }}
                        >
                          {selected === item.id &&
                          !locked(item) &&
                          selection.length === 1 &&
                          (item.type === "text" ||
                            ((item.block?.type === "shape" || item.block?.type === "customShape") && editing === item.id)) ? (
                            item.block?.type === "shape" ||
                            item.block?.type === "customShape" ? (
                              <SlideShape object={item}>
                                <RichTextEditor
                                  key={item.id}
                                  toolbarHost={toolbar} bare autoFocus baseSize={item.fontSize / 16}
                                  minHeight={0}
                                  fonts={fonts}
                                  placeholder="Type inside shape"
                                  value={shapeHtml(item)}
                                  onChange={(html) =>
                                    patchObject(
                                      {
                                        html,
                                        block: {
                                          ...item.block!,
                                          text: richTextToPlainText(html),
                                        },
                                      },
                                      true,
                                    )
                                  }
                                />
                              </SlideShape>
                            ) : (
                              <RichTextEditor
                                key={item.id}
                                toolbarHost={toolbar} bare autoFocus baseSize={item.fontSize / 16}
                                minHeight={0}
                                fonts={fonts}
                                value={item.html}
                                onChange={(html) => patchObject({ html }, true)}
                              />
                            )
                          ) : (
                            <ObjectContent
                              object={item}
                              onImageLoad={(ratio) => {
                                if (item.imageRatio === ratio) return;
                                setDeck((current) => ({
                                  ...withSlides(
                                    current,
                                    editable(current).map((s) =>
                                      s.id === slide.id
                                        ? {
                                            ...s,
                                            objects: s.objects.map((o) =>
                                              o.id === item.id
                                                ? fitObject(o, {
                                                    imageRatio: ratio,
                                                  })
                                                : o,
                                            ),
                                          }
                                        : s,
                                    ),
                                  ),
                                }));
                              }}
                            />
                          )}
                        </div>
                        {selected === item.id && item.type === "line" && !locked(item) && selection.length === 1 &&
                          <SlideLineHandles object={item} update={patchObject} onDrag={(e, endpoint) => moveObject(e, item, endpoint)} />}
                        {selected === item.id &&
                          item.type !== "line" &&
                          !locked(item) &&
                          selection.length === 1 && (
                            <>
                              {["top", "right", "bottom", "left"].map(
                                (edge) => (
                                  <div
                                    key={edge}
                                    className={`deck-drag-edge ${edge}`}
                                    onPointerDown={(e) => moveObject(e, item)}
                                  />
                                ),
                              )}
                              <div
                                className="deck-rotate"
                                role="button"
                                tabIndex={0}
                                aria-label="Rotate block"
                                title="Drag to rotate; hold Shift for 15-degree steps"
                                onPointerDown={(e) =>
                                  moveObject(e, item, "rotate")
                                }
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "ArrowLeft" ||
                                    e.key === "ArrowRight"
                                  ) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    patchObject({
                                      rotation:
                                        item.rotation +
                                        (e.key === "ArrowRight" ? 1 : -1) *
                                          (e.shiftKey ? 15 : 1),
                                    });
                                  }
                                }}
                              >
                                {"\u21bb"}
                              </div>
                              <div
                                className="deck-resize"
                                role="button"
                                tabIndex={0}
                                aria-label="Resize object"
                                onPointerDown={(e) =>
                                  moveObject(e, item, "resize")
                                }
                              />
                            </>
                          )}
                      </div>
                    ))}
                    {drawingLine && linePreview && <div style={{ ...objectStyle(linePreview), pointerEvents: "none", opacity: 0.65 }}><ObjectContent object={linePreview} /></div>}
                  </Surface>
                </CanvasViewport>
              </div>
              <label className="deck-notes">
                Notes
                <textarea
                  aria-label="Notes"
                  value={slide.notes}
                  onChange={(e) => patchSlide({ notes: e.target.value })}
                  placeholder="Notes for this page"
                />
              </label>
              <p className="help-text">
                {drawingLine ? (lineStart ? "Click the end point. Escape cancels." : "Click the start point, then the end point. Escape cancels.") : <>
                Page {index + 1} of {editableSlides.length}. Drag blocks to
                move; use the corner to resize and the round handle to rotate.
                Click text to edit. Shift-click blocks or Shift-drag empty
                canvas to select a group. Drag empty canvas or hold Space to
                pan; scroll the mouse wheel to zoom.</>}
              </p>
            </div>
          </main>
          {inspector && (
            <aside className="deck-inspector">
              {presentationSettings && (
                <section className="deck-presentation-settings">
                  <h3>Presentation settings</h3>{" "}
                  <label>
                    Slug
                    <input
                      aria-label="Slug"
                      type="text"
                      value={slug}
                      placeholder="Generated from title"
                      onChange={(event) => setSlug(event.target.value)}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <small>Used in the public URL. Changes take effect when saved.</small>
                  </label>
                  <label>
                    Page size{" "}
                    <select
                      aria-label="Page size"
                      value={deck.resolution === "4k" && ["16:9", "9:16"].includes(deck.aspect) ? `${deck.aspect}-4k` : deck.aspect}
                      onChange={(e) => {
                        const value = e.target.value;
                        const aspect = value.replace("-4k", "") as Deck["aspect"];
                        commit({ ...deck, aspect, pageUnit: "px", resolution: value.endsWith("-4k") ? "4k" : "hd",
                          customWidth: dimensions.width, customHeight: dimensions.height });
                      }}
                    >
                      <option value="16:9">16:9 HD &mdash; 1920 &times; 1080 px</option>
                      <option value="16:9-4k">16:9 4K &mdash; 3840 &times; 2160 px</option>
                      <option value="9:16">9:16 HD &mdash; 1080 &times; 1920 px</option>
                      <option value="9:16-4k">9:16 4K &mdash; 2160 &times; 3840 px</option>
                      <option value="4:3">4:3 &mdash; 1600 &times; 1200 px</option>
                      <option value="3:4">3:4 &mdash; 1200 &times; 1600 px</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  {deck.aspect === "custom" && (
                    <>
                      <label>Page size unit
                        <select aria-label="Page size unit" value={deck.pageUnit ?? "px"} onChange={(e) => {
                          const pageUnit = e.target.value as "px" | "in";
                          const scale = pageUnit === "in" ? deck.dpi ?? 144 : 1;
                          commit({ ...deck, pageUnit, customWidth: dimensions.width / scale, customHeight: dimensions.height / scale });
                        }}>
                          <option value="px">Pixels</option><option value="in">Inches</option>
                        </select>
                      </label>
                      {deck.pageUnit === "in" && <label>Resolution (DPI)
                        <select aria-label="Resolution (DPI)" value={deck.dpi ?? 144} onChange={(e) => {
                          const dpi = Number(e.target.value) as Deck["dpi"];
                          if ((deck.customWidth ?? 0) * dpi! > MAX_PAGE_PIXELS || (deck.customHeight ?? 0) * dpi! > MAX_PAGE_PIXELS) {
                            setMessage(`This DPI would exceed ${MAX_PAGE_PIXELS} pixels per side. Reduce the page size first.`);
                            return;
                          }
                          commit({ ...deck, dpi });
                        }}>{PAGE_DPI.map((dpi) => <option key={dpi} value={dpi}>{dpi} DPI</option>)}</select>
                      </label>}
                      {(["customWidth", "customHeight"] as const).map((key) => {
                        const label = `Page ${key === "customWidth" ? "width" : "height"} (${deck.pageUnit === "in" ? "inches" : "px"})`;
                        const min = deck.pageUnit === "in" ? 0.01 : 1;
                        const max = MAX_PAGE_PIXELS / (deck.pageUnit === "in" ? deck.dpi ?? 144 : 1);
                        return <label key={key}>{label}
                          <input className="input" type="number" min={min} max={max} step="any" aria-label={label}
                            value={deck[key] ?? (key === "customWidth" ? 1920 : 1080)}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isFinite(n) && n >= min && n <= max) commit({ ...deck, [key]: n });
                            }} />
                        </label>;
                      })}
                    </>
                  )}
                  <p className="help-text" role="status">Page resolution: {dimensions.width} &times; {dimensions.height} pixels.</p>
                  <section className="deck-default-style-settings">
                    <h4>Default styling</h4>
                    <p className="help-text">Applies to new pages and blocks. Existing pages and blocks keep their current styling.</p>
                    {([
                      ["pageBackground", "Default page background"], ["shapeBackground", "Default shape background"],
                      ["fontColor", "Default font color"], ["borderColor", "Default border color"],
                    ] as const).map(([key, label]) => <ColorPicker key={key} label={label}
                      value={presentationDefaults(deck.defaults)[key]}
                      onChange={(value) => commit({ ...deck, defaults: { ...presentationDefaults(deck.defaults), [key]: value } })} />)}
                    <label>Default font family
                      <select aria-label="Default font family" value={presentationDefaults(deck.defaults).fontFamily}
                        onChange={(e) => commit({ ...deck, defaults: { ...presentationDefaults(deck.defaults), fontFamily: e.target.value } })}>
                        <option value="">Site default</option>
                        {[...new Set([...fonts, presentationDefaults(deck.defaults).fontFamily].filter(Boolean))].map((family) => <option key={family} value={family}>{family}</option>)}
                      </select>
                    </label>
                    <label>Default font size (px)
                      <input type="number" min={1} max={512} step="any" aria-label="Default font size (px)" value={presentationDefaults(deck.defaults).fontSize}
                        onChange={(e) => {
                          const fontSize = Number(e.target.value);
                          if (Number.isFinite(fontSize) && fontSize >= 1 && fontSize <= 512)
                            commit({ ...deck, defaults: { ...presentationDefaults(deck.defaults), fontSize } });
                        }} />
                    </label>
                  </section>
                  <section className="deck-playback-settings">
                    <h4>Playback</h4>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!deck.autoPlay}
                        onChange={(e) =>
                          commit({ ...deck, autoPlay: e.target.checked })
                        }
                      />
                      Auto play
                    </label>
                    <label>
                      Default page duration (seconds)
                      <input
                        aria-label="Default page duration (seconds)"
                        type="number"
                        min="0.1"
                        max="86400"
                        step="0.1"
                        value={deck.duration ?? 5}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n >= 0.1 && n <= 86400)
                            commit({ ...deck, duration: n });
                        }}
                      />
                    </label>
                    <label>
                      Default transition
                      <select
                        aria-label="Default transition"
                        value={deck.transition || "cut"}
                        onChange={(e) =>
                          commit({
                            ...deck,
                            transition: e.target.value as Deck["transition"],
                          })
                        }
                      >
                        <option value="cut">Cut</option>
                        <option value="fade">Fade</option>
                        <option value="flip">Page Flip</option>
                      </select>
                    </label>
                    <button
                      className="btn btn-sm"
                      onClick={() => setAudioPicker("deck")}
                    >
                      Select presentation audio
                    </button>
                    {deck.audioUrl && (
                      <>
                        <audio
                          controls
                          src={protectedMediaUrl(deck.audioUrl)}
                        />
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            commit({ ...deck, audioUrl: "", audioId: "" })
                          }
                        >
                          Remove presentation audio
                        </button>
                      </>
                    )}
                  </section>
                  <p className="help-text">
                    Page size applies to the entire presentation.
                  </p>
                  <button
                    className="btn btn-sm"
                    onClick={() => setPresentationSettings(false)}
                  >
                    Back to page settings
                  </button>
                </section>
              )}
              {!presentationSettings && (
                <>
                  <h3>
                    {object
                      ? "Block settings"
                      : editingLayout
                        ? "Layout settings"
                        : "Page settings"}
                  </h3>
                  {object ? (
                    <>
                    <BlockSettingsTabs value={blockTab} onChange={setBlockTab} />
                    <fieldset
                      className="deck-object-fields"
                      disabled={Boolean(locked(object))}
                    >
                      <div role="tabpanel" id="block-panel-content" aria-labelledby="block-tab-content" hidden={blockTab !== "content"}>
                      {object.type === "line" && <SlideLineFields object={object} update={patchObject} />}
                      {object.publication && <PublicationFields pages={deck.slides} block={object.publication} update={patch => patchObject({ publication: { ...object.publication!, ...patch } })} />}
                      {object.block && (
                        <SlideBlockFields
                          shapes={shapes}
                          block={object.block}
                          update={(patch) =>
                            patchObject({
                              block: { ...object.block!, ...patch },
                              ...(patch.text !== undefined ? { html: "" } : {}),
                            })
                          }
                        />
                      )}
                      {object.type !== "line" && <section className="deck-border-fields">
                        <h4>Border</h4>
                        <label className="field">
                          Size (rem)
                          <input
                            aria-label="Border size"
                            type="number"
                            min={0}
                            max={3.125}
                            step={0.0625}
                            value={
                              object.block?.type === "shape" ||
                              object.block?.type === "customShape"
                                ? object.block.borderWidth || 0
                                : (object.borderWidth || 0) / 16
                            }
                            onChange={(e) => {
                              const value = Math.max(
                                0,
                                Math.min(3.125, Number(e.target.value)),
                              );
                              if (
                                object.block?.type === "shape" ||
                                object.block?.type === "customShape"
                              )
                                patchObject({
                                  block: {
                                    ...object.block,
                                    borderWidth: value,
                                  },
                                });
                              else patchObject({ borderWidth: value * 16 });
                            }}
                          />
                        </label>
                        <ColorPicker
                          label="Border"
                          value={
                            object.block?.type === "shape" ||
                            object.block?.type === "customShape"
                              ? object.block.borderColor
                              : object.borderColor
                          }
                          onChange={(color) =>
                            object.block?.type === "shape" ||
                            object.block?.type === "customShape"
                              ? patchObject({
                                  block: {
                                    ...object.block,
                                    borderColor: color,
                                  },
                                })
                              : patchObject({ borderColor: color })
                          }
                        />
                        <label className="field">
                          Rounding (rem)
                          <input
                            aria-label="Border rounding"
                            type="number"
                            min={0}
                            max={12.5}
                            step={0.125}
                            value={
                              object.block?.type === "shape" ||
                              object.block?.type === "customShape"
                                ? object.block.radius || 0
                                : (object.borderRadius || 0) / 16
                            }
                            onChange={(e) => {
                              const value = Math.max(
                                0,
                                Math.min(12.5, Number(e.target.value)),
                              );
                              if (
                                object.block?.type === "shape" ||
                                object.block?.type === "customShape"
                              )
                                patchObject({
                                  block: { ...object.block, radius: value },
                                });
                              else patchObject({ borderRadius: value * 16 });
                            }}
                          />
                        </label>
                      </section>}
                      {(object.type === "text" ||
                        object.block?.type === "shape" ||
                        object.block?.type === "customShape") && (
                        <label className="field">
                          Font size (rem)
                          <input
                            aria-label="Object font size"
                            type="number"
                            min={0.5}
                            max={12.5}
                            step={0.125}
                            value={object.fontSize / 16}
                            onChange={(e) =>
                              patchObject({
                                fontSize:
                                  Math.max(
                                    0.5,
                                    Math.min(12.5, Number(e.target.value)),
                                  ) * 16,
                              })
                            }
                          />
                        </label>
                      )}
                      {object.type !== "block" && object.type !== "line" && (
                        <ColorPicker
                          label="Fill"
                          value={object.fill}
                          onChange={(fill) => patchObject({ fill })}
                        />
                      )}
                      {(object.type === "text" ||
                        object.block?.type === "shape" ||
                        object.block?.type === "customShape") && (
                        <ColorPicker
                          label="Text"
                          value={object.color}
                          onChange={(color) => patchObject({ color })}
                        />
                      )}
                      {object.type === "image" && (
                        <label>
                          Image fit
                          <select
                            aria-label="Image fit"
                            value={object.imageFit || "contain"}
                            onChange={(e) =>
                              patchObject({
                                imageFit: e.target.value as "contain" | "cover",
                              })
                            }
                          >
                            <option value="contain">
                              Contain (keep image proportions)
                            </option>
                            <option value="cover">Cover (crop to box)</option>
                          </select>
                        </label>
                      )}
                      {["image", "video"].includes(object.type) && (
                        <>
                          <button
                            className="btn"
                            onClick={() => setMedia(true)}
                          >
                            Select {object.type}
                          </button>
                          <label className="field">
                            Description
                            <input
                              aria-label="Media description"
                              value={object.alt}
                              onChange={(e) =>
                                patchObject({ alt: e.target.value })
                              }
                            />
                          </label>
                        </>
                      )}
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          patchSlide({
                            objects: [
                              ...slide.objects.filter(
                                (o) => o.id !== object.id,
                              ),
                              object,
                            ],
                          })
                        }
                      >
                        Bring to front
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          patchSlide({
                            objects: [
                              object,
                              ...slide.objects.filter(
                                (o) => o.id !== object.id,
                              ),
                            ],
                          })
                        }
                      >
                        Send to back
                      </button>
                      </div>
                      <div role="tabpanel" id="block-panel-position" aria-labelledby="block-tab-position" hidden={blockTab !== "position"}>
                      {(["x", "y", "width", "height", "rotation"] as const).map(
                        (key) => (
                          <label className="field" key={key}>
                            {key === "rotation"
                              ? "Rotation (degrees)"
                              : `${key === "x" ? "Horizontal position" : key === "y" ? "Vertical position" : key === "width" ? "Width" : "Height"} (rem)`}
                            <input
                              aria-label={`Object ${key}`}
                              type="number"
                              step={key === "rotation" ? 1 : 0.125}
                              value={
                                key === "rotation"
                                  ? object[key]
                                  : Math.round((object[key] / 16) * 10000) /
                                    10000
                              }
                              onChange={(e) => {
                                const n =
                                  Number(e.target.value) *
                                  (key === "rotation" ? 1 : 16);
                                if (Number.isFinite(n))
                                  patchObject({
                                    [key]:
                                      key === "rotation"
                                        ? Math.max(-360, Math.min(360, n))
                                        : key === "width" || key === "height"
                                          ? Math.max(1, Math.min(32000, n))
                                          : Math.max(
                                              -32000,
                                              Math.min(32000, n),
                                            ),
                                  });
                              }}
                            />
                          </label>
                        ),
                      )}
                      </div>
                      <div role="tabpanel" id="block-panel-effects" aria-labelledby="block-tab-effects" hidden={blockTab !== "effects"}>
                        <SlideShadowFields object={object} update={patchObject} />
                      </div>
                    </fieldset>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        {editingLayout ? "Layout name" : "Page name"}
                        <input
                          aria-label={
                            editingLayout ? "Layout name" : "Page name"
                          }
                          value={slide.name}
                          onChange={(e) => patchSlide({ name: e.target.value })}
                        />
                      </label>
                      <ColorPicker
                        label="Background"
                        value={slide.background}
                        onChange={(background) => patchSlide({ background })}
                      />
                      {!editingLayout && (
                        <section className="deck-playback-settings">
                          <label className="field"><span><input type="checkbox" checked={!!slide.hidden} onChange={e => patchSlide({ hidden: e.target.checked })} /> Only visit through a page link</span></label>
                          {slide.hidden && <><label className="field"><span><input type="checkbox" checked={slide.showBack !== false} onChange={e => patchSlide({ showBack: e.target.checked })} /> Show return button</span></label><label className="field">Return label<input value={slide.backLabel || "Back"} onChange={e => patchSlide({ backLabel: e.target.value })} /></label></>}
                          <h4>Page playback</h4>
                          <label>
                            Duration (seconds)
                            <input
                              aria-label="Page duration (seconds)"
                              type="number"
                              min="0.1"
                              max="86400"
                              step="0.1"
                              placeholder={String(deck.duration ?? 5)}
                              value={slide.duration ?? ""}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!e.target.value)
                                  patchSlide({ duration: undefined });
                                else if (n >= 0.1 && n <= 86400)
                                  patchSlide({ duration: n });
                              }}
                            />
                          </label>
                          <label>
                            Transition
                            <select
                              aria-label="Page transition"
                              value={slide.transition || ""}
                              onChange={(e) =>
                                patchSlide({
                                  transition:
                                    (e.target.value as Slide["transition"]) ||
                                    undefined,
                                })
                              }
                            >
                              <option value="">Presentation default</option>
                              <option value="cut">Cut</option>
                              <option value="fade">Fade</option>
                              <option value="flip">Page Flip</option>
                            </select>
                          </label>
                          <button
                            className="btn btn-sm"
                            onClick={() => setAudioPicker("page")}
                          >
                            Select page audio
                          </button>
                          {slide.audioUrl && (
                            <>
                              <audio
                                controls
                                src={protectedMediaUrl(slide.audioUrl)}
                              />
                              <label>
                                <input
                                  type="checkbox"
                                  checked={!!slide.waitForAudio}
                                  onChange={(e) =>
                                    patchSlide({
                                      waitForAudio: e.target.checked,
                                    })
                                  }
                                />
                                Wait for audio to finish
                              </label>
                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  patchSlide({
                                    audioUrl: "",
                                    audioId: "",
                                    waitForAudio: false,
                                  })
                                }
                              >
                                Remove page audio
                              </button>
                            </>
                          )}
                        </section>
                      )}
                    </>
                  )}
                  {object?.locked && !editingLayout && (
                    <p className="help-text">
                      This block is locked. Use Unlock block in the toolbar to edit it.
                    </p>
                  )}
                  {editingLayout && object && (
                    <label className="deck-lock-setting">
                      <input
                        type="checkbox"
                        checked={!!object.locked}
                        onChange={(e) =>
                          patchObject({ locked: e.target.checked })
                        }
                      />
                      Lock editing on pages
                    </label>
                  )}
                  {!object && !editingLayout && (
                    <section className="deck-layout-settings">
                      <h4>Page layout</h4>
                      <select
                        aria-label="Page layout"
                        value={layoutId}
                        onChange={(e) => setLayoutId(e.target.value)}
                      >
                        <option value="">Select layout</option>
                        {deck.layouts?.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-sm"
                        disabled={!deck.layouts?.some((l) => l.id === layoutId)}
                        onClick={() => {
                          const layout = deck.layouts?.find(
                            (l) => l.id === layoutId,
                          );
                          if (!layout) return;
                          const copy = duplicateSlide(layout.slide);
                          patchSlide({
                            objects: copy.objects,
                            background: copy.background,
                          });
                          setSelected(null);
                        }}
                      >
                        Apply layout
                      </button>
                    </section>
                  )}
                  {!object && (
                    <>
                      <h4>Blocks on this page</h4>
                      {[...slide.objects].reverse().map((o) => (
                        <button
                          key={o.id}
                          className="deck-layer"
                          draggable={!locked(o)}
                          onDragStart={(e) => {
                            if (locked(o)) {
                              e.preventDefault();
                              return;
                            }
                            draggedLayer.current = o.id;
                            e.dataTransfer.setData(
                              "application/x-aperture-layer",
                              o.id,
                            );
                          }}
                          onDragOver={(e) => {
                            if (draggedLayer.current) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = slide.objects.findIndex(
                                (b) => b.id === draggedLayer.current,
                              ),
                              to = slide.objects.findIndex(
                                (b) => b.id === o.id,
                              );
                            if (from >= 0) {
                              const next = [...slide.objects];
                              next.splice(to, 0, next.splice(from, 1)[0]);
                              patchSlide({ objects: next });
                            }
                            draggedLayer.current = null;
                          }}
                          onDragEnd={() => {
                            draggedLayer.current = null;
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelected(o.id);
                            setMenu({
                              x: e.clientX,
                              y: e.clientY,
                              kind: "block",
                              id: o.id,
                            });
                          }}
                          aria-pressed={selection.includes(o.id)}
                          onClick={() => {
                            setSelected(o.id);
                            setEditing(null);
                          }}
                        >
                          <span
                            aria-label="Drag to reorder"
                            className="deck-layer-handle"
                          >
                            {"\u2630"}
                          </span>
                          {o.locked ? "Locked: " : ""}
                          {o.publication ? o.publication.type : o.block
                            ? BLOCK_LABELS[o.block.type]
                            : o.type === "text"
                              ? "Rich text"
                              : o.type}
                          {o.alt ? `: ${o.alt}` : ""}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
        {menu && (
          <div
            ref={contextMenuRef}
            className="deck-context-menu"
            role="menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 210),
              top: Math.min(menu.y, window.innerHeight - 220),
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenu(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMenu(null);
              if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                const i = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                buttons[
                  (i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            {menu.kind === "canvas" ? (
              <div>
                <button role="menuitem" onClick={() => addSlide()}>
                  {editingLayout ? "New layout" : "New page"}
                </button>
                <button role="menuitem" onClick={() => addObject("richText")}>
                  Add rich text
                </button>
                <button role="menuitem" onClick={() => addObject("image")}>
                  Add image
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    const ids = slide.objects
                      .filter((o) => !locked(o))
                      .map((o) => o.id);
                    setSelection(ids);
                    setPrimary(ids.at(-1) || null);
                  }}
                >
                  Select all blocks
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setInspector(true);
                    setPresentationSettings(false);
                  }}
                >
                  Page settings
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setInspector(true);
                    setPresentationSettings(true);
                  }}
                >
                  Presentation settings
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        ".deck-viewport-tools button:last-child",
                      )
                      ?.click()
                  }
                >
                  Fit page
                </button>
              </div>
            ) : menu.kind === "slide" ? (
              <div className="deck-slide-actions">
                <button className="btn btn-sm" onClick={() => addSlide(true)}>
                  {editingLayout ? "Duplicate layout" : "Duplicate page"}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={editableSlides.length === 1}
                  onClick={() => {
                    const slides = editableSlides.filter(
                      (s) => s.id !== slide.id,
                    );
                    commit(withSlides(deck, slides));
                    selectSlide(slides[Math.max(0, index - 1)].id);
                  }}
                >
                  {editingLayout ? "Delete layout" : "Delete page"}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={index === 0}
                  onClick={() =>
                    commit(
                      withSlides(
                        deck,
                        reorderSlides(editableSlides, index, index - 1),
                      ),
                    )
                  }
                >
                  Page up
                </button>
                <button
                  className="btn btn-sm"
                  disabled={index === editableSlides.length - 1}
                  onClick={() =>
                    commit(
                      withSlides(
                        deck,
                        reorderSlides(editableSlides, index, index + 1),
                      ),
                    )
                  }
                >
                  Page down
                </button>
              </div>
            ) : (
              <div>
                <button role="menuitem" onClick={() => {
                  const source = slide.objects.find(item => item.id === menu.id);
                  if (source) setStyleClipboard(copyBlockStyles(source));
                }}>Copy styles</button>
                <button role="menuitem" disabled={!styleClipboard || !canEdit || !slide.objects.some(item => selection.includes(item.id) && !locked(item))}
                  onClick={() => {
                    if (styleClipboard) patchSlide({ objects: slide.objects.map(item =>
                      selection.includes(item.id) && !locked(item) ? pasteBlockStyles(item, styleClipboard) : item
                    ) });
                  }}>Paste styles</button>
                <button
                  role="menuitem"
                  disabled={selection.length < 2}
                  onClick={() => groupSelection()}
                >
                  Group
                </button>
                <button
                  role="menuitem"
                  disabled={
                    !slide.objects.some(
                      (o) => selection.includes(o.id) && o.groupId,
                    )
                  }
                  onClick={() => groupSelection(true)}
                >
                  Ungroup
                </button>
                {[
                  "Bring forward",
                  "Bring to front",
                  "Send backward",
                  "Send to back",
                ].map((action) => (
                  <button
                    role="menuitem"
                    key={action}
                    disabled={!!object && !!locked(object)}
                    onClick={() => changeLayer(action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="deck-export-host" ref={exportHost} aria-hidden="true">
          {exporting &&
            (editingLayout ? [...deck.slides, slide] : deck.slides).map((s) => (
              <div
                key={s.id}
                style={{ width: dimensions.width, height: dimensions.height }}
              >
                <Surface slide={s} dimensions={dimensions} />
              </div>
            ))}
        </div>
        <MediaPicker
          open={audioPicker !== null}
          mediaType="audio"
          onClose={() => setAudioPicker(null)}
          onSelect={(asset) => {
            if (audioPicker === "deck")
              commit({ ...deck, audioUrl: asset.url, audioId: asset._id });
            else patchSlide({ audioUrl: asset.url, audioId: asset._id });
            setAudioPicker(null);
          }}
        />
        <MediaPicker
          open={media && Boolean(object)}
          mediaType={object?.type === "video" ? "video" : "image"}
          onClose={() => setMedia(false)}
          onSelect={(asset) => {
            patchObject({
              ...(asset.width && asset.height && object?.type === "image"
                ? { imageRatio: asset.width / asset.height }
                : {}),
              mediaId: asset._id,
              mediaUrl: asset.url,
              alt: asset.alt || object?.alt || "",
            });
            setMedia(false);
          }}
        />
        {playing && (
          <PresentationPlayer
            deck={deck}
            initialIndex={editingLayout ? 0 : presentIndex}
            onExit={() => setPlaying(false)}
          />
        )}
      </div>
    </PresentationShapes.Provider></PresentationSources.Provider>
  );
}
