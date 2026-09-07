"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
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
  blockHtml,
  blockTextProps,
  CellBlockView,
  PublicationBlockView,
  PublicationTableView,
  publicationBlockStyle,
  type PublicationSources,
} from "@/components/publication-blocks";
import { PublicationExport } from "@/components/publication-export";
import { PublicationViewer } from "@/components/publication-viewer";
import {
  applyAttributesToHtml,
  RichTextEditor,
} from "@/components/rich-text-editor";
import { InlineStyleEditor } from "@/components/style-editor";
import { IconView } from "@/components/icons";
import { IconSearchField } from "@/components/icon-search";
import type { AdminExit } from "@/lib/admin-exit";
import type { BuilderSources } from "@/lib/builder-sources";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { plainTextToRichText, richTextToPlainText } from "@/lib/rich-text";
import { parseColor } from "@/lib/color";
import type { StyleValues } from "@/lib/style-values";
import { cleanStyle, DEFAULT_TABLE_ACCENT } from "@/lib/table-style";
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
  resizeSelection,
  tableSize,
  withCellChanged,
  withColumnAdded,
  withColumnRemoved,
  withRowAdded,
  withRowRemoved,
  withAxisChanged,
  withCellKind,
  withColumnWidth,
  withRowHeight,
  MIN_TABLE_CELL,
  TABLE_CELL_BLOCK_TYPES,
  TABLE_CELL_BLOCK_LABELS,
  type PublicationTable,
  type PublicationTableCell,
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
import { TableFormatBar } from "./table-format-bar";

const BLOCK_ICONS: Record<string, string> = {
  richText: "Type",
  image: "Image",
  video: "Video",
  button: "MousePointerClick",
  qrCode: "QrCode",
  icon: "Sparkles",
  shape: "Square",
  customShape: "Shapes",
  table: "Table",
  story: "Newspaper",
  collection: "Images",
  form: "ClipboardList",
  sponsorScroll: "GalleryHorizontal",
};

const BLOCK_LABELS: Record<string, string> = {
  richText: "Text",
  image: "Image",
  video: "Video",
  button: "Button",
  qrCode: "QR code",
  icon: "Icon",
  shape: "Shape",
  customShape: "Custom shape",
  table: "Table",
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
const TEXTLESS_BLOCKS = new Set(["image", "video", "table"]);

/**
 * Blocks whose words are written in place, on the canvas.
 *
 * Every one of them keeps its words in `html`, so the same editor serves all
 * four — a caption, a button's face and the writing on a shape are the same
 * kind of thing and take the same toolbar.
 */
const WRITEABLE_BLOCKS = new Set(["richText", "button", "shape", "customShape"]);

/** Whether a block's content is words, and so is edited with a caret. */
function isWriteable(type: string): boolean {
  return WRITEABLE_BLOCKS.has(type);
}

/** What the style panel is called for each block. */
const STYLE_PANEL_TITLES: Record<string, string> = {
  image: "Image style",
  video: "Video style",
  icon: "Icon style",
  button: "Button style",
};
/** The two dressable parts of a block: its text, and — for shapes — the shape. */
type StyleSlot = "text" | "shape" | "table" | "tableHeader" | "tableCell" | "cell";

/** What each style slot is called in the panel, and where it writes. */
const STYLE_SLOT_TITLES: Record<StyleSlot, string> = {
  text: "Text style",
  shape: "Shape style",
  table: "Table style",
  tableHeader: "Header cells",
  tableCell: "All cells",
  cell: "This cell",
};

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
            {/* Said in the list, because the whole point of the setting is
                that this page is not where the one above it leads. */}
            {item.hidden ? (
              <span className="help-text" style={{ marginLeft: "0.4rem" }}>
                linked only
              </span>
            ) : null}
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

/**
 * How this editor recognises its own blocks on the machine's clipboard.
 *
 * A key nothing else would write, so a paste of ordinary JSON copied from
 * somewhere else is read as the words it is rather than mistaken for a page.
 */
const BLOCK_CLIPBOARD_KEY = "aperturePublicationBlocks";

/** What an undo puts back. */
type DocumentSnapshot = {
  pages: PublicationPage[];
  pageTemplates: PublicationPageTemplate[];
};

/**
 * Changes closer together than this are one step.
 *
 * Long enough that a drag, a resize or a run of typing comes back in one
 * press; short enough that two deliberate actions stay two.
 */
const HISTORY_COALESCE_MS = 500;
/** Snapshots are whole pages, so the stack is bounded rather than endless. */
const HISTORY_LIMIT = 60;

/**
 * The controls that say what a block *is* — its words, its picture, its icon,
 * the shape it draws — as opposed to where it sits or how it is dressed.
 *
 * Lifted out of the inspector so that a block inside a table cell is edited
 * with exactly the same controls as one standing on the canvas. A cell holds
 * ordinary blocks, so anything else would be a second, poorer editor for the
 * same things.
 */
function BlockContentFields({
  block,
  update,
  sources,
  pages,
  setStyleSlot,
}: {
  block: PublicationBlock;
  update: (patch: Partial<PublicationBlock>) => void;
  sources: BuilderSources;
  pages: PublicationPage[];
  setStyleSlot: (slot: StyleSlot | null) => void;
}) {
  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Content</h4>

        {block.type === "richText" ? (
          <>
            <p className="help-text">
              Double-click the block to write in it. The bar above the
              canvas formats whatever the caret is in; sizes are stored
              in rem and scale with the viewer.
            </p>
            <StyleButton label="Text style" onOpen={() => setStyleSlot("text")} />
          </>
        ) : null}

        {block.type === "image" || block.type === "video" ? (
          <>
            <MediaField
              label={block.type === "image" ? "Image" : "Video"}
              value={block.mediaUrl ?? ""}
              mediaType={block.type}
              onChange={(url, asset) =>
                update({ mediaUrl: url, mediaId: asset?._id ?? "" })
              }
            />
            <SelectField
              label="Fit"
              value={block.objectFit ?? "cover"}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
              ]}
              onChange={(objectFit) => update({ objectFit })}
            />
            {/* Corners, border, shadow and the rest come from the
                style now, rather than a lone radius field. */}
            <StyleButton
              label={block.type === "image" ? "Image style" : "Video style"}
              onOpen={() => setStyleSlot("text")}
            />
            {block.type === "video" ? (
              <>
                <CheckField
                  label="Autoplay"
                  value={Boolean(block.autoplay)}
                  onChange={(autoplay) => update({ autoplay })}
                />
                <CheckField
                  label="Loop"
                  value={block.loop !== false}
                  onChange={(loop) => update({ loop })}
                />
                <CheckField
                  label="Muted"
                  value={block.muted !== false}
                  onChange={(muted) => update({ muted })}
                />
                <CheckField
                  label="Show controls"
                  value={Boolean(block.controls)}
                  onChange={(controls) => update({ controls })}
                />
              </>
            ) : null}
          </>
        ) : null}

        {block.type === "button" ? (
          <>
            <p className="help-text">
              Double-click the button to write its face.
            </p>
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

        {block.type === "qrCode" ? (
          <>
            <TextField
              label="Value or URL"
              value={block.qrValue ?? ""}
              onChange={(qrValue) => update({ qrValue })}
            />
            <ColorField
              label="Colour"
              value={block.color ?? "#000000"}
              onChange={(color) => update({ color })}
            />
          </>
        ) : null}

        {block.type === "icon" ? (
          <>
            <IconSearchField
              value={block.iconName ?? "star"}
              onChange={(iconName) => update({ iconName })}
            />
            <StyleButton label="Icon style" onOpen={() => setStyleSlot("text")} />
          </>
        ) : null}

        {/* Both shape blocks carry the same controls — they differ only
            in where the outline comes from, a preset or an uploaded
            file. */}
        {block.type === "shape" || block.type === "customShape" ? (
          <>
            {block.type === "shape" ? (
              <SelectField
                label="Shape"
                value={block.shapeKind ?? "rectangle"}
                options={SHAPE_KINDS.map((value) => ({
                  value,
                  label: SHAPE_KIND_LABELS[value],
                }))}
                onChange={(shapeKind) => update({ shapeKind })}
              />
            ) : (
              <SelectField
                label="Shape"
                value={block.shapeSlug ?? ""}
                options={[
                  { value: "", label: "Select a shape…" },
                  ...sources.shapes.map((shape) => ({
                    value: shape.slug,
                    label: shape.name,
                  })),
                ]}
                onChange={(shapeSlug) => update({ shapeSlug })}
              />
            )}

            {/* Fill, outline and corners all live in the shape's style
                now, so there is no separate colour field. */}
            <StyleButton label="Shape style" onOpen={() => setStyleSlot("shape")} />

            <p className="help-text">
              Double-click the shape to write on it.
            </p>
            {richTextToPlainText(blockHtml(block)).trim() ? (
              <>
                <SelectField
                  label="Text placement"
                  value={block.textPlacement ?? "inside"}
                  options={SHAPE_TEXT_PLACEMENTS.map((placement) => ({
                    value: placement,
                    label: SHAPE_TEXT_PLACEMENT_LABELS[placement],
                  }))}
                  onChange={(textPlacement) =>
                    update({ textPlacement })
                  }
                />
                <p className="help-text" style={{ marginTop: 0 }}>
                  {(block.textPlacement ?? "inside") === "inside"
                    ? block.shapeKind === "line"
                      ? "A line has no inside — text placed in it sits across the line."
                      : "Text inside is held to the shape’s outline and cut off at it."
                    : "Text above takes its own height from the block, and the shape fills what is left."}
                </p>
                <StyleButton label="Text style" onOpen={() => setStyleSlot("text")} />
              </>
            ) : null}
          </>
        ) : null}

        {block.type === "story" ? (
          <SelectField
            label="Story"
            value={block.storyId ?? ""}
            options={[
              { value: "", label: "Select a story…" },
              ...sources.stories.map((story) => ({ value: story._id, label: story.label })),
            ]}
            onChange={(storyId) => update({ storyId })}
          />
        ) : null}

        {block.type === "collection" ? (
          <SelectField
            label="Collection"
            value={block.collectionId ?? ""}
            options={[
              { value: "", label: "Select a collection…" },
              ...sources.collections.map((collection) => ({
                value: collection._id,
                label: collection.label,
              })),
            ]}
            onChange={(collectionId) => update({ collectionId })}
          />
        ) : null}

        {block.type === "form" ? (
          <SelectField
            label="Form"
            value={block.formId ?? ""}
            options={[
              { value: "", label: "Select a form…" },
              ...sources.forms.map((form) => ({ value: form._id, label: form.label })),
            ]}
            onChange={(formId) => update({ formId })}
          />
        ) : null}

        {block.type === "sponsorScroll" ? (
          <SponsorScrollFields
            settings={normalizeSponsorScroll(block.sponsorScroll)}
            levels={sources.recognitionLevels}
            onChange={(sponsorScroll) =>
              update({ sponsorScroll })
            }
          />
        ) : null}
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Click action</h4>
        <SelectField
          label="On click"
          value={block.clickAction ?? "none"}
          options={[
            { value: "none", label: "Nothing" },
            { value: "link", label: "Open a link" },
            { value: "page", label: "Go to a page" },
          ]}
          onChange={(clickAction) => update({ clickAction })}
        />
        {block.clickAction === "link" ? (
          <>
            <TextField
              label="URL"
              value={block.clickTarget ?? ""}
              onChange={(clickTarget) => update({ clickTarget })}
            />
            <CheckField
              label="Open in a new tab"
              value={Boolean(block.newTab)}
              onChange={(newTab) => update({ newTab })}
            />
          </>
        ) : null}
        {block.clickAction === "page" ? (
          <SelectField
            label="Page"
            value={block.clickTarget ?? ""}
            options={[
              { value: "", label: "Select a page…" },
              // Pages kept out of the order are named as such: they
              // are exactly what this control is most often for, and a
              // list that did not say so would look like a duplicate.
              ...pages.map((item) => ({
                value: item.id,
                label: item.hidden ? `${item.name} (linked only)` : item.name,
              })),
            ]}
            onChange={(clickTarget) => update({ clickTarget })}
          />
        ) : null}
      </div>
    </>
  );
}

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
   * Which post view to open on.
   *
   * Saving no longer navigates, so this is only for arriving with one named —
   * a preview link coming back, or an address somebody kept. The open view is
   * still saved onto the record, which is what the published page uses.
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
  /**
   * What a paste is doing, while it is doing it.
   *
   * Only ever set for a pasted picture, which is the one that goes to the
   * network: a block or a line of words is on the page before anybody could
   * read a notice about it. Doubles as where the failure is said, since a
   * paste that quietly does nothing is indistinguishable from one that was
   * never noticed.
   */
  const [pasting, setPasting] = useState("");
  const [saving, startSaving] = useTransition();
  /**
   * True for a few seconds after a save.
   *
   * An acknowledgement that never goes away stops being one — by the tenth
   * edit, a button reading "Saved" is a button reading nothing.
   */
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [slideshow, setSlideshow] = useState(publication.slideshow);
  const [audio, setAudio] = useState(publication.audio);
  const [pages, setPagesState] = useState<PublicationPage[]>(
    publication.pages.length > 0 ? publication.pages : [createPublicationPage(0)]
  );
  /*
   * Blocks repeated on every page are no longer edited here: layouts do that
   * job, and having both was two ways to say the same thing. Anything already
   * saved keeps rendering, and keeps being saved, so no published publication
   * changes underfoot.
   */
  const [repeatedBlocks] = [publication.repeatedBlocks];
  const [pageTemplates, setPageTemplatesState] = useState<PublicationPageTemplate[]>(
    publication.pageTemplates
  );

  /* ------------------------------------------------------------- History */

  /**
   * What an undo restores: the pages and the layouts, which between them are
   * everything anybody draws.
   *
   * Deliberately not the publication's own settings — its title, its slug, its
   * status. Those are typed into fields that undo themselves, and rolling one
   * back because a block moved would be a surprise.
   */
  const undoStack = useRef<DocumentSnapshot[]>([]);
  const redoStack = useRef<DocumentSnapshot[]>([]);
  /** Only so the buttons can grey out; the stacks themselves live in refs. */
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });

  /**
   * The document as it stands, for the history to take a copy of.
   *
   * Kept in a ref because `record` runs from event handlers that outlive the
   * render which made them, and a stale copy would undo to the wrong place.
   */
  const documentRef = useRef<DocumentSnapshot>({ pages, pageTemplates });
  useEffect(() => {
    documentRef.current = { pages, pageTemplates };
  }, [pages, pageTemplates]);

  /**
   * Whether a run of changes is still going.
   *
   * Set when one is recorded and cleared a moment after the last of them, so
   * the window stretches for as long as changes keep arriving — a drag lasting
   * five seconds is still one step. A timer rather than a clock reading:
   * nothing here may depend on when it happened to be called.
   */
  const coalescing = useRef(false);
  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
  }, []);

  function syncHistoryDepth() {
    setHistoryDepth((current) =>
      current.undo === undoStack.current.length && current.redo === redoStack.current.length
        ? current
        : { undo: undoStack.current.length, redo: redoStack.current.length }
    );
  }

  /**
   * Remembers where the document stood, before it is changed.
   *
   * Changes arriving in quick succession are one step, not many. A block
   * dragged across the page writes a new position every frame, and a hundred
   * undos to cross it back is not an undo anybody wants — so a run of changes
   * keeps the snapshot taken before the run started, and the whole gesture
   * comes back in one press.
   */
  function record() {
    // Anything done after an undo is a new branch: what was undone is gone.
    redoStack.current = [];

    // Only the first change of a run is remembered; the rest join it.
    if (!coalescing.current) {
      undoStack.current = [
        ...undoStack.current.slice(-(HISTORY_LIMIT - 1)),
        documentRef.current,
      ];
    }

    coalescing.current = true;
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
    coalesceTimer.current = setTimeout(() => {
      coalescing.current = false;
    }, HISTORY_COALESCE_MS);

    syncHistoryDepth();
  }

  function applySnapshot(snapshot: DocumentSnapshot) {
    documentRef.current = snapshot;
    setPagesState(snapshot.pages);
    setPageTemplatesState(snapshot.pageTemplates);
    // Undoing the page something was added to can leave the open page beyond
    // the end of the list, and `pages[pageIndex]` has to stay a page.
    setPageIndex((current) => Math.min(current, Math.max(0, snapshot.pages.length - 1)));
    // A restored document is a fresh starting point: the next edit records
    // rather than being folded into the run that led here.
    coalescing.current = false;
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current = [...redoStack.current, documentRef.current];
    applySnapshot(previous);
    syncHistoryDepth();
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current, documentRef.current];
    applySnapshot(next);
    syncHistoryDepth();
  }

  /**
   * The pages and the layouts, changed through the history.
   *
   * Every route that edits the document goes through these two, so recording
   * here is recording everywhere — no command has to remember to.
   */
  function setPages(update: (current: PublicationPage[]) => PublicationPage[]) {
    record();
    setPagesState(update);
  }

  function setPageTemplates(
    update: (current: PublicationPageTemplate[]) => PublicationPageTemplate[]
  ) {
    record();
    setPageTemplatesState(update);
  }
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
   * The box drawn around a selection of several, and the block its resize
   * handle reports as the one being dragged.
   *
   * Absent for a selection of one, which wears its own handles. The anchor is
   * only somewhere for the drag to start from — `startDrag` resizes everything
   * selected, not the block it is handed.
   */
  const selectionBox = (() => {
    const chosen = activeBlocks.filter((block) => selectedIds.includes(block.id));
    if (chosen.length < 2) return null;
    return { bounds: boundsOf(chosen), anchor: chosen[0] };
  })();

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
  /**
   * The bar above the canvas that the rich-text toolbar is portalled into.
   *
   * One bar rather than a toolbar per block: a block being written in is
   * already the thing being looked at, and a toolbar growing out of it would
   * cover the page around it — which is the arrangement being judged.
   */
  const [formatBar, setFormatBar] = useState<HTMLDivElement | null>(null);
  /**
   * The text block the caret is in, if any.
   *
   * Writing happens on the canvas, in the block itself, rather than in a panel
   * beside it. Held as an id so it survives the blocks being replaced on every
   * edit, and cleared whenever the selection moves elsewhere.
   */
  const [writing, setWriting] = useState<{ ownerId: string; textId: string } | null>(
    null
  );
  /**
   * The cell being worked on, if any.
   *
   * A table is one block on the canvas, so selecting a table and selecting a
   * cell inside it are two different depths of the same selection: the block
   * id says which table, the address says which cell of it. Cleared whenever
   * the block selection moves, the same way writing is.
   */
  const [cellAt, setCellAt] = useState<
    { blockId: string; row: number; column: number } | null
  >(null);
  /**
   * The block inside a cell that the inspector is editing.
   *
   * A cell holds ordinary blocks, so choosing one has to reach the same
   * controls a block on the canvas gets — otherwise a picture in a table is a
   * picture nobody can change.
   */
  /** The far corner of a cell range; the near one is `cellAt`. */
  const [cellFocus, setCellFocus] = useState<{ row: number; column: number } | null>(
    null
  );
  /**
   * Whether the chosen cell has been opened.
   *
   * A cell has two depths, the way a group does. Pressing it chooses the cell —
   * the whole cell, padding and empty space included — and the bar above the
   * canvas then dresses it. Double-clicking goes inside, to the thing the cell
   * holds: a caret in its words, or the picture or shape itself, whose own
   * settings are then in the right column exactly as they would be for one
   * standing on the page.
   */
  const [insideCell, setInsideCell] = useState(false);
  /*
   * Writing and cell choice both end when the selection leaves the block.
   *
   * Read from the selection rather than cleared when it changes: every route
   * out — clicking the canvas, choosing another block, deleting this one,
   * changing page — moves the selection, and deriving it means none of them
   * has to remember to let go. The owner is the block on the canvas, not the
   * words: text in a table cell belongs to the table, which is what stays
   * selected while it is being written in.
   */
  const activeCell = cellAt && cellAt.blockId === selectedId ? cellAt : null;

  const spaceDown = useRef(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      // Space in a field or in the words being written is a space, not a
      // request to pan the canvas.
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true']"
        )
      ) {
        return;
      }
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
    /*
     * Ctrl or ⌘ alone, now that shift is what starts a marquee at all.
     *
     * Shift used to mean "add to the selection" here as well; leaving it in
     * would have made every marquee additive and left no way to draw one that
     * replaces what is chosen.
     */
    const additive = event.ctrlKey || event.metaKey;
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

  /*
   * Not memoized: it now records to the history before it writes, and the
   * history is rebuilt with the component. It is only ever called from event
   * handlers, so its identity changing between renders costs nothing.
   */
  function updatePage(index: number, patch: Partial<PublicationPage>) {
    setPages((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  }

  function setActiveBlocks(blocks: PublicationBlock[]) {
    updateBlocks(() => blocks);
  }

  /**
   * Changes the blocks from whatever they are *now*.
   *
   * The value form above reads the blocks as they were when this render ran,
   * which is right for anything that happens in one go. It is wrong for
   * anything that pauses: a change applied after an `await` would be built on
   * blocks from before it and would quietly undo whatever landed in between.
   */
  function updateBlocks(
    change: (blocks: PublicationBlock[]) => PublicationBlock[]
  ) {
    if (editingTemplate) {
      setPageTemplates((current) =>
        current.map((item) =>
          item.id === editingTemplate.id ? { ...item, blocks: change(item.blocks) } : item
        )
      );
      return;
    }
    setPages((current) =>
      current.map((item, index) =>
        index === pageIndex ? { ...item, blocks: change(item.blocks) } : item
      )
    );
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
  /*
   * Save, and stay.
   *
   * The slug is taken back from the server because `uniqueSlug` may have
   * changed it — two publications cannot share one — and the field on screen
   * would otherwise go on showing the name that was refused.
   */
  // Set where the saving happens and cleared on a timer, rather than both in
  // an effect — a state change is what an effect reacts to, not its job.
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startSaving(async () => {
      const result = await savePublicationAction(formData);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaveError("");
      if (result.slug !== slug) setSlug(result.slug);
      setJustSaved(true);
    });
  }

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
    const taken = activeBlocks
      .filter((block) => ids.includes(block.id))
      // A copy, so editing the original afterwards does not edit what was
      // taken — the clipboard holds what was there when it was copied.
      .map((block) => ({ ...block }));

    setClipboard(taken);

    /*
     * Written to the machine's clipboard as well as held here.
     *
     * So that there is one clipboard rather than two. With a private one, a
     * block copied in the morning would go on winning every paste for the rest
     * of the day — a picture copied from somewhere else afterwards would have
     * nowhere to land, because Ctrl+V already meant something. Putting the
     * blocks where everything else puts what it copies makes the most recent
     * copy the one that wins, whichever application it came from, and lets a
     * block be carried between two publications or two tabs into the bargain.
     *
     * The private copy stays as the fallback: writing to the clipboard needs a
     * secure context and can be refused, and a refusal must not cost somebody
     * the copy they just made.
     */
    void navigator.clipboard
      ?.writeText(JSON.stringify({ [BLOCK_CLIPBOARD_KEY]: 1, blocks: taken }))
      .catch(() => {});
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
    placeBlocks(clipboard);
  }

  function placeBlocks(blocks: PublicationBlock[]) {
    if (blocks.length === 0) return;

    const regroup = new Map<string, string>();
    const pasted = blocks.map((block, index) => {
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

  /**
   * Puts down whatever came off the machine's clipboard.
   *
   * Three things can arrive and they are tried in that order: blocks this
   * editor copied, a picture, then words. Anything else — a file that is not
   * an image, an empty clipboard — falls through to the blocks held privately,
   * so the old behaviour is still there when the clipboard has nothing to say.
   */
  async function pasteFromSystem(data: DataTransfer): Promise<boolean> {
    const text = data.getData("text/plain");

    // Ours, and therefore blocks rather than the JSON that carries them.
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.[BLOCK_CLIPBOARD_KEY] && Array.isArray(parsed.blocks)) {
          placeBlocks(parsed.blocks as PublicationBlock[]);
          return true;
        }
      } catch {
        // Not JSON, so not ours. It is just words, handled below.
      }
    }

    const picture = [...data.files].find((file) => file.type.startsWith("image/"));
    if (picture) {
      await pasteImage(picture);
      return true;
    }

    if (text.trim()) {
      pasteText(text);
      return true;
    }

    return false;
  }

  /**
   * A pasted picture, uploaded and laid on the page at its own shape.
   *
   * Uploaded rather than held as a data URL: a publication is saved as a
   * record and read back on other machines, and a picture that only exists
   * inside one browser's clipboard is a picture that is missing from every
   * other reader's copy. It goes to the media library like any other upload,
   * which is also what gives it a name, a thumbnail and a usage record.
   */
  async function pasteImage(file: File) {
    setPasting("Uploading the pasted image…");

    try {
      // Read before the upload, and from the file rather than the response:
      // this is the picture's own shape, and it decides the block's.
      const shape = await imageShape(file);

      const body = new FormData();
      // Named, because a clipboard picture arrives as `image.png` at best and
      // as nothing at all at worst, and a library of "image.png" is a library
      // nobody can search.
      body.append(
        "files",
        file,
        file.name || `pasted-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`
      );
      body.append("folder", "media");
      /*
       * Marked as a paste, so the media browsers can leave it out.
       *
       * A screenshot dropped into a slide is a real asset and is kept like any
       * other, but nobody chose to file it — it is a by-product of the edit.
       * Told apart here rather than guessed at later, because after the fact
       * there is nothing about the file that says how it arrived.
       */
      body.append("origin", "paste");

      const response = await fetch("/api/admin/media", { method: "POST", body });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.assets?.[0]) {
        // The library's own refusal, in words that mean something here: an
        // editor without the upload grant is told what they lack rather than
        // "Unauthorized", which reads as a fault in the editor.
        setPasting(
          response.status === 401
            ? "Pasting a picture uploads it to the media library, which your role cannot do."
            : (result?.error ?? "That image could not be uploaded.")
        );
        return;
      }

      const asset = result.assets[0];
      const block = createPublicationBlock("image");
      block.mediaUrl = asset.url ?? "";
      block.mediaId = String(asset._id ?? "");
      block.zIndex = activeBlocks.length + 1;

      /*
       * Sized to its own proportions, and never larger than most of the page.
       * A photograph off a phone is several thousand units wide; dropped on at
       * full size it would cover the slide and everything on it, and the first
       * thing anybody would have to do is shrink it back.
       */
      const fit = Math.min(
        1,
        (activeCanvas.width * 0.6) / shape.width,
        (activeCanvas.height * 0.6) / shape.height
      );
      block.width = Math.round(shape.width * fit);
      block.height = Math.round(shape.height * fit);
      block.x = Math.round((activeCanvas.width - block.width) / 2);
      block.y = Math.round((activeCanvas.height - block.height) / 2);

      setActiveBlocks([...activeBlocks, block]);
      setSelectedId(block.id);
      setStyleSlot(null);
      setPasting("");
    } catch {
      setPasting("That image could not be uploaded.");
    }
  }

  /** Pasted words, as a text block wide enough to hold them. */
  function pasteText(text: string) {
    const words = text.slice(0, 5000);
    const block = createPublicationBlock("richText");
    block.html = plainTextToRichText(words);
    block.zIndex = activeBlocks.length + 1;

    // Roughly as tall as the words need. An estimate, not a measurement — the
    // block is resizable, and the point is only that a paragraph does not
    // arrive in a box built for one line.
    const width = Math.min(activeCanvas.width - 160, 900);
    const lines = words
      .split("\n")
      .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 48)), 0);

    block.width = width;
    block.height = Math.min(activeCanvas.height - 80, Math.max(120, lines * 56));
    block.x = Math.round((activeCanvas.width - block.width) / 2);
    block.y = Math.round((activeCanvas.height - block.height) / 2);

    setActiveBlocks([...activeBlocks, block]);
    setSelectedId(block.id);
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

      /*
       * Undo and redo, for the canvas.
       *
       * Only reached when the caret is not in a text editor — the guard above
       * returns early for those — so Quill keeps its own undo for the words
       * being written, and this one puts back blocks, pages and layouts.
       */
      if (command && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }

      if (
        command &&
        ((event.shiftKey && event.key.toLowerCase() === "z") ||
          (!event.shiftKey && event.key.toLowerCase() === "y"))
      ) {
        event.preventDefault();
        redo();
        return;
      }

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

      /*
       * Ctrl+V is deliberately absent.
       *
       * Preventing the default of the keystroke would cancel the `paste` event
       * it produces, and that event is the only place the machine's clipboard
       * can be read — so handling the key here would mean never seeing a
       * pasted picture. The listener below does the whole job, including
       * falling back to the blocks held privately when the clipboard has
       * nothing to offer.
       */

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

  /**
   * A paste from anywhere: this editor, another tab, or another application.
   *
   * On the window rather than on the canvas, because nothing on the canvas
   * holds the focus — the page is a surface, not a field. Guarded exactly as
   * the keyboard shortcuts are, so pasting into a box in the inspector still
   * pastes into that box.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true']"
        )
      ) {
        return;
      }

      const data = event.clipboardData;
      if (!data) return;

      // Held before the handler goes async: the event's data is only readable
      // while the event is being dispatched.
      const files = [...data.files];
      const text = data.getData("text/plain");
      const hasSomething = files.length > 0 || Boolean(text);

      event.preventDefault();

      if (!hasSomething) {
        pasteClipboard();
        return;
      }

      void (async () => {
        const handled = await pasteFromSystem(data);
        // Nothing the clipboard offered could be used — a copied file that is
        // not a picture, most likely. The blocks held here are still a paste.
        if (!handled) pasteClipboard();
      })();
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // Reads the selection and the blocks as they stand, like the key handler.
  });

  /* --------------------------------------------------------------- Tables */

  /**
   * The table the format bar is acting on, and the cell inside it, if any.
   *
   * Derived rather than held: the blocks are replaced on every edit, so a held
   * copy would go stale the moment a column was resized.
   */
  const tableSelection = (() => {
    if (!selected || selected.type !== "table" || !selected.table) return null;
    const cell = activeCell
      ? { row: activeCell.row, column: activeCell.column }
      : null;
    return { block: selected, cell };
  })();

  /**
   * The cells being worked on, as a rectangle.
   *
   * A rectangle rather than one cell, because dressing a table is almost never
   * a one-cell job: a heading row, a column of figures, the whole grid. Two
   * corners are held and every cell between them is chosen, which is how a
   * spreadsheet has always done it.
   */
  const cellRange = (() => {
    // `activeCell` is the guarded one: it is null unless the chosen cell
    // belongs to the table that is selected now. Reading `cellAt` straight
    // would let a cell chosen in one table address the grid of another.
    if (!tableSelection?.block.table || !activeCell) return null;
    const table = tableSelection.block.table;
    // A focus left over from a taller table is clamped by the loops below.
    const focus = cellFocus ?? activeCell;

    const top = Math.min(activeCell.row, focus.row);
    const bottom = Math.max(activeCell.row, focus.row);
    const left = Math.min(activeCell.column, focus.column);
    const right = Math.max(activeCell.column, focus.column);

    const addresses: { row: number; column: number }[] = [];
    for (let row = top; row <= bottom && row < table.rows.length; row++) {
      for (let column = left; column <= right && column < table.columns.length; column++) {
        addresses.push({ row, column });
      }
    }
    if (addresses.length === 0) return null;

    return { blockId: tableSelection.block.id, addresses, anchor: addresses[0] };
  })();

  /** The one cell whose own content the inspector edits. */
  const cellContext = (() => {
    if (!cellRange || !tableSelection?.block.table) return null;
    const at = cellRange.anchor;
    const cell = tableSelection.block.table.cells[at.row]?.[at.column];
    return cell ? { blockId: cellRange.blockId, at, cell } : null;
  })();

  /*
   * The words a caret is in, if any.
   *
   * Only ever one, and only where the selection actually is: a block that is
   * selected, or the cell that is chosen. Anything else has been left, so its
   * editor is gone and its toolbar with it.
   */
  const editingTextId =
    writing && writing.ownerId === selectedId && writing.ownerId === writing.textId
      ? writing.textId
      : null;

  /**
   * The words the rich-text toolbar is acting on.
   *
   * A chosen cell always has an editor, whether or not it has been opened —
   * which is what keeps the text controls in the bar at all times rather than
   * only once somebody has double-clicked. Closed, the toolbar formats
   * everything in the cell; open, it formats what the caret has selected.
   */
  const cellText =
    cellContext && isWriteable(cellContext.cell.block.type) ? cellContext.cell : null;
  const insideCellText = insideCell && Boolean(cellText);
  /**
   * The block inside a cell whose own settings the right column shows.
   *
   * Having words and having nothing else are different things. A shape, an
   * uploaded outline and a button all carry words *and* a drawing to set up,
   * and treating "can be written in" as "is only words" left all three with a
   * caret and no way to reach the shape at all. Only plain text has nothing
   * beyond its words.
   */
  const cellContent =
    insideCell && cellContext && cellContext.cell.block.type !== "richText"
      ? cellContext.cell.block
      : null;
  /** Rewrites the block held by the cell the inspector is showing. */
  function updateCellBlock(patch: Partial<PublicationBlock>) {
    if (!cellContext) return;
    updateTable(cellContext.blockId, (table) =>
      withCellChanged(table, cellContext.at, (cell) => ({
        ...cell,
        block: { ...cell.block, ...patch },
      }))
    );
  }

  /** Applies one change to every chosen cell. */
  function updateChosenCells(
    change: (cell: PublicationTableCell) => PublicationTableCell
  ) {
    if (!cellRange) return;
    updateTable(cellRange.blockId, (table) =>
      cellRange.addresses.reduce(
        (current, at) => withCellChanged(current, at, change),
        table
      )
    );
  }

  /**
   * Choosing cells by dragging over them.
   *
   * A ref rather than state: it is read by a handler on every cell the pointer
   * crosses, and re-rendering the whole table on the way past each one would
   * make the sweep stutter.
   */
  const sweepingCells = useRef(false);
  function startCellSweep() {
    sweepingCells.current = true;
    const stop = () => {
      sweepingCells.current = false;
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointerup", stop);
  }

  /** The rows and columns the chosen cells sit in. */
  const chosenRows = [...new Set(cellRange?.addresses.map((at) => at.row) ?? [])];
  const chosenColumns = [...new Set(cellRange?.addresses.map((at) => at.column) ?? [])];

  /** Sets the size of the chosen rows or columns. */
  function resizeChosen(axis: "rows" | "columns", size: number) {
    if (!cellRange) return;
    const indexes = axis === "rows" ? chosenRows : chosenColumns;
    updateTable(cellRange.blockId, (table) =>
      axis === "rows"
        ? withRowHeight(table, indexes, size)
        : withColumnWidth(table, indexes, size)
    );
  }

  /**
   * Dresses whole rows or columns.
   *
   * Merged into what the axis already says, so setting a fill does not discard
   * an alignment set separately; `undefined` in the patch clears that one key,
   * which is how "no fill" is said.
   */
  function dressAxis(axis: "rows" | "columns", patch: StyleValues) {
    if (!cellRange) return;
    const indexes = axis === "rows" ? chosenRows : chosenColumns;
    updateTable(cellRange.blockId, (table) =>
      withAxisChanged(table, axis, indexes, (entry) => ({
        ...entry,
        style: cleanStyle({ ...entry.style, ...patch }),
      }))
    );
  }

  /**
   * Spreads a formatting change across the rest of the chosen cells.
   *
   * The toolbar drives one editor — the cell the choice was started at — so
   * pressing bold with six cells chosen would otherwise bold one. The other
   * five are formatted end to end with the same attributes, through a Quill of
   * their own, so whatever the toolbar meant they mean the same.
   */
  async function spreadCellFormat(attributes: Record<string, unknown>) {
    if (!cellRange || !cellContext || cellRange.addresses.length < 2) return;

    const blockId = cellRange.blockId;
    const table = activeBlocks.find((entry) => entry.id === blockId)?.table;
    if (!table) return;

    const others = cellRange.addresses.filter(
      (at) => at.row !== cellContext.at.row || at.column !== cellContext.at.column
    );

    // Read the words first, then format them: the blocks are replaced on every
    // edit, and a cell read after the await would be a cell from before it.
    const formatted = await Promise.all(
      others.map(async (at) => ({
        at,
        html: await applyAttributesToHtml(
          blockHtml(table.cells[at.row][at.column].block),
          attributes
        ),
      }))
    );

    updateTable(blockId, (current) =>
      formatted.reduce(
        (next, { at, html }) =>
          withCellChanged(next, at, (cell) => ({
            ...cell,
            block: { ...cell.block, html },
          })),
        current
      )
    );
  }

  /** Changes what the chosen cells hold. Each cell holds exactly one thing. */
  function setCellKind(type: (typeof TABLE_CELL_BLOCK_TYPES)[number]) {
    updateChosenCells((cell) => withCellKind(cell, type));
  }

  /**
   * Dresses the chosen cells.
   *
   * Merged into whatever each already wears rather than replacing it, so
   * setting a background across a selection does not wipe the borders the
   * cells were given separately.
   */
  function dressChosenCells(patch: StyleValues) {
    updateChosenCells((cell) => ({
      ...cell,
      style: cleanStyle({ ...cell.style, ...patch }),
    }));
  }

  /** Rewrites a table block's grid, keeping its box the size of the grid. */
  function updateTable(
    blockId: string,
    change: (table: PublicationTable) => PublicationTable
  ) {
    // Read at the moment it is applied, not at the moment it was asked for:
    // formatting several cells at once resumes after an await, and the words
    // typed into the first of them must still be there.
    updateBlocks((blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId || !block.table) return block;

        const table = change(block.table);
        const size = tableSize(table);
        return {
          ...block,
          table,
          width: size.width,
          // The height is a floor here too: a table already grown to fit its
          // words must not shrink back because a colour was changed.
          height: Math.max(size.height, block.height),
        };
      })
    );
  }

  /**
   * Grows a table block to whatever its grid actually drew.
   *
   * Row heights are minimums, so a cell with more words than fit makes the
   * table taller than the sum of them. The block's box is what the outline,
   * the handles and the export all read, so it has to be the measured height
   * rather than the intended one — otherwise the rows past the bottom edge are
   * simply cut off, which is exactly what was happening.
   */
  function measuredTable(blockId: string, drawn: number) {
    const block = activeBlocks.find((entry) => entry.id === blockId);
    if (!block?.table) return;

    const height = Math.round(drawn);
    // A pixel of rounding is not a change worth recording in the history.
    if (Math.abs(height - block.height) <= 1) return;
    updateBlock(blockId, { height });
  }

  /**
   * Lines the selection up, against itself or against the page.
   *
   * A group counts as one thing and travels whole — the arrangement inside it
   * is the reason it was grouped, so lining a group up must not take it apart.
   * The exception is a group that has been opened, where the member somebody
   * chose lines up on its own.
   */
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
          : boundsOf(chosen),
        openGroupId
      )
    );
  }

  function distribute(axis: "horizontal" | "vertical") {
    setActiveBlocks(distributeBlocks(activeBlocks, selectedIds, axis, openGroupId));
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

  /**
   * The pasted picture's own dimensions.
   *
   * Read from the file in the browser rather than taken from the upload's
   * reply: the reply's width and height describe the thumbnail that was
   * generated from it, and a block built to a thumbnail's proportions would be
   * right only by coincidence.
   */
  async function imageShape(file: File): Promise<{ width: number; height: number }> {
    try {
      const bitmap = await createImageBitmap(file);
      const shape = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return shape;
    } catch {
      // A format the decoder will not open — an SVG in some browsers. The
      // block still gets a sensible box rather than a zero-sized one.
      return { width: 800, height: 600 };
    }
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

    /*
     * A resize keeps whatever is selected rather than narrowing to the block
     * whose handle was grabbed. The handle belongs to the selection's box, and
     * a group or a multiple selection scales as one — the alternative, silently
     * dropping to one block, would resize something other than what is lit up.
     */
    if (mode === "move") selectBlock(event, block);
    else if (!selectedIds.includes(block.id)) setSelectedIds(blockSelection(block));

    const startX = event.clientX;
    const startY = event.clientY;

    /*
     * Everything that moves with it, and where each of them started.
     *
     * Taken once, before the first move: reading the blocks again on every
     * pointer event would compound each rounding, and a selection dragged
     * across the page would drift apart.
     */
    const moving = selectedIds.includes(block.id)
      ? withGroupMembers(activeBlocks, selectedIds)
      : blockSelection(block);
    const origins = new Map(
      activeBlocks
        .filter((entry) => moving.includes(entry.id))
        .map((entry) => [entry.id, { x: entry.x, y: entry.y }])
    );

    /*
     * The box a resize works on, and the blocks as they stood inside it.
     *
     * Held once, before the first move, and every frame recomputed from it:
     * scaling the current blocks by each frame's small factor would compound
     * the rounding, and a block dragged out and back would not come home.
     */
    const startBlocks = activeBlocks;
    const origin = boundsOf(
      activeBlocks.filter((entry) => moving.includes(entry.id))
    );

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;

      if (mode === "resize") {
        setActiveBlocks(
          resizeSelection(startBlocks, moving, origin, {
            width: origin.width + deltaX,
            height: origin.height + deltaY,
          })
        );
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
      {/*
        * The form is a bag of values to post, not a navigation.
        *
        * `onSubmit` rather than `action`: a server action given to `action`
        * navigates, and a navigation remounts the editor — which is a new
        * editor, on page one, with nothing selected and the zoom back to
        * default. Called from here it just saves, and everything on screen
        * stays where it was.
        */}
      <form onSubmit={handleSave} id="publication-form">
        {/* Still carried, so the way back out is whatever it was. */}
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

        <div className="pub-history">
          <button
            type="button"
            className="btn btn-sm"
            title="Undo (Ctrl+Z)"
            disabled={historyDepth.undo === 0}
            onClick={undo}
          >
            <IconView name="Undo2" size={15} />
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Redo (Ctrl+Shift+Z)"
            disabled={historyDepth.redo === 0}
            onClick={redo}
          >
            <IconView name="Redo2" size={15} />
          </button>
        </div>

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
        {/*
          * The button says what happened, since nothing else does any more.
          *
          * A redirect used to be the acknowledgement — the page moved, so
          * plainly something had been saved. Staying put means the save has to
          * announce itself, and the button is where somebody is already
          * looking when they want to know.
          */}
        <button
          type="submit"
          form="publication-form"
          className="btn btn-primary btn-sm"
          disabled={saving}
        >
          {saving ? "Saving\u2026" : justSaved ? "Saved" : "Save"}
        </button>

        {saveError ? (
          <span className="builder-save-error" role="alert">
            {saveError}
          </span>
        ) : null}
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

              {editingTemplate ? null : (
                <>
                  <CheckField
                    label="Keep out of the page order"
                    value={Boolean(page.hidden)}
                    onChange={(hidden) => updatePage(pageIndex, { hidden })}
                  />
                  <p className="help-text" style={{ marginTop: "-0.4rem" }}>
                    {page.hidden ? (
                      <>
                        Skipped by the arrows, the wheel, the keyboard and the
                        slideshow, and left out of the PDF. Reached only by a
                        link on another page &mdash; set one on a block&rsquo;s{" "}
                        <em>When clicked</em>.
                      </>
                    ) : (
                      <>
                        For an appendix, a footnote or the small print: a page
                        that is part of the publication but not on the way
                        through it.
                      </>
                    )}
                  </p>

                  {page.hidden ? (
                    <>
                      <CheckField
                        label="Offer a way back"
                        value={page.showBack !== false}
                        onChange={(showBack) => updatePage(pageIndex, { showBack })}
                      />
                      {page.showBack !== false ? (
                        <TextField
                          label="Back button says"
                          value={page.backLabel ?? "Back"}
                          onChange={(backLabel) => updatePage(pageIndex, { backLabel })}
                        />
                      ) : null}
                      <p className="help-text" style={{ marginTop: "-0.4rem" }}>
                        Returns to whichever page the reader followed a link
                        from, so the same page can be reached from several and
                        still send everybody back where they were. Shown only
                        when they arrived by a link.
                      </p>
                    </>
                  ) : null}
                </>
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
        <div className="pub-canvas-column">
          {/*
            The formatting bar, above the canvas and across it.

            It holds whatever the thing being edited puts there: the rich-text
            toolbar while the caret is in a block's words, table controls while
            a table is selected. Always mounted, so a toolbar always has
            somewhere to arrive, and unobtrusive when there is nothing in it.
          */}
          <div
            className={`pub-format-bar${
              editingTextId || cellText || tableSelection ? " is-active" : ""
            }`}
            // A press in the bar must not reach the workspace behind it, which
            // would drop the selection the bar is acting on.
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="pub-format-bar-slot" ref={setFormatBar} />
            {tableSelection?.block.table ? (
              <TableFormatBar
                table={tableSelection.block.table}
                cell={cellContext?.cell ?? null}
                cells={cellRange?.addresses.length ?? 0}
                rows={chosenRows}
                columns={chosenColumns}
                onTable={(change) => updateTable(tableSelection.block.id, change)}
                onKind={setCellKind}
                onDressCells={dressChosenCells}
                onDressAxis={dressAxis}
                onSize={resizeChosen}
              />
            ) : null}

            {!editingTextId && !tableSelection ? (
              <span className="pub-format-bar-hint">
                Double-click text to write in it
              </span>
            ) : null}
          </div>

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
             * Shift draws a marquee; a plain drag moves the canvas.
             *
             * The canvas is bigger than the window at any zoom worth working
             * at, so reaching a part of the page is the gesture that comes
             * first and the one the hand should already be doing. Selecting
             * several blocks at once is deliberate, and asking for a key is
             * how it stays out of the way of simply moving about. Space and
             * the middle button still pan, so a hand already holding either
             * keeps working.
             */
            // The right button opens the menu; neither gesture belongs to it.
            if (event.button === 2) return;
            setMenu(null);

            // Shift is the marquee. Space and the middle button say "pan"
            // outright, so they win over it.
            if (event.shiftKey && event.button !== 1 && !spaceDown.current) {
              startMarquee(event);
              return;
            }

            setSelectedId(null);
            startPan(event);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, onBlock: false });
          }}
        >
          {/* Over the canvas rather than beside it: a pasted picture takes a
              moment to upload, and where somebody is looking while they wait
              for it is where they expect it to appear. Inside the workspace,
              which is the positioned ancestor, and deaf to the pointer
              handlers that draw a marquee across it. */}
          {pasting ? (
            <div
              className="pub-editor-pasting"
              role="status"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {pasting}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPasting("")}
              >
                Dismiss
              </button>
            </div>
          ) : null}

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
                }${editingTextId === block.id ? " is-writing" : ""}${
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
                  repeated
                    ? undefined
                    : (event) => {
                        /*
                         * A block being written in belongs to the caret.
                         *
                         * The press is stopped here rather than left alone:
                         * the workspace behind treats a press as "nothing is
                         * selected any more, start panning", which would drop
                         * the selection the editor is derived from and drag
                         * the canvas out from under a selection gesture. The
                         * event still reaches Quill, which is below this and
                         * sees it on the way down.
                         */
                        if (editingTextId === block.id) {
                          event.stopPropagation();
                          return;
                        }
                        startDrag(event, block, "move");
                      }
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
                /*
                 * Double-click goes one level in.
                 *
                 * On a grouped block that means opening the group, so the next
                 * press picks the block rather than the whole arrangement; on a
                 * block already reachable it means writing in its words. A
                 * grouped text block therefore takes two double-clicks to
                 * write in, which is the same order a drawing tool uses.
                 */
                onDoubleClick={
                  repeated
                    ? undefined
                    : (event) => {
                        event.stopPropagation();
                        // Double-clicking inside words already being written
                        // is how a word is selected, not a fresh instruction.
                        if (editingTextId === block.id) return;
                        if (block.groupId && block.groupId !== openGroupId) {
                          setOpenGroupId(block.groupId);
                          setSelectedIds([block.id]);
                          return;
                        }
                        if (!WRITEABLE_BLOCKS.has(block.type)) return;
                        setSelectedIds([block.id]);
                        setStyleSlot(null);
                        setWriting({ ownerId: block.id, textId: block.id });
                      }
                }
              >
                {/*
                  A table draws its own cells here so that one can be chosen,
                  filled and written in; everything else is drawn as it will
                  publish, and is deaf to the pointer so clicks select it.
                */}
                {!repeated && block.type === "table" ? (
                  <PublicationTableView
                    table={block.table}
                    sources={canvasSources}
                    onMeasured={(height) => measuredTable(block.id, height)}
                    /*
                     * Handlers on the cell itself, so every part of it answers
                     * — the padding and the empty space beside a short word are
                     * the cell too, and pressing them is pressing the cell.
                     */
                    cellProps={(cell, at) => ({
                      onPointerDown: (event) => {
                        /*
                         * The first press selects the table and is left to
                         * reach the block behind, so a table is picked up and
                         * moved in one gesture like anything else. Presses
                         * after that work on its cells.
                         */
                        if (!selectedIds.includes(block.id)) return;
                        event.stopPropagation();

                        const here =
                          activeCell?.row === at.row && activeCell.column === at.column;
                        // A press inside a cell already open belongs to the
                        // caret or to the thing being dragged out.
                        if (here && insideCell) return;

                        setStyleSlot(null);
                        setInsideCell(false);
                        if (event.shiftKey && cellAt?.blockId === block.id) {
                          setCellFocus(at);
                          return;
                        }
                        setCellAt({ blockId: block.id, ...at });
                        setCellFocus(null);
                        startCellSweep();
                      },
                      onPointerEnter: () => {
                        if (sweepingCells.current) setCellFocus(at);
                      },
                      onDoubleClick: (event) => {
                        // Inside the cell: a caret in its words, or the thing
                        // it holds, with its own settings in the right column.
                        event.stopPropagation();
                        setSelectedIds([block.id]);
                        setCellAt({ blockId: block.id, ...at });
                        setCellFocus(null);
                        setInsideCell(true);
                      },
                    })}
                    renderCell={(cell, at, resolved) => {
                      const chosen =
                        cellRange?.blockId === block.id &&
                        cellRange.addresses.some(
                          (entry) => entry.row === at.row && entry.column === at.column
                        );
                      const anchored =
                        chosen &&
                        cellContext?.at.row === at.row &&
                        cellContext.at.column === at.column;

                      return (
                        <div
                          className={`pub-editor-cell${chosen ? " is-chosen" : ""}${
                            anchored && insideCell ? " is-inside" : ""
                          }`}
                        >
                          {/*
                            The chosen cell always has an editor, open or not:
                            open it holds the caret, closed it is only there so
                            the text controls are in the bar and act on all of
                            the cell's words.
                          */}
                          <CellBlockView
                            block={cell.block}
                            sources={canvasSources}
                            align={{ x: resolved.textAlign, y: resolved.verticalAlign }}
                            /*
                             * The cell is drawn as it will publish, with the
                             * editor standing in for its words. A shape in a
                             * cell is therefore visible while it is written on,
                             * exactly as one on the page is.
                             */
                            textOverride={
                              anchored && cellText ? (
                                <span
                                  className={`pub-editor-cell-writing${
                                    insideCellText ? " is-open" : ""
                                  }`}
                                >
                                  <RichTextEditor
                                    key={cell.block.id}
                                    value={blockHtml(cell.block)}
                                    autoFocus={insideCellText}
                                    contentClass="rich-text"
                                    formatWholeWhenBlurred
                                    onFormat={(attributes) =>
                                      void spreadCellFormat(attributes)
                                    }
                                    onChange={(html) =>
                                      updateTable(block.id, (table) =>
                                        withCellChanged(table, at, (entry) => ({
                                          ...entry,
                                          block: { ...entry.block, html },
                                        }))
                                      )
                                    }
                                    fonts={sources.fonts}
                                    toolbarHost={formatBar}
                                    bare
                                  />
                                </span>
                              ) : undefined
                            }
                          />
                        </div>
                      );
                    }}
                  />
                ) : (
                  <PublicationBlockView
                    block={block}
                    sources={canvasSources}
                    interactive={false}
                    /*
                     * Written in place, inside the block rather than over it.
                     * A shape being written on stays drawn, its words stay
                     * clipped to its outline, and a label above one still takes
                     * its own height — so what is being typed is what will be
                     * published, rather than a bare box where the shape was.
                     */
                    textOverride={
                      editingTextId === block.id ? (
                        <span className="pub-editor-writing">
                          <RichTextEditor
                            key={block.id}
                            value={blockHtml(block)}
                            onChange={(html) => updateBlock(block.id, { html })}
                            fonts={sources.fonts}
                            toolbarHost={formatBar}
                            contentClass="rich-text"
                            bare
                            autoFocus
                          />
                        </span>
                      ) : undefined
                    }
                  />
                )}

                {/*
                  A table selected for its cells still has to be movable.
                  Once it is selected, presses inside it choose cells, so the
                  grip is where the whole thing is picked up — a strip along
                  its top edge, the way a table is dragged anywhere else.
                */}
                {!repeated && block.type === "table" && selectedIds.includes(block.id) ? (
                  <span
                    className="pub-table-grip"
                    title="Drag to move the table"
                    onPointerDown={(event) => startDrag(event, block, "move")}
                  >
                    ⠿
                  </span>
                ) : null}

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

            {/*
              The box around a selection of several, with the handle that
              scales it. A lone block carries its own handles; more than one
              has no single block to hang them on, and the arrangement is what
              is being resized, so the box gets them instead.
            */}
            {selectionBox ? (
              <div
                className="pub-editor-selection"
                style={{
                  left: `${selectionBox.bounds.x}px`,
                  top: `${selectionBox.bounds.y}px`,
                  width: `${selectionBox.bounds.width}px`,
                  height: `${selectionBox.bounds.height}px`,
                }}
              >
                <span
                  className="pub-editor-handle"
                  style={{ right: "-0.3rem", bottom: "-0.3rem", cursor: "nwse-resize" }}
                  title="Drag to resize everything selected"
                  onPointerDown={(event) => startDrag(event, selectionBox.anchor, "resize")}
                />
              </div>
            ) : null}

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
        </div>

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
                Drag on the page to move the canvas about. Hold shift and drag
                to select several at once; hold ctrl or ⌘ as well to add to
                what is already chosen. Click a block with ctrl, ⌘ or shift to
                add it on its own, and double-click a block in a group to pick
                it out.
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
                  {styleSlot === "text"
                    ? STYLE_PANEL_TITLES[selected.type] ?? "Text style"
                    : STYLE_SLOT_TITLES[styleSlot]}
                </h4>
              </div>

              {/*
                A table is dressed in three places, plus one cell at a time: the
                grid itself carries the outline and the background behind
                everything, the cell style is the default every cell wears, the
                header style is what the heading row and column wear over it,
                and a single cell can overrule all of it. Four panels rather
                than one because those are four different questions — "what does
                this table look like" is not "what does this one cell look
                like".
              */}
              {styleSlot === "table" ||
              styleSlot === "tableCell" ||
              styleSlot === "tableHeader" ? (
                <InlineStyleEditor
                  values={
                    styleSlot === "table"
                      ? selected.table?.tableStyle
                      : styleSlot === "tableHeader"
                        ? selected.table?.headerStyle
                        : selected.table?.cellStyle
                  }
                  styleSlug=""
                  fonts={sources.fonts}
                  savedStyles={sources.styles}
                  // The grid draws no words of its own; its cells do.
                  showTypography={styleSlot !== "table"}
                  showSavedStyles={false}
                  onChange={({ values }) =>
                    updateTable(selected.id, (table) => ({
                      ...table,
                      ...(styleSlot === "table"
                        ? { tableStyle: values }
                        : styleSlot === "tableHeader"
                          ? { headerStyle: values }
                          : { cellStyle: values }),
                    }))
                  }
                />
              ) : null}

              {styleSlot === "cell" && cellContext ? (
                <InlineStyleEditor
                  // Seeded from the cell the range was started at; written to
                  // every cell in it, because dressing a selection means making
                  // those cells look alike.
                  values={cellContext.cell.style}
                  styleSlug=""
                  fonts={sources.fonts}
                  savedStyles={sources.styles}
                  showSavedStyles={false}
                  onChange={({ values }) =>
                    updateChosenCells((cell) => ({ ...cell, style: values }))
                  }
                />
              ) : null}

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

              {selected.type === "table" ? (
                <>
                  <div className="inspector-section">
                    <h4 className="inspector-title">Table</h4>
                    <p className="help-text" style={{ marginTop: 0 }}>
                      Click a cell to choose it, drag or shift-click to reach
                      across a range, and double-click to go inside it.
                      Everything about the table — what a cell holds, how it is
                      dressed, column widths and row heights — is in the bar
                      above the canvas.
                    </p>
                  </div>

                  {/*
                    What a cell *holds*, once it has been opened.
                    A picture in a cell is a picture: its media, its fit and its
                    size are its own, and they are set here exactly as they are
                    for a picture standing on the page. The cell's own dressing
                    is not here — that is the bar's.
                  */}
                  {cellContent ? (
                    <>
                      <div className="inspector-section">
                        <h4 className="inspector-title">
                          {BLOCK_LABELS[cellContent.type] ?? "Content"}
                        </h4>
                        <div className="field-grid">
                          <NumField
                            label="Width"
                            value={cellContent.width}
                            onChange={(width) => updateCellBlock({ width })}
                          />
                          <NumField
                            label="Height"
                            value={cellContent.height}
                            onChange={(height) => updateCellBlock({ height })}
                          />
                        </div>
                        <p className="help-text" style={{ marginTop: 0 }}>
                          Drawn at this size and placed by the cell&rsquo;s
                          alignment. The row grows if it needs to.
                        </p>
                      </div>
                      <BlockContentFields
                        block={cellContent}
                        update={updateCellBlock}
                        sources={sources}
                        pages={pages}
                        setStyleSlot={setStyleSlot}
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <BlockContentFields
                  block={selected}
                  update={(patch) => updateBlock(selected.id, patch)}
                  sources={sources}
                  pages={pages}
                  setStyleSlot={setStyleSlot}
                />
              )}
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
