"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import {
  CheckField,
  ColorField,
  NumField,
  SelectField,
  TextField,
} from "@/components/builder/settings-fields";
import {
  PublicationBlockView,
  publicationBlockStyle,
  type PublicationSources,
} from "@/components/publication-blocks";
import { PublicationExport } from "@/components/publication-export";
import { PublicationViewer } from "@/components/publication-viewer";
import { RichTextEditor } from "@/components/rich-text-editor";
import { InlineStyleEditor } from "@/components/style-editor";
import { IconView } from "@/components/icons";
import { IconSearchField } from "@/components/icon-search";
import type { AdminExit } from "@/lib/admin-exit";
import type { BuilderSources } from "@/lib/builder-sources";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  createPublicationBlock,
  createPublicationPage,
  alignBlocks,
  ALIGNMENTS,
  blockStyleOf,
  withBlockStyle,
  type BlockStyle,
  ALIGNMENT_LABELS,
  boundsOf,
  distributeBlocks,
  effectiveBackground,
  emptyBackground,
  withGroupMembers,
  withLayoutBackground,
  inheritedBlocks,
  withTemplateApplied,
  POST_VIEW_PRESETS,
  PRESENTATION_SIZES,
  PUBLICATION_BLOCK_TYPES,
  PUBLICATION_KINDS,
  TRANSITIONS,
  type AudioSettings,
  type PublicationBlock,
  type PublicationBlockType,
  type PublicationKind,
  type PublicationPage,
  type PublicationPageTemplate,
  type SlideshowSettings,
  type Transition,
} from "@/lib/publication-layout";
import {
  normalizeSponsorScroll,
  SHAPE_KINDS,
  SHAPE_KIND_LABELS,
  SHAPE_TEXT_PLACEMENTS,
  SHAPE_TEXT_PLACEMENT_LABELS,
  type SponsorScrollSettings,
} from "@/lib/page-layout";

import { savePublicationAction } from "./actions";

const BLOCK_ICONS: Record<string, string> = {
  text: "Type",
  richText: "Pilcrow",
  image: "Image",
  video: "Video",
  button: "MousePointerClick",
  qrCode: "QrCode",
  icon: "Sparkles",
  shape: "Square",
  customShape: "Shapes",
  story: "Newspaper",
  collection: "Images",
  form: "ClipboardList",
  sponsorScroll: "GalleryHorizontal",
};

const BLOCK_LABELS: Record<string, string> = {
  text: "Text",
  richText: "Rich text",
  image: "Image",
  video: "Video",
  button: "Button",
  qrCode: "QR code",
  icon: "Icon",
  shape: "Shape",
  customShape: "Custom shape",
  story: "Story",
  collection: "Collection",
  form: "Form",
  sponsorScroll: "Sponsor scroll",
};

/**
 * Blocks with no words of their own. Their style is the box around the media:
 * corners, border, shadow, spacing. An icon is not one of these — it takes its
 * colour from the typography section.
 */
const TEXTLESS_BLOCKS = new Set(["image", "video"]);

/** What the style panel is called for each block. */
const STYLE_PANEL_TITLES: Record<string, string> = {
  image: "Image style",
  video: "Video style",
  icon: "Icon style",
  button: "Button style",
};
/** The two dressable parts of a block: its text, and — for shapes — the shape. */
type StyleSlot = "text" | "shape";

/** Ids for layouts created in the browser; the same shape the server makes. */
function makeTemplateId() {
  return `pubtpl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * The pages of the publication, reordered by dragging a grip.
 *
 * Pointer events rather than HTML5 drag and drop: the same choice as the page
 * builder's outline, for the same reason — nothing about it can be quietly
 * declined by the browser.
 */
function PageList({
  pages,
  activeIndex,
  onSelect,
  onReorder,
  onRemove,
}: {
  pages: PublicationPage[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function slotFromPoint(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y);
    const holder = element?.closest("[data-page-slot]");
    const value = holder?.getAttribute("data-page-slot");
    if (!value) return null;
    const index = Number(value);
    return Number.isFinite(index) ? index : null;
  }

  return (
    <div>
      {pages.map((item, index) => (
        <div
          key={item.id}
          className={`outline-drag is-row${drag === index ? " is-dragging" : ""}${
            over === index ? " is-drop-before" : ""
          }`}
          data-page-slot={index}
        >
          <span
            className="outline-grip"
            aria-hidden="true"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setDrag(index);
              setOver(null);
            }}
            onPointerMove={(event) => {
              if (drag === null) return;
              const target = slotFromPoint(event.clientX, event.clientY);
              if (target !== null && target !== over) setOver(target);
            }}
            onPointerUp={(event) => {
              const target = slotFromPoint(event.clientX, event.clientY) ?? over;
              if (drag !== null && target !== null && target !== drag) {
                // Dropping on a slot lands before it, so a move down has to
                // account for the row leaving its own place first.
                onReorder(drag, target > drag ? target + 1 : target);
              }
              setDrag(null);
              setOver(null);
            }}
            onPointerCancel={() => {
              setDrag(null);
              setOver(null);
            }}
          />
          <button
            type="button"
            className={`outline-node${index === activeIndex ? " is-selected" : ""}`}
            onClick={() => onSelect(index)}
          >
            {item.name}
          </button>
          <div className="outline-row-actions">
            <button type="button" title="Delete page" onClick={() => onRemove(index)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Opens the style panel in the right column for one part of a block. */
function StyleButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      style={{ marginTop: "0.4rem" }}
      onClick={onOpen}
    >
      {label}…
    </button>
  );
}

export type PublicationRecord = {
  _id: string;
  title: string;
  slug: string;
  description: string;
  kind: PublicationKind;
  status: string;
  listed: boolean;
  transition: Transition;
  presentationSize: { width: number; height: number };
  postViews: { id: string; label: string; width: number; height: number }[];
  slideshow: SlideshowSettings;
  audio: AudioSettings;
  pages: PublicationPage[];
  repeatedBlocks: PublicationBlock[];
  pageTemplates: PublicationPageTemplate[];
  isTemplate: boolean;
  coverMediaId: string;
  coverUrl: string;
};

export function PublicationEditor({
  publication,
  sources,
  publicationSources,
  initialView,
  exit = { href: "/admin/publications", label: "Publications", token: "" },
}: {
  /**
   * Where the way-back link goes. Defaulted to this editor's own list, so only
   * a caller arriving from somewhere else has to say anything.
   */
  exit?: AdminExit;
  publication: PublicationRecord;
  sources: BuilderSources;
  publicationSources: PublicationSources;
  /**
   * Which post view to open on. Saving redirects, which remounts the editor —
   * without this the canvas would come back as the first view, a different
   * size and orientation from the one being worked on.
   */
  initialView?: string;
}) {
  const [title, setTitle] = useState(publication.title);
  const [slug, setSlug] = useState(publication.slug);
  const [kind, setKind] = useState<PublicationKind>(publication.kind);
  const [status, setStatus] = useState(publication.status);
  const [listed, setListed] = useState(publication.listed);
  const [transition, setTransition] = useState<Transition>(publication.transition);
  const [canvas, setCanvas] = useState(publication.presentationSize);
  const [postViews, setPostViews] = useState(
    publication.postViews.length > 0 ? publication.postViews : [...POST_VIEW_PRESETS]
  );
  const [activeView, setActiveView] = useState(
    initialView && postViews.some((view) => view.id === initialView)
      ? initialView
      : postViews[0]?.id ?? "square"
  );
  const [slideshow, setSlideshow] = useState(publication.slideshow);
  const [audio, setAudio] = useState(publication.audio);
  const [pages, setPages] = useState<PublicationPage[]>(
    publication.pages.length > 0 ? publication.pages : [createPublicationPage(0)]
  );
  /*
   * Blocks repeated on every page are no longer edited here: layouts do that
   * job, and having both was two ways to say the same thing. Anything already
   * saved keeps rendering, and keeps being saved, so no published publication
   * changes underfoot.
   */
  const [repeatedBlocks] = [publication.repeatedBlocks];
  const [pageTemplates, setPageTemplates] = useState<PublicationPageTemplate[]>(
    publication.pageTemplates
  );
  /**
   * Which layout the left column is editing, or null for the pages list. An
   * empty string means the Layouts tab is open with nothing chosen yet.
   */
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isTemplate, setIsTemplate] = useState(publication.isTemplate);
  const [coverUrl, setCoverUrl] = useState(publication.coverUrl);
  const [coverMediaId, setCoverMediaId] = useState(publication.coverMediaId);

  const [pageIndex, setPageIndex] = useState(0);
  /*
   * What is selected, and what "one of them" means.
   *
   * A list rather than an id, because everything that acts on a selection —
   * moving it, lining it up, grouping it — acts on however many are in it. The
   * inspector still asks about one block, so `selectedId` stays as the single
   * selection and is simply empty while several are chosen: a panel of one
   * block's settings would be lying about the other four.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /**
   * A group somebody has opened, by double-clicking a block inside it.
   *
   * While a group is open its blocks are picked one at a time, as if they were
   * loose. Pressing anything outside closes it again — otherwise the way back
   * out would be a thing to remember rather than a thing to do.
   */
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  /** Where a right-click landed, and what it landed on. */
  const [menu, setMenu] = useState<
    { x: number; y: number; onBlock: boolean } | null
  >(null);
  /** The marquee, in canvas units, while one is being drawn. */
  const [marquee, setMarquee] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = (id: string | null) => {
    setSelectedIds(id ? [id] : []);
    if (!id) setOpenGroupId(null);
  };
  /**
   * Which of the selected block's styles the right column is editing, or null
   * for the block's own settings. Held as a key rather than a closure over the
   * block, so the panel always writes to whatever is selected now.
   */
  const [styleSlot, setStyleSlot] = useState<StyleSlot | null>(null);
  /** Left column shows the publication's own settings instead of the pages. */
  const [showPublicationSettings, setShowPublicationSettings] = useState(false);
  const [zoom, setZoom] = useState(0.4);
  /** Where the canvas sits in the workspace, in screen pixels. */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  /**
   * Mounted only while exporting. The exporters read `.pub-page` nodes, which
   * belong to the viewer — the editor shows one page at a time — so the whole
   * publication is staged off-screen for the capture and taken down after. Not
   * left mounted, because it would autoplay every video on every page.
   */
  const [exportStage, setExportStage] = useState(false);
  const stageHostRef = useRef<HTMLDivElement>(null);

  /**
   * What the canvas draws from.
   *
   * `publicationSources` is loaded from what was saved, so it only holds the
   * records this publication already references. A custom shape chosen here has
   * not been saved yet — its outline would be missing until the next reload,
   * which is the whole shape failing to appear. Every custom shape is already
   * loaded for the picker, so they are merged in and a newly chosen one draws
   * straight away. The page builder resolves its canvas shapes the same way.
   */
  const canvasSources = useMemo<PublicationSources>(
    () => ({
      ...publicationSources,
      shapes: {
        ...publicationSources.shapes,
        ...Object.fromEntries(
          sources.shapes.map((shape) => [
            shape.slug,
            { viewBox: shape.viewBox, paths: shape.paths },
          ])
        ),
      },
    }),
    [publicationSources, sources.shapes]
  );

  // Social posts swap the canvas for the active view preset.
  const activeCanvas =
    kind === "post"
      ? postViews.find((view) => view.id === activeView) ?? canvas
      : canvas;

  const page = pages[pageIndex];

  const editingTemplate =
    editingTemplateId === null
      ? null
      : pageTemplates.find((item) => item.id === editingTemplateId) ?? null;

  /*
   * One set of edit operations serves the page's blocks, the repeated blocks
   * and a layout's blocks, so every inspector control works the same whichever
   * is being edited.
   */
  const activeBlocks = editingTemplate ? editingTemplate.blocks : page.blocks;
  const selected = activeBlocks.find((block) => block.id === selectedId) ?? null;
  /** Whether anything chosen is in a group, which is what "Ungroup" acts on. */
  const groupedSelection = activeBlocks.some(
    (block) => selectedIds.includes(block.id) && block.groupId
  );

  /**
   * What this page shows but does not own: the publication's repeated blocks
   * and its layout's. Drawn at full strength — they are part of the page as the
   * reader will see it — but not selectable, because they belong elsewhere.
   */
  const lockedBlocks = editingTemplate
    ? []
    : inheritedBlocks(page, repeatedBlocks, pageTemplates);

  const CANVAS_MARGIN = 24;

  /**
   * Scales the canvas to fit the workspace, centres it across that space and
   * puts its top edge just under the top bar. The same thing that happens when
   * the editor opens, so one press always returns to a known view.
   */
  const fitToSpace = useCallback(() => {
    const host = stageHostRef.current;
    if (!host) return;

    const fitted = Math.min(
      1,
      (host.clientWidth - CANVAS_MARGIN * 2) / activeCanvas.width,
      (host.clientHeight - CANVAS_MARGIN * 2) / activeCanvas.height
    );
    setZoom(fitted);
    setPan({
      x: Math.round((host.clientWidth - activeCanvas.width * fitted) / 2),
      y: CANVAS_MARGIN,
    });
  }, [activeCanvas.width, activeCanvas.height]);

  // Fit the canvas to the workspace once its size is known, and again whenever
  // the page shape changes — a post switching view presets, say.
  useLayoutEffect(() => {
    fitToSpace();
  }, [fitToSpace]);

  /**
   * Zooms about the middle of the workspace rather than the canvas's top-left
   * corner, so the part being looked at stays put.
   */
  function applyZoom(next: number) {
    const clamped = Math.min(4, Math.max(0.05, next));
    const host = stageHostRef.current;

    if (host) {
      const midX = host.clientWidth / 2;
      const midY = host.clientHeight / 2;
      const ratio = clamped / zoom;
      setPan((current) => ({
        x: Math.round(midX - (midX - current.x) * ratio),
        y: Math.round(midY - (midY - current.y) * ratio),
      }));
    }

    setZoom(clamped);
  }

  /**
   * Held down to pan instead of selecting.
   *
   * A ref rather than state: it is read inside a pointer handler and changing
   * it should not redraw a canvas of a hundred blocks.
   */
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const spaceDown = useRef(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceDown.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /**
   * Drags a rectangle over the canvas and takes everything it touches.
   *
   * Touches rather than encloses: dragging a box that has to swallow a block
   * whole means starting outside the page for anything near its edge, and the
   * blocks nearest an edge are the ones most often being tidied.
   */
  function startMarquee(event: React.PointerEvent) {
    const surface = canvasRef.current;
    if (!surface) return;

    const box = surface.getBoundingClientRect();
    const at = (clientX: number, clientY: number) => ({
      x: (clientX - box.left) / zoom,
      y: (clientY - box.top) / zoom,
    });

    const from = at(event.clientX, event.clientY);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const held = additive ? selectedIds : [];
    if (!additive) setSelectedIds([]);

    let moved = false;

    const onMove = (moveEvent: PointerEvent) => {
      const to = at(moveEvent.clientX, moveEvent.clientY);
      const rect = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
      };
      // A press that has not travelled is a click on the background, not a
      // marquee, and should not paint a rectangle over the page.
      if (!moved && rect.width < 3 && rect.height < 3) return;
      moved = true;
      setMarquee(rect);

      const caught = activeBlocks
        .filter(
          (block) =>
            block.x < rect.x + rect.width &&
            block.x + block.width > rect.x &&
            block.y < rect.y + rect.height &&
            block.y + block.height > rect.y
        )
        .map((block) => block.id);

      // A block in a group brings its group: the marquee selects things, and
      // a group is one of the things it can select.
      setSelectedIds(withGroupMembers(activeBlocks, [...held, ...caught]));
    };

    const onUp = () => {
      if (!moved) setSelectedIds(held);
      setMarquee(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /** Drags the surface under the window; the canvas itself does not move. */
  function startPan(event: React.PointerEvent) {
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...pan };
    setPanning(true);

    const onMove = (moveEvent: PointerEvent) => {
      setPan({
        x: Math.round(origin.x + (moveEvent.clientX - startX)),
        y: Math.round(origin.y + (moveEvent.clientY - startY)),
      });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const updatePage = useCallback(
    (index: number, patch: Partial<PublicationPage>) => {
      setPages((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
      );
    },
    []
  );

  function setActiveBlocks(blocks: PublicationBlock[]) {
    if (editingTemplate) {
      setPageTemplates((current) =>
        current.map((item) => (item.id === editingTemplate.id ? { ...item, blocks } : item))
      );
      return;
    }
    updatePage(pageIndex, { blocks });
  }

  /**
   * The background the canvas is showing, and how to change it. Editing a
   * layout edits the layout's; editing a page edits the page's, falling back to
   * the layout's for display only.
   */
  const canvasBackground = editingTemplate
    ? editingTemplate
    : effectiveBackground(page, pageTemplates);

  /**
   * The one way a background is changed, whichever the canvas is showing.
   *
   * Every background control goes through here. Three of them once wrote to
   * the page directly, which worked while a page was being edited and quietly
   * did the wrong thing while a layout was: the picture landed on whatever
   * page happened to be open and the layout stayed empty, so an image
   * background on a layout could never appear.
   */
  function updateBackground(patch: Partial<typeof emptyBackground>) {
    if (editingTemplate) {
      setPageTemplates((current) =>
        current.map((item) =>
          item.id === editingTemplate.id ? { ...item, ...patch } : item
        )
      );

      /*
       * Giving a layout a background stands its pages aside.
       *
       * A page is created with a background of its own and a page's own wins,
       * so without this the colour set here would show on the canvas and on no
       * page using the layout — which is the same rule `withTemplateApplied`
       * follows when a layout is applied, reaching the other order of work.
       */
      if (patch.backgroundType && patch.backgroundType !== "none") {
        setPages((current) => withLayoutBackground(current, editingTemplate.id));
      }
      return;
    }
    updatePage(pageIndex, patch);
  }

  /** Turns the current page's blocks into a layout other pages can be built on. */
  function savePageAsTemplate() {
    const template: PublicationPageTemplate = {
      ...emptyBackground,
      id: makeTemplateId(),
      name: `${page.name} layout`,
      // Copied, not shared: the page keeps working as it did, and the layout is
      // free to diverge from the page it came from.
      blocks: page.blocks.map((block) => ({ ...block })),
    };
    setPageTemplates((current) => [...current, template]);
    setEditingTemplateId(template.id);
    setSelectedId(null);
  }

  function updateBlock(blockId: string, patch: Partial<PublicationBlock>) {
    setActiveBlocks(
      activeBlocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block))
    );
  }

  /*
   * The editor's own clipboard.
   *
   * Its own, rather than the system's: reading that one is asynchronous, needs
   * a permission the browser may refuse, and would hand back whatever text
   * happened to be there. What is copied here is a set of blocks, and a set of
   * blocks means nothing outside this editor.
   *
   * State rather than a ref, because the Paste item is drawn from it — a menu
   * whose Paste stayed greyed out after a copy would be worse than no menu.
   */
  const [clipboard, setClipboard] = useState<PublicationBlock[]>([]);

  /**
   * A look on its own, kept apart from the blocks clipboard.
   *
   * Two clipboards rather than one, because copying a block and copying how a
   * block is dressed are different intentions: somebody matching six captions
   * to a seventh wants the look each time and the block never, and a single
   * clipboard would make each copy destroy the other.
   */
  const [styleClipboard, setStyleClipboard] = useState<BlockStyle | null>(null);

  /** What a command acts on: the selection, with any group it belongs to. */
  function actionable(): string[] {
    return withGroupMembers(activeBlocks, selectedIds);
  }

  function copySelection() {
    const ids = actionable();
    setClipboard(
      activeBlocks
        .filter((block) => ids.includes(block.id))
        // A copy, so editing the original afterwards does not edit what was
        // taken — the clipboard holds what was there when it was copied.
        .map((block) => ({ ...block }))
    );
  }

  /**
   * Puts the copied blocks down, offset a little.
   *
   * Fresh ids throughout, and fresh group ids: a pasted arrangement is a group
   * of its own, so moving it later does not drag the blocks it was copied
   * from. The offset is what makes a paste visible — laid exactly on top of
   * the originals it would look as though nothing had happened.
   */
  function pasteClipboard() {
    if (clipboard.length === 0) return;

    const regroup = new Map<string, string>();
    const pasted = clipboard.map((block, index) => {
      const groupId = block.groupId
        ? (regroup.get(block.groupId) ??
           (() => {
             const next = makeTemplateId();
             regroup.set(block.groupId!, next);
             return next;
           })())
        : undefined;

      return {
        ...block,
        id: `${block.id}-copy-${Date.now().toString(36)}-${index}`,
        x: block.x + 24,
        y: block.y + 24,
        // Above what is already there, so a paste lands in view rather than
        // behind the thing it was copied from.
        zIndex: activeBlocks.length + index + 1,
        groupId,
      };
    });

    setActiveBlocks([...activeBlocks, ...pasted]);
    setSelectedIds(pasted.map((block) => block.id));
    setStyleSlot(null);
  }

  /** Takes the look of whatever is selected — the first, if several are. */
  function copyStyle() {
    const from = activeBlocks.find((block) => selectedIds.includes(block.id));
    if (!from) return;
    setStyleClipboard(blockStyleOf(from));
  }

  /** Dresses everything selected in the look that was taken. */
  function pasteStyle() {
    if (!styleClipboard) return;
    const ids = actionable();
    setActiveBlocks(
      activeBlocks.map((block) =>
        ids.includes(block.id) ? withBlockStyle(block, styleClipboard) : block
      )
    );
  }

  function deleteSelection() {
    const ids = actionable();
    if (ids.length === 0) return;
    setActiveBlocks(activeBlocks.filter((block) => !ids.includes(block.id)));
    setSelectedIds([]);
    setStyleSlot(null);
  }

  /**
   * Copy, paste and delete from the keyboard.
   *
   * Ignored while a field has the focus: backspace in a text box deletes a
   * letter, and a copy there copies the words — taking those over would make
   * the inspector unusable in order to save a trip to a menu.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true']"
        )
      ) {
        return;
      }

      const command = event.ctrlKey || event.metaKey;

      // Shift makes it the look rather than the block: the same two letters,
      // one modifier apart, because they are the same two intentions.
      if (command && event.shiftKey && event.key.toLowerCase() === "c") {
        if (selectedIds.length === 0) return;
        event.preventDefault();
        copyStyle();
        return;
      }

      if (command && event.shiftKey && event.key.toLowerCase() === "v") {
        if (!styleClipboard || selectedIds.length === 0) return;
        event.preventDefault();
        pasteStyle();
        return;
      }

      if (command && event.key.toLowerCase() === "c") {
        if (selectedIds.length === 0) return;
        event.preventDefault();
        copySelection();
        return;
      }

      if (command && event.key.toLowerCase() === "v") {
        if (clipboard.length === 0) return;
        event.preventDefault();
        pasteClipboard();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length === 0) return;
        // Backspace is the browser's "go back" on a page with nothing focused,
        // which would lose the whole edit.
        event.preventDefault();
        deleteSelection();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Everything these read is captured on each render, which is what keeps
    // them acting on the selection as it stands rather than as it was.
  });

  /** Lines the selection up, against itself or against the page. */
  function align(alignment: (typeof ALIGNMENTS)[number], against: "each other" | "page") {
    const chosen = activeBlocks.filter((block) => selectedIds.includes(block.id));
    if (chosen.length === 0) return;

    setActiveBlocks(
      alignBlocks(
        activeBlocks,
        selectedIds,
        alignment,
        against === "page"
          ? { x: 0, y: 0, width: activeCanvas.width, height: activeCanvas.height }
          : boundsOf(chosen)
      )
    );
  }

  function distribute(axis: "horizontal" | "vertical") {
    setActiveBlocks(distributeBlocks(activeBlocks, selectedIds, axis));
  }

  /**
   * Ties the selection together, or unties it.
   *
   * One id shared by the members. Grouping a selection that already contains a
   * group swallows it — a group inside a group would need a way to open only
   * the inner one, and nothing here has asked for that.
   */
  function groupSelection() {
    const groupId = makeTemplateId();
    setActiveBlocks(
      activeBlocks.map((block) =>
        selectedIds.includes(block.id) ? { ...block, groupId } : block
      )
    );
    setOpenGroupId(null);
  }

  function ungroupSelection() {
    setActiveBlocks(
      activeBlocks.map((block) =>
        selectedIds.includes(block.id) ? { ...block, groupId: undefined } : block
      )
    );
    setOpenGroupId(null);
  }

  function addBlock(type: PublicationBlockType) {
    const block = createPublicationBlock(type);
    block.zIndex = activeBlocks.length + 1;
    setActiveBlocks([...activeBlocks, block]);
    setSelectedId(block.id);
  }

  /**
   * What pressing this block selects.
   *
   * A block in a closed group stands for the whole group: that is what makes a
   * group a thing rather than a label. A block in the group somebody has
   * opened stands for itself.
   */
  function blockSelection(block: PublicationBlock): string[] {
    if (!block.groupId || block.groupId === openGroupId) return [block.id];
    return activeBlocks
      .filter((entry) => entry.groupId === block.groupId)
      .map((entry) => entry.id);
  }

  /** Press on a block: select it, add it to the selection, or take it out. */
  function selectBlock(event: React.PointerEvent, block: PublicationBlock) {
    const wanted = blockSelection(block);
    // Control on Windows and Linux, command on a Mac; shift as well, because
    // every other canvas in the world accepts it for the same thing.
    const adding = event.ctrlKey || event.metaKey || event.shiftKey;

    if (!adding) {
      if (!selectedIds.includes(block.id)) {
        setSelectedIds(wanted);
        setStyleSlot(null);
      }
      return;
    }

    setSelectedIds((current) => {
      const held = new Set(current);
      const alreadyIn = wanted.every((id) => held.has(id));
      for (const id of wanted) {
        if (alreadyIn) held.delete(id);
        else held.add(id);
      }
      return [...held];
    });
    setStyleSlot(null);
  }

  /** Drag a block around the canvas; pointer deltas are divided by the zoom. */
  function startDrag(event: React.PointerEvent, block: PublicationBlock, mode: "move" | "resize") {
    event.stopPropagation();
    event.preventDefault();

    if (mode === "move") selectBlock(event, block);
    else setSelectedIds([block.id]);

    const startX = event.clientX;
    const startY = event.clientY;

    /*
     * Everything that moves with it, and where each of them started.
     *
     * Taken once, before the first move: reading the blocks again on every
     * pointer event would compound each rounding, and a selection dragged
     * across the page would drift apart.
     */
    const moving =
      mode === "move"
        ? (selectedIds.includes(block.id)
            ? withGroupMembers(activeBlocks, selectedIds)
            : blockSelection(block))
        : [block.id];
    const origins = new Map(
      activeBlocks
        .filter((entry) => moving.includes(entry.id))
        .map((entry) => [entry.id, { x: entry.x, y: entry.y }])
    );
    const origin = { width: block.width, height: block.height };

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;

      if (mode === "resize") {
        updateBlock(block.id, {
          width: Math.max(16, Math.round(origin.width + deltaX)),
          height: Math.max(16, Math.round(origin.height + deltaY)),
        });
        return;
      }

      setActiveBlocks(
        activeBlocks.map((entry) => {
          const from = origins.get(entry.id);
          if (!from) return entry;
          return {
            ...entry,
            x: Math.round(from.x + deltaX),
            y: Math.round(from.y + deltaY),
          };
        })
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /**
   * Turns the block by dragging its grip around the block's centre.
   *
   * The angle is measured from the centre on screen, so it is right whatever
   * the zoom or the pan — no need to convert back into canvas coordinates.
   */
  function startRotate(event: React.PointerEvent, block: PublicationBlock) {
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(block.id);

    const box = (event.currentTarget as HTMLElement)
      .closest(".pub-editor-block")
      ?.getBoundingClientRect();
    if (!box) return;

    const centreX = box.left + box.width / 2;
    const centreY = box.top + box.height / 2;

    const onMove = (moveEvent: PointerEvent) => {
      const radians = Math.atan2(moveEvent.clientY - centreY, moveEvent.clientX - centreX);
      // The grip sits above the block, so straight up has to read as zero.
      const degrees = (radians * 180) / Math.PI + 90;
      // Shift snaps to the 15° marks, for putting something back level.
      const snapped = moveEvent.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees);
      updateBlock(block.id, { rotation: ((snapped % 360) + 360) % 360 });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="builder">
      <form action={savePublicationAction} id="publication-form">
        {/* The way-back token, carried through the save's own redirect —
            without it, pressing Save silently sends you back to the admin
            list instead of wherever you came from. */}
        <input type="hidden" name="from" value={exit.token} />
        <input type="hidden" name="id" value={publication._id} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="status" value={status} />
        {listed ? <input type="hidden" name="listed" value="on" /> : null}
        <input type="hidden" name="transition" value={transition} />
        <input type="hidden" name="presentationSize" value={JSON.stringify(canvas)} />
        <input type="hidden" name="postViews" value={JSON.stringify(postViews)} />
        {/* Only a post has named views, so only a post carries one back across
            the save. Anything else has one canvas and nothing to remember. */}
        {kind === "post" ? (
          <input type="hidden" name="editorView" value={activeView} />
        ) : null}
        <input type="hidden" name="slideshow" value={JSON.stringify(slideshow)} />
        <input type="hidden" name="audio" value={JSON.stringify(audio)} />
        <input type="hidden" name="pages" value={JSON.stringify(pages)} />
        <input type="hidden" name="repeatedBlocks" value={JSON.stringify(repeatedBlocks)} />
        <input type="hidden" name="pageTemplates" value={JSON.stringify(pageTemplates)} />
        {isTemplate ? <input type="hidden" name="isTemplate" value="on" /> : null}
        <input type="hidden" name="coverUrl" value={coverUrl} />
        <input type="hidden" name="coverMediaId" value={coverMediaId} />
        <input type="hidden" name="description" value={publication.description} />
      </form>

      <div className="builder-topbar">
        {/* The admin sidebar is hidden on this route, so the way out lives here. */}
        <Link href={exit.href} className="btn btn-sm" title={`Back to ${exit.label}`}>
          ← {exit.label}
        </Link>
        <input
          className="input"
          style={{ maxWidth: "13rem" }}
          value={title}
          placeholder="Title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          className="input"
          style={{ maxWidth: "10rem" }}
          value={slug}
          placeholder="slug"
          onChange={(event) => setSlug(event.target.value)}
        />
        <select
          className="input"
          style={{ maxWidth: "9rem" }}
          value={kind}
          onChange={(event) => setKind(event.target.value as PublicationKind)}
        >
          {PUBLICATION_KINDS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ maxWidth: "8rem" }}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>

        {kind === "post" ? (
          <select
            className="input"
            style={{ maxWidth: "10rem" }}
            value={activeView}
            onChange={(event) => setActiveView(event.target.value)}
          >
            {postViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.label}
              </option>
            ))}
          </select>
        ) : null}

        <div className="spacer" />

        {/* Zoom. The canvas is one scaled surface, so every block on it grows
            and shrinks together. */}
        <div className="pub-zoom">
          <button
            type="button"
            className="btn btn-sm"
            title="Zoom out"
            onClick={() => applyZoom(zoom - 0.1)}
          >
            −
          </button>
          <input
            className="input"
            value={Math.round(zoom * 100)}
            aria-label="Zoom percentage"
            onChange={(event) => {
              const next = Number(event.target.value.replace(/[^0-9.]/g, ""));
              if (Number.isFinite(next) && next > 0) applyZoom(next / 100);
            }}
          />
          <span className="help-text">%</span>
          <button
            type="button"
            className="btn btn-sm"
            title="Zoom in"
            onClick={() => applyZoom(zoom + 0.1)}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          title="Fit the canvas to the space and centre it"
          aria-label="Fit the canvas to the space and centre it"
          onClick={fitToSpace}
        >
          <IconView name="ScanEye" width="1.1rem" height="1.1rem" />
        </button>

        <button
          type="button"
          className={`btn btn-sm${showPublicationSettings ? " btn-primary" : ""}`}
          title="Publication settings"
          onClick={() => setShowPublicationSettings((current) => !current)}
        >
          Settings
        </button>

        <PublicationExport
          inline
          audioUrl={audio.url}
          fileName={slug || "publication"}
          // The stage below renders the layout alone when one is being edited,
          // so a single-page export is always index zero there.
          pageIndex={editingTemplate ? 0 : pageIndex}
          pageName={editingTemplate ? editingTemplate.name : page.name}
          onPrepare={async () => {
            setExportStage(true);
            // Long enough for the stage to mount and its media to load; a
            // capture that starts too early gets empty pictures.
            await new Promise((resolve) => setTimeout(resolve, 700));
          }}
          onDone={() => setExportStage(false)}
        />

        <a
          className="btn btn-sm"
          // A post previews in the view being edited; without this it always
          // opened on the first preset, which is the square one.
          href={`/admin/publications/${publication._id}/preview${
            kind === "post" ? `?view=${encodeURIComponent(activeView)}` : ""
          }`}
          target="_blank"
          rel="noreferrer"
        >
          Preview
        </a>
        <button type="submit" form="publication-form" className="btn btn-primary btn-sm">
          Save
        </button>
      </div>

      <div className="builder-body">
        {/* --------------------------------------------------------- Pages */}
        <aside className="builder-outline">
          {showPublicationSettings ? (
            <>
          <div className="inspector-section">
            <h4 className="inspector-title">Publication</h4>
            {kind !== "post" ? (
              <SelectField
                label="Canvas"
                value={
                  (Object.entries(PRESENTATION_SIZES).find(
                    ([, size]) => size.width === canvas.width && size.height === canvas.height
                  )?.[0] ?? "custom") as string
                }
                options={[
                  ...Object.keys(PRESENTATION_SIZES).map((key) => ({ value: key, label: key })),
                  { value: "custom", label: "Custom" },
                ]}
                onChange={(value) => {
                  const preset = PRESENTATION_SIZES[value as keyof typeof PRESENTATION_SIZES];
                  if (preset) setCanvas({ ...preset });
                }}
              />
            ) : null}

            <div className="inspector-grid">
              <NumField
                label="Width"
                value={activeCanvas.width}
                onChange={(width) =>
                  kind === "post"
                    ? setPostViews((current) =>
                        current.map((view) =>
                          view.id === activeView ? { ...view, width } : view
                        )
                      )
                    : setCanvas((current) => ({ ...current, width }))
                }
              />
              <NumField
                label="Height"
                value={activeCanvas.height}
                onChange={(height) =>
                  kind === "post"
                    ? setPostViews((current) =>
                        current.map((view) =>
                          view.id === activeView ? { ...view, height } : view
                        )
                      )
                    : setCanvas((current) => ({ ...current, height }))
                }
              />
            </div>

            <SelectField
              label="Transition"
              value={transition}
              options={TRANSITIONS.map((value) => ({ value, label: value }))}
              onChange={setTransition}
            />
            <CheckField label="Listed publicly" value={listed} onChange={setListed} />

            <h4 className="inspector-title" style={{ marginTop: "0.75rem" }}>
              Slideshow
            </h4>
            <CheckField
              label="Enable slideshow"
              value={slideshow.enabled}
              onChange={(enabled) => setSlideshow({ ...slideshow, enabled })}
            />
            {slideshow.enabled ? (
              <>
                <NumField
                  label="Interval (ms)"
                  value={slideshow.intervalMs}
                  step={500}
                  onChange={(intervalMs) => setSlideshow({ ...slideshow, intervalMs })}
                />
                <CheckField
                  label="Loop"
                  value={slideshow.loop}
                  onChange={(loop) => setSlideshow({ ...slideshow, loop })}
                />
                <CheckField
                  label="Start playing on its own"
                  value={slideshow.autoplay}
                  onChange={(autoplay) => setSlideshow({ ...slideshow, autoplay })}
                />
                <span className="help-text">
                  Off, the reader presses play — from the bar at the foot, or
                  the menu on a right-click. On, it begins the moment the page
                  opens, which suits a screen nobody is standing at.
                </span>
              </>
            ) : null}

            <h4 className="inspector-title" style={{ marginTop: "0.75rem" }}>
              Global audio
            </h4>
            <MediaField
              label="Audio track"
              value={audio.url}
              mediaType="audio"
              onChange={(url) => setAudio({ ...audio, url })}
            />
            <CheckField
              label="Autoplay"
              value={audio.autoplay}
              onChange={(autoplay) => setAudio({ ...audio, autoplay })}
            />
            <CheckField
              label="Loop"
              value={audio.loop}
              onChange={(loop) => setAudio({ ...audio, loop })}
            />

            <MediaField
              label="Cover image"
              value={coverUrl}
              mediaType="image"
              onChange={(url, asset) => {
                setCoverUrl(url);
                setCoverMediaId(asset?._id ?? "");
              }}
            />
          </div>
            </>
          ) : (
            <>
          <div className="builder-tabs">
                <button
                  type="button"
                  className={`builder-tab${editingTemplateId === null ? " is-active" : ""}`}
                  onClick={() => {
                    setEditingTemplateId(null);
                    setSelectedId(null);
                  }}
                >
                  Pages
                </button>
                <button
                  type="button"
                  className={`builder-tab${editingTemplateId !== null ? " is-active" : ""}`}
                  onClick={() => {
                    setEditingTemplateId(pageTemplates[0]?.id ?? "");
                    setSelectedId(null);
                  }}
                >
                  Layouts ({pageTemplates.length})
                </button>
              </div>

              {editingTemplateId === null ? (
                <>
                  {/* Ten rows before it scrolls, so the settings for the page
                      picked here stay in reach however long the list runs. */}
                  <div className="pub-page-list">
                    <PageList
                      pages={pages}
                      activeIndex={pageIndex}
                      onSelect={(index) => {
                        setPageIndex(index);
                        setSelectedId(null);
                      }}
                      onReorder={(from, to) => {
                        setPages((current) => {
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          if (!moved) return current;
                          next.splice(from < to ? to - 1 : to, 0, moved);
                          return next;
                        });
                        setPageIndex((current) =>
                          current === from ? (from < to ? to - 1 : to) : current
                        );
                        setSelectedId(null);
                      }}
                      onRemove={(index) => {
                        setPages((current) =>
                          current.length === 1
                            ? current
                            : current.filter((_, itemIndex) => itemIndex !== index)
                        );
                        setPageIndex(0);
                        setSelectedId(null);
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setPages((current) => [...current, createPublicationPage(current.length)])
                      }
                    >
                      Add page
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Make a reusable layout from this page's blocks"
                      onClick={savePageAsTemplate}
                    >
                      Save as layout
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pub-page-list">
                    {pageTemplates.length === 0 ? (
                      <p className="help-text" style={{ margin: 0 }}>
                        No layouts yet. Build a page, then use Save as layout.
                      </p>
                    ) : (
                      pageTemplates.map((item) => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center" }}>
                          <button
                            type="button"
                            className={`outline-node${
                              item.id === editingTemplateId ? " is-selected" : ""
                            }`}
                            onClick={() => {
                              setEditingTemplateId(item.id);
                              setSelectedId(null);
                            }}
                          >
                            {item.name}
                          </button>
                          <div className="outline-row-actions">
                            <button
                              type="button"
                              title="Delete layout"
                              onClick={() => {
                                setPageTemplates((current) =>
                                  current.filter((entry) => entry.id !== item.id)
                                );
                                setPages((current) =>
                                  current.map((entry) =>
                                    entry.templateId === item.id
                                      ? { ...entry, templateId: "" }
                                      : entry
                                  )
                                );
                                setEditingTemplateId(null);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {editingTemplate ? (
                    <div className="inspector-section">
                      <TextField
                        label="Layout name"
                        value={editingTemplate.name}
                        onChange={(name) =>
                          setPageTemplates((current) =>
                            current.map((item) =>
                              item.id === editingTemplate.id ? { ...item, name } : item
                            )
                          )
                        }
                      />
                      <p className="help-text" style={{ marginTop: 0 }}>
                        Blocks added here show on every page using this layout, and
                        cannot be edited from those pages.
                      </p>
                    </div>
                  ) : null}
                </>
              )}

              {/* The settings for whatever the canvas is showing: the page
                  picked above, or the layout being edited. A layout has no name
                  to set here and no audio — it is a backdrop and a set of
                  blocks — so those controls belong to a page alone. */}
              <div className="inspector-section">
              <h4 className="inspector-title">
                {editingTemplate ? "Layout background" : "Page"}
              </h4>
              {editingTemplate ? null : (
                <TextField
                  label="Name"
                  value={page.name}
                  onChange={(name) => updatePage(pageIndex, { name })}
                />
              )}
              {/* Blocks from the chosen layout show on this page and are edited
                  from the Layouts tab, never from here. */}
              {editingTemplate ? null : (
              <SelectField
                label="Layout"
                value={page.templateId ?? ""}
                options={[
                  { value: "", label: "None" },
                  ...pageTemplates.map((item) => ({ value: item.id, label: item.name })),
                ]}
                onChange={(templateId) =>
                  setPages((current) =>
                    current.map((item, index) =>
                      index === pageIndex
                        ? withTemplateApplied(item, templateId, pageTemplates)
                        : item
                    )
                  )
                }
              />
              )}
              <SelectField
                label="Background"
                value={canvasBackground.backgroundType}
                options={[
                  { value: "none", label: "None" },
                  { value: "color", label: "Colour" },
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                ]}
                onChange={(backgroundType) => updateBackground({ backgroundType })}
              />

              {editingTemplate ? (
                <span className="help-text">
                  Pages built on this layout show it, unless a page sets a
                  background of its own afterwards.
                </span>
              ) : null}

              {canvasBackground.backgroundType === "color" ? (
                <ColorField
                  label="Colour"
                  value={canvasBackground.backgroundColor}
                  onChange={(backgroundColor) => updateBackground({ backgroundColor })}
                />
              ) : null}

              {canvasBackground.backgroundType === "image" ||
              canvasBackground.backgroundType === "video" ? (
                <>
                  <MediaField
                    label="Background media"
                    value={canvasBackground.backgroundMediaUrl}
                    mediaType={canvasBackground.backgroundType === "video" ? "video" : "image"}
                    onChange={(backgroundMediaUrl) =>
                      updateBackground({ backgroundMediaUrl })
                    }
                  />
                  <SelectField
                    label="Fit"
                    value={canvasBackground.backgroundFit}
                    options={[
                      { value: "cover", label: "Cover" },
                      { value: "contain", label: "Contain" },
                      { value: "fill", label: "Fill" },
                    ]}
                    onChange={(backgroundFit) => updateBackground({ backgroundFit })}
                  />
                  <div className="inspector-grid">
                    <NumField
                      label="Offset X (%)"
                      value={canvasBackground.backgroundOffsetX}
                      onChange={(backgroundOffsetX) =>
                        updateBackground({ backgroundOffsetX })
                      }
                    />
                    <NumField
                      label="Offset Y (%)"
                      value={canvasBackground.backgroundOffsetY}
                      onChange={(backgroundOffsetY) =>
                        updateBackground({ backgroundOffsetY })
                      }
                    />
                  </div>
                  {canvasBackground.backgroundType === "image" ? (
                    <CheckField
                      label="Ken Burns effect"
                      value={canvasBackground.kenBurns}
                      onChange={(kenBurns) => updateBackground({ kenBurns })}
                    />
                  ) : (
                    <>
                      <CheckField
                        label="Muted"
                        value={canvasBackground.videoMuted}
                        onChange={(videoMuted) => updateBackground({ videoMuted })}
                      />
                      <CheckField
                        label="Loop"
                        value={canvasBackground.videoLoop}
                        onChange={(videoLoop) => updateBackground({ videoLoop })}
                      />
                    </>
                  )}
                </>
              ) : null}

              {editingTemplate ? null : (
                <MediaField
                  label="Page audio"
                  value={page.audioUrl}
                  mediaType="audio"
                  onChange={(audioUrl) => updatePage(pageIndex, { audioUrl })}
                />
              )}
              </div>
            </>
          )}
        </aside>

        {/* -------------------------------------------------------- Canvas */}
        <div
          className={`builder-workspace pub-workspace${panning ? " is-panning" : ""}`}
          ref={stageHostRef}
          // A press on the surface rather than on a block: drop the selection
          // and start panning. Blocks stop the event, so a click on one keeps
          // its selection until something outside it is pressed.
          onPointerDown={(event) => {
            setStyleSlot(null);
            setOpenGroupId(null);

            /*
             * Plain drag draws a marquee; holding space, or the middle button,
             * pans as it always did.
             *
             * Selecting is what somebody does on a canvas fifty times an hour
             * and panning is what they do occasionally, so the plain gesture
             * belongs to the common one. The modifier is announced under the
             * zoom control rather than left to be discovered.
             */
            if (event.button === 1 || spaceDown.current) {
              setSelectedId(null);
              startPan(event);
              return;
            }
            // The right button opens the menu; the marquee belongs to the left.
            if (event.button === 2) return;
            setMenu(null);
            startMarquee(event);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, onBlock: false });
          }}
        >
          <div
            className="pub-editor-canvas"
            ref={canvasRef}
            style={{
              width: `${activeCanvas.width}px`,
              height: `${activeCanvas.height}px`,
              // Pan first, then zoom: the canvas is placed in the workspace and
              // then scaled about its own top-left corner.
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              background:
                canvasBackground.backgroundType === "color"
                  ? canvasBackground.backgroundColor
                  : "#fff",
            }}
          >
            {canvasBackground.backgroundType === "image" &&
            canvasBackground.backgroundMediaUrl ? (
              <div className="pub-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={protectedMediaUrl(canvasBackground.backgroundMediaUrl)}
                  alt=""
                  style={{ objectFit: canvasBackground.backgroundFit }}
                />
              </div>
            ) : null}

            {canvasBackground.backgroundType === "video" &&
            canvasBackground.backgroundMediaUrl ? (
              <div className="pub-bg">
                <video
                  src={protectedMediaUrl(canvasBackground.backgroundMediaUrl)}
                  muted
                  loop
                  autoPlay
                  playsInline
                  style={{ objectFit: canvasBackground.backgroundFit }}
                />
              </div>
            ) : null}

            {[
              // Locked blocks first, so the page's own sit above them exactly
              // as they will when published.
              ...lockedBlocks.map((block) => ({ block, repeated: true })),
              ...activeBlocks.map((block) => ({ block, repeated: false })),
            ].map(({ block, repeated }) => (
              <div
                key={`${repeated ? "r" : "p"}-${block.id}`}
                className={`pub-editor-block${
                  selectedIds.includes(block.id) ? " is-selected" : ""
                }${
                  block.groupId && block.groupId === openGroupId ? " is-in-group" : ""
                }`}
                style={{
                  ...publicationBlockStyle(block),
                  /*
                   * Inherited blocks are drawn exactly as they will publish —
                   * no dimming, no transparency — because judging a page means
                   * seeing it as the reader will. They are simply not editable
                   * here; they belong to the layout or to the whole
                   * publication.
                   */
                  pointerEvents: repeated ? "none" : "auto",
                }}
                onPointerDown={
                  repeated ? undefined : (event) => startDrag(event, block, "move")
                }
                onContextMenu={
                  repeated
                    ? undefined
                    : (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        // A right-click on something outside the selection
                        // takes it first, so the menu always acts on what was
                        // pressed rather than on what happened to be chosen.
                        if (!selectedIds.includes(block.id)) {
                          setSelectedIds(blockSelection(block));
                          setStyleSlot(null);
                        }
                        setMenu({
                          x: event.clientX,
                          y: event.clientY,
                          onBlock: true,
                        });
                      }
                }
                /* Opens the group this block is in, so the next press picks
                   the block rather than the whole arrangement. */
                onDoubleClick={
                  repeated || !block.groupId
                    ? undefined
                    : (event) => {
                        event.stopPropagation();
                        setOpenGroupId(block.groupId ?? null);
                        setSelectedIds([block.id]);
                      }
                }
              >
                {/* Blocks are non-interactive here so clicks select instead. */}
                <PublicationBlockView
                  block={block}
                  sources={canvasSources}
                  interactive={false}
                />
                {!repeated && selectedId === block.id ? (
                  <>
                    <span
                      className="pub-editor-handle"
                      style={{ right: "-0.3rem", bottom: "-0.3rem", cursor: "nwse-resize" }}
                      onPointerDown={(event) => startDrag(event, block, "resize")}
                    />
                    {/* Above the block on a stalk. Hold shift while turning to
                        snap to 15°, which is how a block gets back to level. */}
                    <span
                      className="pub-editor-handle is-rotate"
                      style={{ left: "50%", top: "-1.4rem", marginLeft: "-0.3rem" }}
                      title="Drag to rotate — hold shift to snap"
                      onPointerDown={(event) => startRotate(event, block)}
                    />
                  </>
                ) : null}
              </div>
            ))}

            {marquee ? (
              <div
                className="pub-editor-marquee"
                aria-hidden="true"
                style={{
                  left: `${marquee.x}px`,
                  top: `${marquee.y}px`,
                  width: `${marquee.width}px`,
                  height: `${marquee.height}px`,
                }}
              />
            ) : null}

            {/* Drawn over the blocks, not under them: the edge of the page is
                exactly what an editor needs to see when something overhangs
                it, and content below the outline would hide the very thing
                being checked. */}
            <div className="pub-editor-bounds" aria-hidden="true" />
          </div>
        </div>

        {menu ? (
          <>
            {/* Transparent, over everything, and only here while the menu is
                open: the next press anywhere closes it. */}
            <div
              className="pub-menu-sheet"
              onPointerDown={() => setMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(null);
              }}
            />
            <div
              className="pub-menu"
              role="menu"
              style={{
                // Kept inside the window, so a menu opened near an edge does
                // not run off it.
                left: `${Math.max(8, Math.min(menu.x, window.innerWidth - 248))}px`,
                top: `${Math.max(8, Math.min(menu.y, window.innerHeight - 160))}px`,
              }}
            >
              {menu.onBlock ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    copySelection();
                    setMenu(null);
                  }}
                >
                  Copy{selectedIds.length > 1 ? ` ${selectedIds.length} blocks` : ""}
                </button>
              ) : null}

              <button
                type="button"
                role="menuitem"
                disabled={clipboard.length === 0}
                onClick={() => {
                  pasteClipboard();
                  setMenu(null);
                }}
              >
                Paste
                {clipboard.length > 1 ? ` ${clipboard.length} blocks` : ""}
              </button>

              {menu.onBlock ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      copyStyle();
                      setMenu(null);
                    }}
                  >
                    Copy style
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!styleClipboard}
                    onClick={() => {
                      pasteStyle();
                      setMenu(null);
                    }}
                  >
                    Paste style
                    {selectedIds.length > 1 ? ` onto ${selectedIds.length}` : ""}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      deleteSelection();
                      setMenu(null);
                    }}
                  >
                    Delete{selectedIds.length > 1 ? ` ${selectedIds.length} blocks` : ""}
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        <aside className="builder-inspector">
          {/*
            * Arranging comes first, and appears the moment anything is chosen.
            *
            * Lining one block up against the page is as much a thing somebody
            * wants as lining six up against each other, so the panel is not
            * held back until there are several — only the parts that need
            * several are.
            */}
          {selectedIds.length > 0 && !styleSlot ? (
            <div className="inspector-section">
              <h4 className="inspector-title">
                Arrange
                {selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
              </h4>

              <span className="field-label">On the page</span>
              <div className="arrange-row">
                {ALIGNMENTS.map((alignment) => (
                  <button
                    key={alignment}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => align(alignment, "page")}
                  >
                    {ALIGNMENT_LABELS[alignment]}
                  </button>
                ))}
              </div>

              {selectedIds.length > 1 ? (
                <>
                  <span className="field-label" style={{ marginTop: "0.6rem" }}>
                    Against each other
                  </span>
                  <div className="arrange-row">
                    {ALIGNMENTS.map((alignment) => (
                      <button
                        key={alignment}
                        type="button"
                        className="btn btn-sm"
                        onClick={() => align(alignment, "each other")}
                      >
                        {ALIGNMENT_LABELS[alignment]}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {selectedIds.length > 2 ? (
                <>
                  <span className="field-label" style={{ marginTop: "0.6rem" }}>
                    Space evenly
                  </span>
                  <div className="arrange-row">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => distribute("horizontal")}
                    >
                      Across
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => distribute("vertical")}
                    >
                      Down
                    </button>
                  </div>
                  <span className="help-text">
                    The two at the ends stay where they are; the gaps between
                    the rest are made equal.
                  </span>
                </>
              ) : null}

              {selectedIds.length > 1 || groupedSelection ? (
                <div className="arrange-row" style={{ marginTop: "0.6rem" }}>
                  {selectedIds.length > 1 ? (
                    <button type="button" className="btn btn-sm" onClick={groupSelection}>
                      Group
                    </button>
                  ) : null}
                  {groupedSelection ? (
                    <button type="button" className="btn btn-sm" onClick={ungroupSelection}>
                      Ungroup
                    </button>
                  ) : null}
                </div>
              ) : null}

              <span className="help-text">
                Drag on the page to select several; hold ctrl, ⌘ or shift to add
                one. Hold space to pan instead. Double-click a block in a group
                to pick it out on its own.
              </span>
            </div>
          ) : null}

          {selected && styleSlot ? (
            // The style panel takes over the column while it is open, and hands
            // it back — the block's other settings are not useful underneath a
            // list this long.
            <>
              <div className="inspector-section">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setStyleSlot(null)}
                >
                  ← {BLOCK_LABELS[selected.type]}
                </button>
                <h4 className="inspector-title" style={{ marginTop: "0.6rem" }}>
                  {styleSlot === "shape"
                    ? "Shape style"
                    : STYLE_PANEL_TITLES[selected.type] ?? "Text style"}
                </h4>
              </div>

              {styleSlot === "shape" ? (
                <InlineStyleEditor
                  values={selected.shapeStyle}
                  styleSlug=""
                  fonts={sources.fonts}
                  savedStyles={sources.styles}
                  // A shape has no words of its own, and the saved styles are
                  // written for text.
                  showTypography={false}
                  showSavedStyles={false}
                  onChange={({ values }) =>
                    updateBlock(selected.id, { shapeStyle: values })
                  }
                />
              ) : (
                <InlineStyleEditor
                  values={selected.textStyle}
                  styleSlug={selected.styleSlug ?? ""}
                  fonts={sources.fonts}
                  savedStyles={sources.styles}
                  // Blocks that render no words of their own get the box
                  // controls only; the saved styles are written for text.
                  showTypography={!TEXTLESS_BLOCKS.has(selected.type)}
                  showSavedStyles={!TEXTLESS_BLOCKS.has(selected.type)}
                  onChange={({ values, styleSlug }) =>
                    updateBlock(selected.id, {
                      styleSlug,
                      textStyle: styleSlug ? undefined : values,
                    })
                  }
                />
              )}
            </>
          ) : selected ? (
            <>
              <div className="inspector-section">
                <h4 className="inspector-title">{BLOCK_LABELS[selected.type]}</h4>
                {editingTemplate ? (
                  <>
                    <CheckField
                      label="Locked to the layout"
                      value={selected.locked !== false}
                      onChange={(locked) => updateBlock(selected.id, { locked })}
                    />
                    <p className="help-text" style={{ marginTop: 0 }}>
                      {selected.locked === false
                        ? "Each page using this layout gets its own copy to edit."
                        : "Shows on every page using this layout and is edited only here."}
                    </p>
                  </>
                ) : null}

                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => updateBlock(selected.id, { zIndex: selected.zIndex + 1 })}
                  >
                    Bring forward
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      updateBlock(selected.id, { zIndex: Math.max(0, selected.zIndex - 1) })
                    }
                  >
                    Send back
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      setActiveBlocks(
                        activeBlocks.filter((block) => block.id !== selected.id)
                      );
                      setSelectedId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="inspector-section">
                <h4 className="inspector-title">Position</h4>
                <div className="inspector-grid">
                  <NumField label="X" value={selected.x} onChange={(x) => updateBlock(selected.id, { x })} />
                  <NumField label="Y" value={selected.y} onChange={(y) => updateBlock(selected.id, { y })} />
                  <NumField
                    label="Width"
                    value={selected.width}
                    onChange={(width) => updateBlock(selected.id, { width })}
                  />
                  <NumField
                    label="Height"
                    value={selected.height}
                    onChange={(height) => updateBlock(selected.id, { height })}
                  />
                  <NumField
                    label="Rotation"
                    value={selected.rotation}
                    onChange={(rotation) => updateBlock(selected.id, { rotation })}
                  />
                </div>
              </div>

              <div className="inspector-section">
                <h4 className="inspector-title">Content</h4>

                {selected.type === "text" ? (
                  <>
                    <div className="field">
                      <label>Text</label>
                      <textarea
                        rows={3}
                        value={selected.text ?? ""}
                        onChange={(event) => updateBlock(selected.id, { text: event.target.value })}
                      />
                    </div>
                    <StyleButton label="Text style" onOpen={() => setStyleSlot("text")} />
                  </>
                ) : null}

                {selected.type === "richText" ? (
                  <>
                    <RichTextEditor
                      value={selected.html ?? ""}
                      onChange={(html) => updateBlock(selected.id, { html })}
                      fonts={sources.fonts}
                      minHeight={10}
                    />
                    <p className="help-text">
                      Sizes are stored in rem and scale with the viewer.
                    </p>
                  </>
                ) : null}

                {selected.type === "image" || selected.type === "video" ? (
                  <>
                    <MediaField
                      label={selected.type === "image" ? "Image" : "Video"}
                      value={selected.mediaUrl ?? ""}
                      mediaType={selected.type}
                      onChange={(url, asset) =>
                        updateBlock(selected.id, { mediaUrl: url, mediaId: asset?._id ?? "" })
                      }
                    />
                    <SelectField
                      label="Fit"
                      value={selected.objectFit ?? "cover"}
                      options={[
                        { value: "cover", label: "Cover" },
                        { value: "contain", label: "Contain" },
                      ]}
                      onChange={(objectFit) => updateBlock(selected.id, { objectFit })}
                    />
                    {/* Corners, border, shadow and the rest come from the
                        style now, rather than a lone radius field. */}
                    <StyleButton
                      label={selected.type === "image" ? "Image style" : "Video style"}
                      onOpen={() => setStyleSlot("text")}
                    />
                    {selected.type === "video" ? (
                      <>
                        <CheckField
                          label="Autoplay"
                          value={Boolean(selected.autoplay)}
                          onChange={(autoplay) => updateBlock(selected.id, { autoplay })}
                        />
                        <CheckField
                          label="Loop"
                          value={selected.loop !== false}
                          onChange={(loop) => updateBlock(selected.id, { loop })}
                        />
                        <CheckField
                          label="Muted"
                          value={selected.muted !== false}
                          onChange={(muted) => updateBlock(selected.id, { muted })}
                        />
                        <CheckField
                          label="Show controls"
                          value={Boolean(selected.controls)}
                          onChange={(controls) => updateBlock(selected.id, { controls })}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}

                {selected.type === "button" ? (
                  <>
                    <TextField
                      label="Label"
                      value={selected.label ?? ""}
                      onChange={(label) => updateBlock(selected.id, { label })}
                    />
                    {/* What it does when pressed is the click action below,
                        which every block carries — a second link field on the
                        button alone was a second answer to one question, and
                        the one nothing rendered. */}
                    <StyleButton
                      label="Button style"
                      onOpen={() => setStyleSlot("text")}
                    />
                  </>
                ) : null}

                {selected.type === "qrCode" ? (
                  <>
                    <TextField
                      label="Value or URL"
                      value={selected.qrValue ?? ""}
                      onChange={(qrValue) => updateBlock(selected.id, { qrValue })}
                    />
                    <ColorField
                      label="Colour"
                      value={selected.color ?? "#000000"}
                      onChange={(color) => updateBlock(selected.id, { color })}
                    />
                  </>
                ) : null}

                {selected.type === "icon" ? (
                  <>
                    <IconSearchField
                      value={selected.iconName ?? "star"}
                      onChange={(iconName) => updateBlock(selected.id, { iconName })}
                    />
                    <StyleButton label="Icon style" onOpen={() => setStyleSlot("text")} />
                  </>
                ) : null}

                {/* Both shape blocks carry the same controls — they differ only
                    in where the outline comes from, a preset or an uploaded
                    file. */}
                {selected.type === "shape" || selected.type === "customShape" ? (
                  <>
                    {selected.type === "shape" ? (
                      <SelectField
                        label="Shape"
                        value={selected.shapeKind ?? "rectangle"}
                        options={SHAPE_KINDS.map((value) => ({
                          value,
                          label: SHAPE_KIND_LABELS[value],
                        }))}
                        onChange={(shapeKind) => updateBlock(selected.id, { shapeKind })}
                      />
                    ) : (
                      <SelectField
                        label="Shape"
                        value={selected.shapeSlug ?? ""}
                        options={[
                          { value: "", label: "Select a shape…" },
                          ...sources.shapes.map((shape) => ({
                            value: shape.slug,
                            label: shape.name,
                          })),
                        ]}
                        onChange={(shapeSlug) => updateBlock(selected.id, { shapeSlug })}
                      />
                    )}

                    {/* Fill, outline and corners all live in the shape's style
                        now, so there is no separate colour field. */}
                    <StyleButton label="Shape style" onOpen={() => setStyleSlot("shape")} />

                    <div className="field">
                      <label>Text on the shape</label>
                      <textarea
                        rows={2}
                        value={selected.text ?? ""}
                        onChange={(event) =>
                          updateBlock(selected.id, { text: event.target.value })
                        }
                      />
                    </div>
                    {selected.text ? (
                      <>
                        <SelectField
                          label="Text placement"
                          value={selected.textPlacement ?? "inside"}
                          options={SHAPE_TEXT_PLACEMENTS.map((placement) => ({
                            value: placement,
                            label: SHAPE_TEXT_PLACEMENT_LABELS[placement],
                          }))}
                          onChange={(textPlacement) =>
                            updateBlock(selected.id, { textPlacement })
                          }
                        />
                        <p className="help-text" style={{ marginTop: 0 }}>
                          {(selected.textPlacement ?? "inside") === "inside"
                            ? selected.shapeKind === "line"
                              ? "A line has no inside — text placed in it sits across the line."
                              : "Text inside is held to the shape’s outline and cut off at it."
                            : "Text above takes its own height from the block, and the shape fills what is left."}
                        </p>
                        <StyleButton label="Text style" onOpen={() => setStyleSlot("text")} />
                      </>
                    ) : null}
                  </>
                ) : null}

                {selected.type === "story" ? (
                  <SelectField
                    label="Story"
                    value={selected.storyId ?? ""}
                    options={[
                      { value: "", label: "Select a story…" },
                      ...sources.stories.map((story) => ({ value: story._id, label: story.label })),
                    ]}
                    onChange={(storyId) => updateBlock(selected.id, { storyId })}
                  />
                ) : null}

                {selected.type === "collection" ? (
                  <SelectField
                    label="Collection"
                    value={selected.collectionId ?? ""}
                    options={[
                      { value: "", label: "Select a collection…" },
                      ...sources.collections.map((collection) => ({
                        value: collection._id,
                        label: collection.label,
                      })),
                    ]}
                    onChange={(collectionId) => updateBlock(selected.id, { collectionId })}
                  />
                ) : null}

                {selected.type === "form" ? (
                  <SelectField
                    label="Form"
                    value={selected.formId ?? ""}
                    options={[
                      { value: "", label: "Select a form…" },
                      ...sources.forms.map((form) => ({ value: form._id, label: form.label })),
                    ]}
                    onChange={(formId) => updateBlock(selected.id, { formId })}
                  />
                ) : null}

                {selected.type === "sponsorScroll" ? (
                  <SponsorScrollFields
                    settings={normalizeSponsorScroll(selected.sponsorScroll)}
                    levels={sources.recognitionLevels}
                    onChange={(sponsorScroll) =>
                      updateBlock(selected.id, { sponsorScroll })
                    }
                  />
                ) : null}
              </div>

              <div className="inspector-section">
                <h4 className="inspector-title">Click action</h4>
                <SelectField
                  label="On click"
                  value={selected.clickAction ?? "none"}
                  options={[
                    { value: "none", label: "Nothing" },
                    { value: "link", label: "Open a link" },
                    { value: "page", label: "Go to a page" },
                  ]}
                  onChange={(clickAction) => updateBlock(selected.id, { clickAction })}
                />
                {selected.clickAction === "link" ? (
                  <>
                    <TextField
                      label="URL"
                      value={selected.clickTarget ?? ""}
                      onChange={(clickTarget) => updateBlock(selected.id, { clickTarget })}
                    />
                    <CheckField
                      label="Open in a new tab"
                      value={Boolean(selected.newTab)}
                      onChange={(newTab) => updateBlock(selected.id, { newTab })}
                    />
                  </>
                ) : null}
                {selected.clickAction === "page" ? (
                  <SelectField
                    label="Page"
                    value={selected.clickTarget ?? ""}
                    options={[
                      { value: "", label: "Select a page…" },
                      ...pages.map((item) => ({ value: item.id, label: item.name })),
                    ]}
                    onChange={(clickTarget) => updateBlock(selected.id, { clickTarget })}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="inspector-section">
                <h4 className="inspector-title">
                  {editingTemplate ? `Layout: ${editingTemplate.name}` : "Page"}
                </h4>
                <p className="help-text" style={{ marginTop: 0 }}>
                  {editingTemplate
                    ? "Blocks added here belong to the layout. Lock one to fix it on every page, or unlock it to hand each page its own copy."
                    : "Add blocks from the list below. Blocks that come from a layout are shown here but edited on the layout."}
                </p>
              </div>

          <div className="inspector-section">
            <h4 className="inspector-title">Blocks</h4>
            <div className="block-palette">
              {PUBLICATION_BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  title={BLOCK_LABELS[type]}
                  onClick={() => addBlock(type)}
                >
                  <IconView name={BLOCK_ICONS[type]} width="1.25rem" height="1.25rem" />
                  {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
            </>
          )}
        </aside>
      </div>

      {/* Off-screen rather than hidden: a display:none subtree has no size
          and so nothing to capture. */}
      {exportStage ? (
        <div className="pub-export-stage" aria-hidden="true">
          <PublicationViewer
            // A layout has no page of its own, so it is staged as one in order
            // to be exported like anything else.
            pages={
              editingTemplate
                ? [
                    {
                      ...createPublicationPage(0),
                      ...emptyBackground,
                      backgroundType: editingTemplate.backgroundType,
                      backgroundColor: editingTemplate.backgroundColor,
                      backgroundMediaUrl: editingTemplate.backgroundMediaUrl,
                      backgroundFit: editingTemplate.backgroundFit,
                      backgroundOffsetX: editingTemplate.backgroundOffsetX,
                      backgroundOffsetY: editingTemplate.backgroundOffsetY,
                      kenBurns: editingTemplate.kenBurns,
                      name: editingTemplate.name,
                      blocks: editingTemplate.blocks,
                    },
                  ]
                : pages
            }
            repeatedBlocks={repeatedBlocks}
            pageTemplates={pageTemplates}
            canvas={activeCanvas}
            transition="none"
            slideshow={{ ...slideshow, enabled: false }}
            audio={{ ...audio, autoplay: false, url: "" }}
            sources={canvasSources}
            showControls={false}
          />
        </div>
      ) : null}
    </div>
  );
}


/**
 * A sponsor scroll's settings, on a slide.
 *
 * No height here, unlike the page builder's version: the block is a rectangle
 * somebody drew on the canvas and its own box is the band. Two heights would
 * be two settings that could disagree, and only one of them would be the one
 * being looked at.
 */
function SponsorScrollFields({
  settings,
  levels,
  onChange,
}: {
  settings: SponsorScrollSettings;
  levels: { _id: string; name: string }[];
  onChange: (settings: SponsorScrollSettings) => void;
}) {
  const patch = (next: Partial<SponsorScrollSettings>) =>
    onChange({ ...settings, ...next });

  return (
    <>
      <NumField
        label="Seconds per logo"
        value={settings.secondsPerLogo}
        min={0.5}
        max={60}
        step={0.5}
        onChange={(value) => patch({ secondsPerLogo: value })}
      />
      <span className="help-text">
        How long one logo takes to cross the block. Set per logo, so adding a
        sponsor makes the run longer rather than making everything faster. The
        block’s own height sizes the logos.
      </span>

      <SelectField
        label="Travels"
        value={settings.direction}
        options={[
          { value: "left", label: "Right to left" },
          { value: "right", label: "Left to right" },
        ]}
        onChange={(value) =>
          patch({ direction: value as SponsorScrollSettings["direction"] })
        }
      />

      <CheckField
        label="Stop while the pointer is over it"
        value={settings.pauseOnHover}
        onChange={(value) => patch({ pauseOnHover: value })}
      />

      <div className="field">
        <label>Recognition levels</label>
        {levels.length === 0 ? (
          <span className="help-text">
            No recognition levels are defined yet, so there are no logos to
            draw on.
          </span>
        ) : (
          <>
            <div className="chip-picker">
              {levels.map((level) => (
                <label key={level._id} className="chip-option">
                  <input
                    type="checkbox"
                    checked={settings.levelIds.includes(level._id)}
                    onChange={(event) =>
                      patch({
                        levelIds: event.target.checked
                          ? [...settings.levelIds, level._id]
                          : settings.levelIds.filter((id: string) => id !== level._id),
                      })
                    }
                  />
                  {level.name}
                </label>
              ))}
            </div>
            <span className="help-text">
              {settings.levelIds.length === 0
                ? "Every level, since none is named."
                : "Only sponsors at these levels."}{" "}
              A level marked anonymous is never included.
            </span>
          </>
        )}
      </div>
    </>
  );
}
