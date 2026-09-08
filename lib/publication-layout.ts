import {
  defaultSponsorScroll,
  makeId,
  normalizeSponsorScroll,
  SHAPE_TEXT_PLACEMENTS,
  type ShapeTextPlacement,
  type SponsorScrollSettings,
} from "./page-layout";
import { sanitizeMediaPath } from "./protected-media-url";
import { normalizeRichText, plainTextToRichText } from "./rich-text";
import { normalizeStyleValues, type StyleValues } from "./style-values";
import { DEFAULT_TABLE_ACCENT } from "./table-style";

/**
 * Publications (zines, presentations and social posts) are fixed-canvas
 * designs: blocks are positioned in canvas units, and the viewer scales the
 * whole stage to the screen. Text sizes stay in rem so they scale with the
 * stage rather than jumping between breakpoints.
 */

export const PUBLICATION_KINDS = ["zine", "presentation", "post"] as const;
export type PublicationKind = (typeof PUBLICATION_KINDS)[number];

export const PUBLICATION_BLOCK_TYPES = [
  "richText",
  "image",
  "video",
  "button",
  "qrCode",
  "icon",
  "shape",
  "customShape",
  "table",
  "story",
  "collection",
  "form",
  // A run of sponsor logos, drawn from the recognition levels it names.
  "sponsorScroll",
] as const;

export type PublicationBlockType = (typeof PUBLICATION_BLOCK_TYPES)[number];

export const TRANSITIONS = ["none", "fade", "slide", "flip"] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** Preset canvases. Social posts carry several named views. */
export const PRESENTATION_SIZES = {
  "16:9": { width: 1920, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
  square: { width: 1080, height: 1080 },
  a4: { width: 1240, height: 1754 },
} as const;

export const POST_VIEW_PRESETS = [
  { id: "square", label: "Square", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait", width: 1080, height: 1350 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
  { id: "landscape", label: "Landscape", width: 1200, height: 630 },
] as const;

/**
 * What a table cell holds: one block, filling the cell.
 *
 * One rather than a list, because a cell is one thing — a heading, a figure, a
 * picture. A stack inside a box that is already a box in a grid is a layout
 * nobody asked a table for, and it made every cell a small page to be managed.
 * Changing what a cell holds is changing its kind, not adding to it.
 *
 * A cell starts as rich text, because that is what nearly every cell is, and
 * writing in it should not begin with choosing to.
 *
 * The block is a `PublicationBlock` and not a smaller shape of its own so that
 * every content type a page can hold — words, a picture, an icon, a shape, an
 * uploaded outline — is already renderable inside a cell, by the same renderer,
 * with the same controls and the same toolbar. Its `x`, `y` and `zIndex` say
 * nothing: a cell is a box, not a canvas, and content placed by coordinate
 * would be stranded the moment a column was resized.
 */
export type PublicationTableCell = {
  id: string;
  block: PublicationBlock;
  /** Dresses this cell alone, over the table's own cell style. */
  style?: StyleValues;
};

/**
 * A column or a row: how big it is, and anything it says about its own cells.
 *
 * The style rides on the axis rather than in a map keyed by index, so that
 * inserting or removing a row carries the styles of the rows around it with
 * it. A map would need reindexing on every structural change, and would get it
 * wrong exactly once.
 */
export type TableAxis = {
  /** Width for a column, height for a row, in canvas units. */
  size: number;
  style?: StyleValues;
};

export type PublicationTable = {
  columns: TableAxis[];
  rows: TableAxis[];
  /** Indexed `[row][column]`; always `rows.length` by `columns.length`. */
  cells: PublicationTableCell[][];
  /** Whether the first row and column are headings, dressed as such. */
  headerRow: boolean;
  headerColumn: boolean;
  /** Every other body row washed with the accent, which makes a wide table readable. */
  bandedRows: boolean;
  /**
   * The gap between cells, in canvas units.
   *
   * Nought is the ordinary table where cells share their lines. Anything more
   * separates them into tiles, which is a decision about the whole grid rather
   * than about any cell in it — two neighbours cannot disagree about the gap
   * between them.
   */
  cellSpacing?: number;
  /**
   * The one colour the table's look is built from: its heading fill, its
   * banding and its lines. One choice rather than several that have to be kept
   * in agreement — see `tableScheme`.
   */
  accentColor?: string;
  /** The grid itself: its outline and the background behind everything. */
  tableStyle?: StyleValues;
  /** Said about every cell, over the scheme; and about the heading cells. */
  cellStyle?: StyleValues;
  headerStyle?: StyleValues;
};

/** Blocks a cell may hold. A table is not among them: cells do not nest. */
export const TABLE_CELL_BLOCK_TYPES = [
  "richText",
  "image",
  "icon",
  "shape",
  "customShape",
  "button",
  "video",
  "qrCode",
] as const;

export const MAX_TABLE_COLUMNS = 20;
export const MAX_TABLE_ROWS = 60;

/** How a cell's block is labelled where its kind is chosen. */
export const TABLE_CELL_BLOCK_LABELS: Record<
  (typeof TABLE_CELL_BLOCK_TYPES)[number],
  string
> = {
  richText: "Text",
  image: "Image",
  icon: "Icon",
  shape: "Shape",
  customShape: "Custom shape",
  button: "Button",
  video: "Video",
  qrCode: "QR code",
};

export type PublicationBlock = {
  id: string;
  type: PublicationBlockType;

  /** Canvas units — the stage is scaled, these never change. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;

  /**
   * Blocks arranged together, moved and selected as one.
   *
   * Held on each block rather than as a list on the page: a block carries its
   * own membership, so copying, deleting or reordering one cannot leave a
   * group naming something that is no longer there.
   */
  groupId?: string;

  styleSlug?: string;
  textStyle?: StyleValues;

  /**
   * Layout blocks only. A locked block is part of the layout: it shows on every
   * page using it and can only be changed on the layout itself. An unlocked one
   * is a starting point — applying the layout hands the page its own copy.
   */
  locked?: boolean;
  /** On a page's copy: the layout it came from, so switching layouts can tidy up. */
  fromTemplate?: string;
  /** Dresses a shape itself: its fill, outline, corners and shadow. */
  shapeStyle?: StyleValues;
  /**
   * Where a shape's text sits. `inside` is held to the shape's own outline, the
   * same as on a page; `above` puts it over the shape in the block's box. The
   * words themselves are `html`, styled by `textStyle` — so a shape and the
   * writing on it are dressed separately.
   */
  textPlacement?: ShapeTextPlacement;

  /**
   * Superseded by `html`.
   *
   * There was once a plain text block beside the rich one, and a shape carried
   * its words here as a plain string. Both are rich text now — one kind of text
   * area, so the toolbar means the same thing wherever the caret is. Kept on
   * the type so a publication saved before the change still reads; lifted into
   * `html` the first time it is normalized, and never written.
   */
  text?: string;
  /** Every block's words, as rich text. */
  html?: string;
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  objectFit?: "cover" | "contain";
  radius?: number;

  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;

  /** Superseded by `html`: a button's face is rich text like any other. */
  label?: string;
  /**
   * Superseded by `clickAction` and `clickTarget`.
   *
   * Kept on the type so a publication saved before the change still reads, and
   * carried over to a click action the first time it is normalized. Never
   * written, and never rendered.
   */
  href?: string;
  /** Whether a click action's link opens in a new tab. */
  newTab?: boolean;
  qrValue?: string;
  iconName?: string;
  color?: string;
  shapeKind?: string;
  shapeSlug?: string;

  storyId?: string;
  collectionId?: string;
  formId?: string;
  /**
   * A sponsor scroll's settings, minus the height.
   *
   * The block's own box is the band here — a publication block is a rectangle
   * somebody drew on a canvas, and a second height in rem would be a setting
   * that could disagree with the one they can see.
   */
  sponsorScroll?: SponsorScrollSettings;

  /** `table` — the grid, its cells and how all of it is dressed. */
  table?: PublicationTable;

  /** Click action for visual blocks: navigate, jump to a page, or nothing. */
  clickAction?: "none" | "link" | "page";
  clickTarget?: string;
};

/** The background settings a page and a layout both carry. */
export type PublicationBackground = {
  backgroundType: "none" | "color" | "image" | "video";
  backgroundColor: string;
  backgroundMediaUrl: string;
  backgroundFit: "cover" | "contain" | "fill";
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  kenBurns: boolean;
  videoMuted: boolean;
  videoLoop: boolean;
};

export type PublicationPage = {
  id: string;
  name: string;
  backgroundType: "none" | "color" | "image" | "video";
  backgroundColor: string;
  backgroundMediaUrl: string;
  backgroundFit: "cover" | "contain" | "fill";
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  kenBurns: boolean;
  videoMuted: boolean;
  videoLoop: boolean;
  audioUrl: string;
  blocks: PublicationBlock[];
  /**
   * Kept out of the order somebody pages through.
   *
   * Not a private page and not an unpublished one — it is part of the
   * publication and anybody can reach it. It simply is not on the way to
   * anywhere: the arrows, the wheel, the keyboard and the slideshow all step
   * over it, and the only way in is a link on another page. An appendix, a
   * long footnote, the terms behind a "read the small print".
   */
  hidden: boolean;
  /**
   * Offer a way back to whatever linked here. Ignored on a page that is not
   * hidden, which is already somewhere the arrows can leave.
   */
  showBack: boolean;
  /** What that way back is called. */
  backLabel: string;
  /** The page layout this page is built on, if any. */
  templateId: string;
  /** Per-view block overrides for social posts, keyed by view id. */
  viewOverrides: Record<string, Partial<PublicationBlock>[]>;
};

/**
 * A page layout, in the sense a presentation tool means it: a named set of
 * blocks that any number of pages are built on. The blocks belong to the
 * layout, so they are edited in one place and are read-only on the pages that
 * use it.
 */
export type PublicationPageTemplate = PublicationBackground & {
  id: string;
  name: string;
  blocks: PublicationBlock[];
};

export const emptyBackground: PublicationBackground = {
  // `none` so a layout without a background of its own leaves the page's alone.
  backgroundType: "none",
  backgroundColor: "#101317",
  backgroundMediaUrl: "",
  backgroundFit: "cover",
  backgroundOffsetX: 0,
  backgroundOffsetY: 0,
  kenBurns: false,
  videoMuted: true,
  videoLoop: true,
};

export function normalizeBackground(raw: Record<string, unknown>): PublicationBackground {
  return {
    backgroundType: pick(
      raw.backgroundType,
      ["none", "color", "image", "video"] as const,
      "none"
    ),
    backgroundColor: str(raw.backgroundColor, "#101317"),
    backgroundMediaUrl: sanitizeMediaPath(str(raw.backgroundMediaUrl)),
    backgroundFit: pick(raw.backgroundFit, ["cover", "contain", "fill"] as const, "cover"),
    backgroundOffsetX: num(raw.backgroundOffsetX, 0),
    backgroundOffsetY: num(raw.backgroundOffsetY, 0),
    kenBurns: Boolean(raw.kenBurns),
    videoMuted: raw.videoMuted === undefined ? true : Boolean(raw.videoMuted),
    videoLoop: raw.videoLoop === undefined ? true : Boolean(raw.videoLoop),
  };
}

export type SlideshowSettings = {
  enabled: boolean;
  intervalMs: number;
  loop: boolean;
  /**
   * Whether it starts by itself.
   *
   * Separate from `enabled`, which only says the publication *can* advance on
   * its own. A reader who opened a zine to look at it should not have it taken
   * off them a few seconds later, so the pages move when they press play —
   * unless whoever published it decided otherwise.
   */
  autoplay: boolean;
};

export type AudioSettings = {
  url: string;
  loop: boolean;
  autoplay: boolean;
  volume: number;
};

export const defaultSlideshow: SlideshowSettings = {
  enabled: false,
  intervalMs: 6000,
  loop: true,
  autoplay: false,
};

export const defaultAudio: AudioSettings = {
  url: "",
  loop: true,
  autoplay: false,
  volume: 0.8,
};

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/* -------------------------------------------------------------- Tables */

/** Default column width and row height, in canvas units. */
const TABLE_COLUMN_WIDTH = 240;
const TABLE_ROW_HEIGHT = 90;
/** No column or row may be squeezed past this, in canvas units. */
export const MIN_TABLE_CELL = 24;
/** A tint faint enough to read as banding rather than as a coloured row. */
const DEFAULT_BAND_COLOR = "rgba(148, 163, 184, 0.18)";

/**
 * A block sized for a cell rather than placed on a canvas.
 *
 * The cell decides where it goes and how wide it is, so only its height is
 * really its own — and words do not even own that, taking as much as they need.
 */
export function createCellBlock(
  type: (typeof TABLE_CELL_BLOCK_TYPES)[number]
): PublicationBlock {
  const block = createPublicationBlock(type);
  block.x = 0;
  block.y = 0;
  block.zIndex = 1;
  block.width = 240;
  block.height = type === "richText" || type === "button" ? 40 : 120;
  if (type === "richText") {
    block.html = "";
    // A cell inherits its look from the table, so its words start plain.
    delete block.textStyle;
  }
  return block;
}

export function createTableCell(): PublicationTableCell {
  return { id: makeId("pubcell"), block: createCellBlock("richText") };
}

/** Changes what a cell holds, keeping its own dressing. */
export function withCellKind(
  cell: PublicationTableCell,
  type: (typeof TABLE_CELL_BLOCK_TYPES)[number]
): PublicationTableCell {
  if (cell.block.type === type) return cell;
  return { ...cell, block: createCellBlock(type) };
}

export function createTable(columns = 3, rows = 3): PublicationTable {
  const columnCount = Math.min(MAX_TABLE_COLUMNS, Math.max(1, columns));
  const rowCount = Math.min(MAX_TABLE_ROWS, Math.max(1, rows));

  return {
    columns: Array.from({ length: columnCount }, () => ({ size: TABLE_COLUMN_WIDTH })),
    rows: Array.from({ length: rowCount }, () => ({ size: TABLE_ROW_HEIGHT })),
    cells: Array.from({ length: rowCount }, () =>
      Array.from({ length: columnCount }, createTableCell)
    ),
    headerRow: true,
    headerColumn: false,
    bandedRows: false,
    cellSpacing: 0,
    accentColor: DEFAULT_TABLE_ACCENT,
    /*
     * Only the padding. Lines, fills and heading colours come from the scheme,
     * so that changing the accent changes the whole look rather than leaving a
     * fixed grey border behind it.
     */
    cellStyle: {
      paddingTop: 0.4,
      paddingRight: 0.5,
      paddingBottom: 0.4,
      paddingLeft: 0.5,
    },
  };
}

/**
 * A table box: as wide as its columns, and at least as tall as its rows.
 *
 * "At least", because a row height is a minimum rather than a fixed size —
 * words that need another line get one, the way they do in every table anybody
 * has used. The editor measures what was actually drawn and grows the block to
 * match; this is the floor that measurement starts from.
 */
export function tableSize(table: PublicationTable): { width: number; height: number } {
  return {
    width: table.columns.reduce((total, column) => total + column.size, 0),
    height: table.rows.reduce((total, row) => total + row.size, 0),
  };
}

/**
 * Scales a table to a new box, which is what dragging its corner means.
 *
 * The columns and rows take the change, so the table really is that size
 * afterwards rather than being snapped back the next time it is touched.
 */
export function withTableScaled(
  table: PublicationTable,
  scaleX: number,
  scaleY: number
): PublicationTable {
  const scale = (axis: TableAxis[], factor: number) =>
    axis.map((entry) => ({
      ...entry,
      size: Math.max(MIN_TABLE_CELL, Math.round(entry.size * factor)),
    }));

  return {
    ...table,
    columns: scale(table.columns, scaleX),
    rows: scale(table.rows, scaleY),
  };
}

/**
 * A table read back from storage, squared off.
 *
 * The grid is the authority on its own shape: `cells` is forced to exactly as
 * many rows and columns as `rows` and `columns` describe, so a document saved
 * by an older version, hand-edited, or half-written by a failed save can never
 * produce a ragged table the renderer has to guess at.
 */
export function normalizeTable(input: unknown): PublicationTable {
  const raw = (input ?? {}) as Record<string, unknown>;

  /** Columns and rows were plain numbers before they could carry a style. */
  const axis = (value: unknown, fallback: number, cap: number): TableAxis[] => {
    const list = Array.isArray(value) ? value : [];
    const kept = list.slice(0, cap).map((entry) => {
      const stored = (entry ?? {}) as Record<string, unknown>;
      const size = typeof entry === "number" ? entry : num(stored.size, fallback);
      const next: TableAxis = { size: Math.max(MIN_TABLE_CELL, Math.round(size)) };
      if (stored.style) next.style = normalizeStyleValues(stored.style);
      return next;
    });
    return kept.length > 0 ? kept : [{ size: fallback }];
  };

  const columns = axis(raw.columns, TABLE_COLUMN_WIDTH, MAX_TABLE_COLUMNS);
  const rows = axis(raw.rows, TABLE_ROW_HEIGHT, MAX_TABLE_ROWS);

  const storedRows = Array.isArray(raw.cells) ? raw.cells : [];

  const cells = rows.map((_row, rowIndex) => {
    const storedRow = Array.isArray(storedRows[rowIndex]) ? storedRows[rowIndex] : [];
    return columns.map((_column, columnIndex) => {
      const stored = (storedRow as unknown[])[columnIndex] as
        | Record<string, unknown>
        | undefined;
      if (!stored || typeof stored !== "object") return createTableCell();

      /*
       * A cell held a list of blocks before it held one. The first of them is
       * what the cell is, and the rest are dropped — read here rather than by
       * a migration, so a table saved by the older shape opens correctly.
       */
      const legacy = Array.isArray(stored.content) ? stored.content : [];
      const candidate = normalizePublicationBlock(stored.block ?? legacy[0]);
      const kept =
        candidate &&
        // A cell holds content, not compositions, and never another table.
        (TABLE_CELL_BLOCK_TYPES as readonly string[]).includes(candidate.type)
          ? candidate
          : createCellBlock("richText");

      const cell: PublicationTableCell = {
        id: str(stored.id) || makeId("pubcell"),
        block: kept,
      };
      if (stored.style) cell.style = normalizeStyleValues(stored.style);
      return cell;
    });
  });

  const table: PublicationTable = {
    columns,
    rows,
    cells,
    headerRow: raw.headerRow === undefined ? true : Boolean(raw.headerRow),
    headerColumn: Boolean(raw.headerColumn),
    bandedRows: Boolean(raw.bandedRows),
    cellSpacing: Math.max(0, Math.round(num(raw.cellSpacing, 0))),
    accentColor: str(raw.accentColor) || DEFAULT_TABLE_ACCENT,
  };

  if (raw.tableStyle) table.tableStyle = normalizeStyleValues(raw.tableStyle);
  if (raw.cellStyle) table.cellStyle = normalizeStyleValues(raw.cellStyle);
  if (raw.headerStyle) table.headerStyle = normalizeStyleValues(raw.headerStyle);

  return table;
}

/* ------------------------------------------------------- Changing a grid */

/** Adds a column beside `at`, or at the end when `at` is not given. */
export function withColumnAdded(table: PublicationTable, at?: number): PublicationTable {
  if (table.columns.length >= MAX_TABLE_COLUMNS) return table;
  const from = Math.min(at ?? table.columns.length - 1, table.columns.length - 1);
  const index = at === undefined ? table.columns.length : Math.max(0, at + 1);

  const columns = [...table.columns];
  // The new column matches the one it was added beside, style and all.
  columns.splice(index, 0, { ...table.columns[from] });

  return {
    ...table,
    columns,
    cells: table.cells.map((row) => {
      const next = [...row];
      next.splice(index, 0, createTableCell());
      return next;
    }),
  };
}

export function withRowAdded(table: PublicationTable, at?: number): PublicationTable {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const from = Math.min(at ?? table.rows.length - 1, table.rows.length - 1);
  const index = at === undefined ? table.rows.length : Math.max(0, at + 1);

  const rows = [...table.rows];
  rows.splice(index, 0, { ...table.rows[from] });

  const cells = [...table.cells];
  cells.splice(index, 0, table.columns.map(createTableCell));

  return { ...table, rows, cells };
}

/** Removing the last column or row would leave no table, so it is refused. */
export function withColumnRemoved(table: PublicationTable, at: number): PublicationTable {
  if (table.columns.length <= 1 || at < 0 || at >= table.columns.length) return table;
  return {
    ...table,
    columns: table.columns.filter((_column, index) => index !== at),
    cells: table.cells.map((row) => row.filter((_cell, index) => index !== at)),
  };
}

export function withRowRemoved(table: PublicationTable, at: number): PublicationTable {
  if (table.rows.length <= 1 || at < 0 || at >= table.rows.length) return table;
  return {
    ...table,
    rows: table.rows.filter((_row, index) => index !== at),
    cells: table.cells.filter((_row, index) => index !== at),
  };
}

/** Changes the named rows or columns: their size, their dressing, or both. */
export function withAxisChanged(
  table: PublicationTable,
  axis: "rows" | "columns",
  indexes: number[],
  change: (entry: TableAxis) => TableAxis
): PublicationTable {
  const wanted = new Set(indexes);
  const next = table[axis].map((entry, index) =>
    wanted.has(index) ? change(entry) : entry
  );
  return axis === "rows" ? { ...table, rows: next } : { ...table, columns: next };
}

export function withRowHeight(
  table: PublicationTable,
  rows: number[],
  height: number
): PublicationTable {
  return withAxisChanged(table, "rows", rows, (entry) => ({
    ...entry,
    size: Math.max(MIN_TABLE_CELL, Math.round(height)),
  }));
}

export function withColumnWidth(
  table: PublicationTable,
  columns: number[],
  width: number
): PublicationTable {
  return withAxisChanged(table, "columns", columns, (entry) => ({
    ...entry,
    size: Math.max(MIN_TABLE_CELL, Math.round(width)),
  }));
}

/** Where a cell sits, which is how the editor names the one being worked on. */
export type CellAddress = { row: number; column: number };

/** Replaces one cell, leaving the rest of the grid untouched. */
export function withCellChanged(
  table: PublicationTable,
  at: CellAddress,
  change: (cell: PublicationTableCell) => PublicationTableCell
): PublicationTable {
  const row = table.cells[at.row];
  if (!row || !row[at.column]) return table;

  return {
    ...table,
    cells: table.cells.map((cells, rowIndex) =>
      rowIndex === at.row
        ? cells.map((cell, columnIndex) =>
            columnIndex === at.column ? change(cell) : cell
          )
        : cells
    ),
  };
}

/** The block of every cell, for anything that walks a page. */
export function tableContentBlocks(table: PublicationTable): PublicationBlock[] {
  return table.cells.flatMap((row) => row.map((cell) => cell.block));
}

export function createPublicationBlock(type: PublicationBlockType): PublicationBlock {
  const block: PublicationBlock = {
    id: makeId("pubblock"),
    type,
    x: 80,
    y: 80,
    width: 480,
    height: 200,
    rotation: 0,
    zIndex: 1,
    clickAction: "none",
  };

  switch (type) {
    case "richText":
      block.html = "<p>Text</p>";
      /*
       * No size of its own.
       *
       * A block that starts at three rem is a block whose words disagree with
       * the size the toolbar shows for them, and every one of them has to be
       * corrected before anything can be typed. Left unset, the words are
       * whatever the page gives them until somebody says otherwise — and the
       * size field reads blank, which is the truth.
       */
      block.textStyle = { color: "#ffffff" };
      break;
    case "button":
      block.html = "<p>Open</p>";
      block.height = 80;
      block.width = 240;
      break;
    case "table": {
      block.table = createTable();
      const size = tableSize(block.table);
      block.width = size.width;
      block.height = size.height;
      break;
    }
    case "qrCode":
      block.qrValue = "https://example.com";
      block.width = 240;
      block.height = 240;
      break;
    case "sponsorScroll":
      block.sponsorScroll = { ...defaultSponsorScroll };
      // A band across the slide rather than the default rectangle: the block's
      // own box is the height of the logos, and 200 units of logo would be a
      // very loud strip to have to shrink before it reads as a run.
      block.width = 960;
      block.height = 120;
      break;
    case "icon":
      block.iconName = "Star";
      block.color = "#ffffff";
      block.width = 120;
      block.height = 120;
      break;
    case "shape":
      block.shapeKind = "rectangle";
      block.color = "#2b6cb0";
      block.html = "";
      block.textPlacement = "inside";
      break;
    case "customShape":
      block.shapeSlug = "";
      block.color = "#2b6cb0";
      block.html = "";
      block.textPlacement = "inside";
      break;
    default:
      break;
  }

  return block;
}

export function createPublicationPage(index = 0): PublicationPage {
  return {
    id: makeId("pubpage"),
    name: `Page ${index + 1}`,
    backgroundType: "color",
    backgroundColor: "#101317",
    backgroundMediaUrl: "",
    backgroundFit: "cover",
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    kenBurns: false,
    videoMuted: true,
    videoLoop: true,
    audioUrl: "",
    blocks: [],
    hidden: false,
    showBack: true,
    backLabel: "Back",
    templateId: "",
    viewOverrides: {},
  };
}

/**
 * The words a block carries, as rich text.
 *
 * There is one kind of text on a publication canvas now, and it is rich. A
 * block saved before that carried plain words in `text`; they are lifted into
 * `html` here rather than by a migration, so a publication nobody has opened
 * since reads correctly the first time it is asked for.
 */
function richTextOf(raw: Record<string, unknown>, ...legacyKeys: string[]): string {
  const html = normalizeRichText(str(raw.html));
  if (html) return html;

  for (const key of legacyKeys) {
    const plain = str(raw[key]);
    if (plain) return normalizeRichText(plainTextToRichText(plain));
  }
  return "";
}

export function normalizePublicationBlock(input: unknown): PublicationBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  /*
   * The plain text block is gone: one text block, and it is rich.
   *
   * Read before the type is checked, so a stored `text` block becomes a rich
   * one rather than being dropped as an unknown kind.
   */
  const type = (raw.type === "text" ? "richText" : raw.type) as PublicationBlockType;
  if (!PUBLICATION_BLOCK_TYPES.includes(type)) return null;

  const block: PublicationBlock = {
    id: str(raw.id) || makeId("pubblock"),
    type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: Math.max(1, num(raw.width, 100)),
    height: Math.max(1, num(raw.height, 100)),
    rotation: num(raw.rotation, 0),
    zIndex: Math.round(num(raw.zIndex, 1)),
    clickAction: pick(raw.clickAction, ["none", "link", "page"] as const, "none"),
    clickTarget: str(raw.clickTarget),
  };

  if (raw.groupId) block.groupId = str(raw.groupId);
  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  // Absent means locked: a layout block belongs to the layout unless it has
  // been deliberately opened up.
  if (raw.locked !== undefined) block.locked = Boolean(raw.locked);
  if (raw.fromTemplate) block.fromTemplate = str(raw.fromTemplate);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  if (raw.shapeStyle) block.shapeStyle = normalizeStyleValues(raw.shapeStyle);

  switch (type) {
    case "richText":
      block.html = richTextOf(raw, "text");
      break;
    case "image":
    case "video":
      block.mediaId = str(raw.mediaId);
      block.mediaUrl = sanitizeMediaPath(str(raw.mediaUrl));
      block.alt = str(raw.alt);
      block.objectFit = pick(raw.objectFit, ["cover", "contain"] as const, "cover");
      block.radius = num(raw.radius, 0);
      block.autoplay = Boolean(raw.autoplay);
      block.loop = raw.loop === undefined ? true : Boolean(raw.loop);
      block.muted = raw.muted === undefined ? true : Boolean(raw.muted);
      block.controls = Boolean(raw.controls);
      break;
    case "button":
      // A button's face is a text area like any other, so it is rich too. The
      // plain `label` it used to carry is what a button saved before this says.
      block.html = richTextOf(raw, "label") || plainTextToRichText("Button");
      block.newTab = Boolean(raw.newTab);
      /*
       * A link set on the button itself, carried over to the click action.
       *
       * `href` was the button's own field and nothing ever rendered it: a
       * button block draws a label, and what a block does when it is pressed
       * has always been the click action, which every block carries. So a
       * button with a link stored on it was a button that did nothing. The
       * address is moved rather than dropped, and only where nothing has been
       * asked for already, so a click action somebody set is never overruled.
       */
      if (!block.clickAction || block.clickAction === "none") {
        const legacy = str(raw.href);
        if (legacy && legacy !== "#") {
          block.clickAction = "link";
          block.clickTarget = legacy;
        }
      }
      break;
    case "qrCode":
      block.qrValue = str(raw.qrValue);
      block.color = str(raw.color, "#000000");
      break;
    case "icon":
      block.iconName = str(raw.iconName, "Star");
      block.color = str(raw.color, "#ffffff");
      break;
    case "shape":
      block.shapeKind = str(raw.shapeKind, "rectangle");
      block.color = str(raw.color, "#2b6cb0");
      block.radius = num(raw.radius, 0);
      // Words on the shape, with their own style and their own placement.
      block.html = richTextOf(raw, "text");
      block.textPlacement = pick(raw.textPlacement, SHAPE_TEXT_PLACEMENTS, "inside");
      break;
    case "customShape":
      block.shapeSlug = str(raw.shapeSlug);
      block.color = str(raw.color, "#2b6cb0");
      block.html = richTextOf(raw, "text");
      block.textPlacement = pick(raw.textPlacement, SHAPE_TEXT_PLACEMENTS, "inside");
      break;
    case "table": {
      block.table = normalizeTable(raw.table);
      /*
       * The width is the columns, exactly — nothing makes a table wider than
       * they say. The height is only a floor: a row grows to fit its words, so
       * a stored height larger than the sum of the rows is what was measured
       * on the page and is kept. Forcing it back to the sum is what cut the
       * bottom rows off.
       */
      const size = tableSize(block.table);
      block.width = size.width;
      block.height = Math.max(size.height, num(raw.height, 0));
      break;
    }
    case "story":
      block.storyId = str(raw.storyId);
      break;
    case "collection":
      block.collectionId = str(raw.collectionId);
      break;
    case "form":
      block.formId = str(raw.formId);
      break;
    case "sponsorScroll":
      block.sponsorScroll = normalizeSponsorScroll(raw.sponsorScroll);
      break;
  }

  return block;
}

/**
 * Earlier versions stored a page as `{ background, backgrounds, layouts }`,
 * where `layouts` mapped a view id to an array of blocks using `x/y/w/h/z` and
 * `content`/`sourceId`. This maps that shape onto the current model so existing
 * publications keep their content instead of rendering as empty pages.
 */
function migrateLegacyPage(raw: Record<string, unknown>): {
  blocks: unknown[];
  background: Partial<PublicationPage>;
} {
  const layouts = (raw.layouts ?? {}) as Record<string, unknown[]>;
  const viewIds = Object.keys(layouts);
  // Prefer the primary desktop layout; otherwise take the first non-empty view.
  const chosenView =
    viewIds.find((id) => id === "desktop-landscape" && layouts[id]?.length) ??
    viewIds.find((id) => Array.isArray(layouts[id]) && layouts[id].length > 0) ??
    viewIds[0];

  const legacyBlocks = Array.isArray(layouts[chosenView]) ? layouts[chosenView] : [];

  const blocks = legacyBlocks
    .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object")
    .filter((block) => !block.hidden)
    .map((block) => {
      const type = String(block.type ?? "");
      const mapped: Record<string, unknown> = {
        id: block.id,
        type: type === "pageNumber" ? "text" : type,
        x: block.x,
        y: block.y,
        width: block.w,
        height: block.h,
        zIndex: block.z,
        rotation: 0,
      };

      if (type === "richText") mapped.html = block.content;
      else if (type === "qrCode") mapped.qrValue = block.content;
      else if (type === "button") mapped.label = block.content;
      else if (type === "pageNumber") mapped.text = "";
      else mapped.text = block.content;

      // `sourceId` addressed a media asset, a story, a collection or a form
      // depending on the block type.
      if (block.sourceId) {
        if (type === "story") mapped.storyId = block.sourceId;
        else if (type === "collection") mapped.collectionId = block.sourceId;
        else if (type === "form") mapped.formId = block.sourceId;
        else mapped.mediaId = block.sourceId;
      }

      if (block.color) mapped.color = block.color;
      if (block.shapeKind) mapped.shapeKind = block.shapeKind;
      if (block.shapeSlug) mapped.shapeSlug = block.shapeSlug;

      // Font settings were stored as pixels; StyleValues is rem-based.
      const textStyle: Record<string, unknown> = {};
      if (typeof block.fontSize === "number") textStyle.fontSize = block.fontSize / 16;
      if (block.fontFamily && block.fontFamily !== "classic") {
        textStyle.fontFamily = block.fontFamily;
      }
      if (block.fontWeight) textStyle.fontWeight = block.fontWeight;
      if (block.color) textStyle.color = block.color;
      if (Object.keys(textStyle).length > 0) mapped.textStyle = textStyle;

      if (block.linkTarget === "url" && block.linkUrl && block.linkUrl !== "https://") {
        mapped.clickAction = "link";
        mapped.clickTarget = block.linkUrl;
      } else if (block.linkTarget === "page" && block.linkPageId) {
        mapped.clickAction = "page";
        mapped.clickTarget = block.linkPageId;
      }

      return mapped;
    });

  const backgrounds = (raw.backgrounds ?? {}) as Record<string, Record<string, unknown>>;
  const background =
    backgrounds[chosenView] ??
    backgrounds["desktop-landscape"] ??
    Object.values(backgrounds)[0];

  const settings: Partial<PublicationPage> = {};

  if (background?.url) {
    settings.backgroundType = background.mediaType === "video" ? "video" : "image";
    settings.backgroundMediaUrl = sanitizeMediaPath(String(background.url));
    settings.backgroundFit = pick(
      background.fit,
      ["cover", "contain", "fill"] as const,
      "cover"
    );
    settings.backgroundOffsetX = num(background.offsetX, 0);
    settings.backgroundOffsetY = num(background.offsetY, 0);
    settings.kenBurns = Boolean(background.kenBurns);
    settings.videoLoop = background.loopVideo !== false;
  } else if (typeof raw.background === "string" && raw.background) {
    settings.backgroundType = "color";
    settings.backgroundColor = raw.background;
  }

  const audio = raw.audio as Record<string, unknown> | undefined;
  if (audio?.url) settings.audioUrl = sanitizeMediaPath(String(audio.url));

  return { blocks, background: settings };
}

export function normalizePublicationPage(input: unknown, index: number): PublicationPage {
  const raw = { ...((input ?? {}) as Record<string, unknown>) };

  // Legacy documents carry `layouts` instead of `blocks`.
  let blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (blocks.length === 0 && raw.layouts && typeof raw.layouts === "object") {
    const migrated = migrateLegacyPage(raw);
    blocks = migrated.blocks;
    Object.assign(raw, migrated.background);
    if (raw.title && !raw.name) raw.name = raw.title;
  }

  return {
    id: str(raw.id) || makeId("pubpage"),
    name: str(raw.name, `Page ${index + 1}`),
    backgroundType: pick(
      raw.backgroundType,
      ["none", "color", "image", "video"] as const,
      "color"
    ),
    backgroundColor: str(raw.backgroundColor, "#101317"),
    backgroundMediaUrl: sanitizeMediaPath(str(raw.backgroundMediaUrl)),
    backgroundFit: pick(raw.backgroundFit, ["cover", "contain", "fill"] as const, "cover"),
    backgroundOffsetX: num(raw.backgroundOffsetX, 0),
    backgroundOffsetY: num(raw.backgroundOffsetY, 0),
    kenBurns: Boolean(raw.kenBurns),
    videoMuted: raw.videoMuted === undefined ? true : Boolean(raw.videoMuted),
    videoLoop: raw.videoLoop === undefined ? true : Boolean(raw.videoLoop),
    audioUrl: sanitizeMediaPath(str(raw.audioUrl)),
    blocks: blocks
      .slice(0, 300)
      .map(normalizePublicationBlock)
      .filter((block): block is PublicationBlock => block !== null),
    hidden: Boolean(raw.hidden),
    // A page hidden without saying anything about a way back gets one: it is
    // reached by a link and left by nothing else, and the alternative is a
    // reader who has to work out that the arrows will do it.
    showBack: raw.showBack === undefined ? true : Boolean(raw.showBack),
    backLabel: str(raw.backLabel, "Back").slice(0, 60),
    templateId: str(raw.templateId),
    viewOverrides:
      raw.viewOverrides && typeof raw.viewOverrides === "object"
        ? (raw.viewOverrides as PublicationPage["viewOverrides"])
        : {},
  };
}

export function normalizePublicationPages(input: unknown): PublicationPage[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 300).map(normalizePublicationPage);
}

/** Blocks drawn on every page, beneath the page's own blocks. */
export function normalizeRepeatedBlocks(input: unknown): PublicationBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 100)
    .map(normalizePublicationBlock)
    .filter((block): block is PublicationBlock => block !== null);
}

/** Page layouts, each with its own blocks. */
export function normalizePageTemplates(input: unknown): PublicationPageTemplate[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      ...normalizeBackground(item),
      id: str(item.id) || makeId("pubtpl"),
      name: str(item.name, `Layout ${index + 1}`),
      blocks: Array.isArray(item.blocks)
        ? item.blocks
            .slice(0, 300)
            .map(normalizePublicationBlock)
            .filter((block): block is PublicationBlock => block !== null)
        : [],
    };
  });
}

/**
 * Everything drawn on a page beneath its own blocks: the publication's repeated
 * blocks, then the blocks of whatever layout the page uses. One helper so the
 * editor canvas, the viewer and the export cannot disagree about what a page
 * contains.
 */
export function inheritedBlocks(
  page: PublicationPage,
  repeatedBlocks: PublicationBlock[],
  templates: PublicationPageTemplate[]
): PublicationBlock[] {
  const template = page.templateId
    ? templates.find((item) => item.id === page.templateId)
    : undefined;

  // Only the locked ones are inherited. An unlocked layout block was copied
  // onto the page when the layout was applied, and the page owns that copy —
  // drawing the layout's as well would show it twice.
  const fromLayout = (template?.blocks ?? []).filter((block) => block.locked !== false);
  return [...repeatedBlocks, ...fromLayout];
}

/** The layout a page is built on, if it has one. */
export function pageTemplateOf(
  page: PublicationPage,
  templates: PublicationPageTemplate[]
): PublicationPageTemplate | undefined {
  return page.templateId
    ? templates.find((item) => item.id === page.templateId)
    : undefined;
}

/**
 * Which background a page shows: its own when it sets one, otherwise its
 * layout's. A page keeps the last word — a layout is a starting point, not a
 * rule — and a page set to `none` is asking for the layout's.
 */
export function effectiveBackground(
  page: PublicationPage,
  templates: PublicationPageTemplate[]
): PublicationBackground {
  if (page.backgroundType !== "none") return page;
  const template = pageTemplateOf(page, templates);
  return template && template.backgroundType !== "none" ? template : page;
}

/**
 * The blocks a page gets to keep when a layout is applied: a copy of each
 * unlocked block, marked with the layout it came from so switching layouts can
 * take the old ones away again.
 */
export function templateStarterBlocks(
  template: PublicationPageTemplate
): PublicationBlock[] {
  return template.blocks
    .filter((block) => block.locked === false)
    .map((block, index) => ({
      ...block,
      id: `${block.id}-${template.id}-${index}`,
      locked: undefined,
      fromTemplate: template.id,
    }));
}

/**
 * Stands the pages using a layout aside, so the layout's background shows.
 *
 * Every page is created carrying a background of its own, and a page's own
 * background wins — which is right, but it meant a background given to a
 * layout after the layout had been applied could never appear: each page was
 * still claiming the colour it was born with. Applying a layout already does
 * exactly this; doing it when the background arrives is the same rule reaching
 * the other order of work.
 *
 * A page that wants its own back only has to set one, as before.
 */
export function withLayoutBackground(
  pages: PublicationPage[],
  templateId: string
): PublicationPage[] {
  return pages.map((page) =>
    page.templateId === templateId ? { ...page, backgroundType: "none" } : page
  );
}

/** Applies a layout to a page: fresh copies in, previous layout's copies out. */
export function withTemplateApplied(
  page: PublicationPage,
  templateId: string,
  templates: PublicationPageTemplate[]
): PublicationPage {
  const template = templates.find((item) => item.id === templateId);
  const kept = page.blocks.filter((block) => !block.fromTemplate);
  return {
    ...page,
    templateId,
    // Stand aside so the layout's background shows; a page that wants its own
    // back only has to set one.
    backgroundType:
      template && template.backgroundType !== "none" ? "none" : page.backgroundType,
    blocks: template ? [...templateStarterBlocks(template), ...kept] : kept,
  };
}

export function normalizeSlideshow(input: unknown): SlideshowSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(raw.enabled),
    intervalMs: Math.max(500, num(raw.intervalMs, defaultSlideshow.intervalMs)),
    loop: raw.loop === undefined ? true : Boolean(raw.loop),
    // Unsaid means no. A slideshow saved before this existed started on its
    // own, and the point of the setting is that it should not have.
    autoplay: Boolean(raw.autoplay),
  };
}

export function normalizeAudio(input: unknown): AudioSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    url: sanitizeMediaPath(str(raw.url)),
    loop: raw.loop === undefined ? true : Boolean(raw.loop),
    autoplay: Boolean(raw.autoplay),
    volume: Math.min(1, Math.max(0, num(raw.volume, 0.8))),
  };
}

export function normalizeCanvasSize(input: unknown): { width: number; height: number } {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    width: Math.max(100, Math.round(num(raw.width, 1920))),
    height: Math.max(100, Math.round(num(raw.height, 1080))),
  };
}

/** Public route for a publication, based on its kind. */
export function publicationHref(kind: PublicationKind, slug: string): string {
  if (kind === "presentation") return `/present/${slug}`;
  if (kind === "post") return `/post/${slug}`;
  return `/zines/${slug}`;
}

/* ------------------------------------------------------------- Arranging */

/**
 * Lining several blocks up, and spacing them out.
 *
 * Pure, and kept here rather than in the editor, because "align these left"
 * has exactly one right answer and it is arithmetic — the editor should be
 * able to hand over a selection and get the same result every time, and a
 * reader should be able to check the rule without reading a component.
 *
 * Rotation is deliberately ignored: a block's `x`, `y`, `width` and `height`
 * describe its unrotated box, which is what its handles and its stored
 * position both mean. Aligning by the corners of a turned block would move a
 * block that already looked aligned.
 */

export const ALIGNMENTS = [
  "left",
  "centre",
  "right",
  "top",
  "middle",
  "bottom",
] as const;

export type Alignment = (typeof ALIGNMENTS)[number];

export const ALIGNMENT_LABELS: Record<Alignment, string> = {
  left: "Left",
  centre: "Centre",
  right: "Right",
  top: "Top",
  middle: "Middle",
  bottom: "Bottom",
};

/** The box a set of blocks occupies together. */
export function boundsOf(blocks: PublicationBlock[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (blocks.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const left = Math.min(...blocks.map((block) => block.x));
  const top = Math.min(...blocks.map((block) => block.y));
  const right = Math.max(...blocks.map((block) => block.x + block.width));
  const bottom = Math.max(...blocks.map((block) => block.y + block.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * What a command moves as one thing: a lone block, or a whole group.
 *
 * Arranging acts on *units*, not on blocks. A group is an arrangement somebody
 * made deliberately, and lining its members up individually takes that
 * arrangement apart — aligning a group left used to stack every member on the
 * same edge, which is the one thing grouping them said not to do. Dragging has
 * always moved a group by one delta; this is the same rule, written down where
 * every arranging command can reach it.
 *
 * A group that has been opened is the exception. Double-clicking into one says
 * "I am working on the members now", so while it is open each selected member
 * is its own unit and lines up on its own.
 */
export type ArrangeUnit = {
  ids: string[];
  bounds: { x: number; y: number; width: number; height: number };
};

export function selectionUnits(
  blocks: PublicationBlock[],
  ids: string[],
  openGroupId?: string | null
): ArrangeUnit[] {
  const chosen = blocks.filter((block) => ids.includes(block.id));

  const units: ArrangeUnit[] = [];
  const byGroup = new Map<string, PublicationBlock[]>();

  for (const block of chosen) {
    const group = block.groupId;
    if (!group || group === openGroupId) {
      units.push({ ids: [block.id], bounds: boundsOf([block]) });
      continue;
    }
    const members = byGroup.get(group);
    if (members) members.push(block);
    else byGroup.set(group, [block]);
  }

  for (const members of byGroup.values()) {
    units.push({ ids: members.map((block) => block.id), bounds: boundsOf(members) });
  }

  return units;
}

/** Applies one offset to every block named by the units. */
function shiftUnits(
  blocks: PublicationBlock[],
  moves: Map<string, { dx: number; dy: number }>
): PublicationBlock[] {
  return blocks.map((block) => {
    const move = moves.get(block.id);
    if (!move) return block;
    return {
      ...block,
      x: Math.round(block.x + move.dx),
      y: Math.round(block.y + move.dy),
    };
  });
}

/**
 * Lines the chosen units up against each other, or against the page.
 *
 * Against each other, the edge they meet at is the outermost one already in
 * use — aligning left moves everything to the leftmost unit rather than to
 * some new place, so one unit stays where it was and the arrangement is
 * recognisably the same arrangement.
 *
 * Each unit is moved by a single offset, so a group arrives at the edge intact
 * rather than collapsing onto it.
 */
export function alignBlocks(
  blocks: PublicationBlock[],
  ids: string[],
  alignment: Alignment,
  against: { x: number; y: number; width: number; height: number },
  openGroupId?: string | null
): PublicationBlock[] {
  const units = selectionUnits(blocks, ids, openGroupId);
  if (units.length === 0) return blocks;

  const moves = new Map<string, { dx: number; dy: number }>();

  for (const unit of units) {
    const { bounds } = unit;
    let dx = 0;
    let dy = 0;

    switch (alignment) {
      case "left":
        dx = against.x - bounds.x;
        break;
      case "centre":
        dx = against.x + (against.width - bounds.width) / 2 - bounds.x;
        break;
      case "right":
        dx = against.x + against.width - bounds.width - bounds.x;
        break;
      case "top":
        dy = against.y - bounds.y;
        break;
      case "middle":
        dy = against.y + (against.height - bounds.height) / 2 - bounds.y;
        break;
      case "bottom":
        dy = against.y + against.height - bounds.height - bounds.y;
        break;
    }

    for (const id of unit.ids) moves.set(id, { dx, dy });
  }

  return shiftUnits(blocks, moves);
}

/**
 * Spreads the chosen units evenly between the two at the ends.
 *
 * The outermost two do not move — they are what "between" means — and the
 * gaps between the rest are made equal. Gaps rather than centres, so units of
 * different sizes end up evenly *spaced* rather than evenly *pitched*, which
 * is what somebody spacing things out is looking at.
 *
 * A group counts once and travels whole, the same as it does when aligned.
 * Fewer than three units has no middle to move, so nothing happens.
 */
export function distributeBlocks(
  blocks: PublicationBlock[],
  ids: string[],
  axis: "horizontal" | "vertical",
  openGroupId?: string | null
): PublicationBlock[] {
  const units = selectionUnits(blocks, ids, openGroupId);
  if (units.length < 3) return blocks;

  const size = (unit: ArrangeUnit) =>
    axis === "horizontal" ? unit.bounds.width : unit.bounds.height;
  const start = (unit: ArrangeUnit) =>
    axis === "horizontal" ? unit.bounds.x : unit.bounds.y;

  const ordered = [...units].sort((a, b) => start(a) - start(b));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  const span = start(last) + size(last) - start(first);
  const filled = ordered.reduce((total, unit) => total + size(unit), 0);
  // A negative gap means they overlap; spreading them is still the right
  // answer, and the overlap is simply shared out evenly.
  const gap = (span - filled) / (ordered.length - 1);

  const moves = new Map<string, { dx: number; dy: number }>();
  let cursor = start(first);
  for (const unit of ordered) {
    const delta = cursor - start(unit);
    for (const id of unit.ids) {
      moves.set(id, axis === "horizontal" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta });
    }
    cursor += size(unit) + gap;
  }

  return shiftUnits(blocks, moves);
}

/** The smallest a block is allowed to become, in canvas units. */
export const MIN_BLOCK_SIZE = 16;

/**
 * Resizes a whole selection by dragging one corner of the box around it.
 *
 * Every block is placed within the selection's box by proportion rather than
 * by offset, so a group keeps its arrangement while it grows: the gaps between
 * its members scale with it, and a block sitting a third of the way across
 * stays a third of the way across. Resizing one block on its own is the same
 * arithmetic with a box of one.
 *
 * Font sizes are left alone. Text in a publication is authored in rem and
 * scales with the viewer, and rewriting every style on a drag would make
 * dragging a corner an edit nobody asked for.
 */
export function resizeSelection(
  blocks: PublicationBlock[],
  ids: string[],
  from: { x: number; y: number; width: number; height: number },
  to: { width: number; height: number }
): PublicationBlock[] {
  const chosen = new Set(ids);
  if (chosen.size === 0 || from.width <= 0 || from.height <= 0) return blocks;

  const scaleX = Math.max(to.width, MIN_BLOCK_SIZE) / from.width;
  const scaleY = Math.max(to.height, MIN_BLOCK_SIZE) / from.height;

  return blocks.map((block) => {
    if (!chosen.has(block.id)) return block;

    const resized: PublicationBlock = {
      ...block,
      x: Math.round(from.x + (block.x - from.x) * scaleX),
      y: Math.round(from.y + (block.y - from.y) * scaleY),
      width: Math.max(MIN_BLOCK_SIZE, Math.round(block.width * scaleX)),
      height: Math.max(MIN_BLOCK_SIZE, Math.round(block.height * scaleY)),
    };

    /*
     * A table's box is its columns and rows, not a number stored beside them.
     * Resizing one has to reach the grid, or the box would be corrected back
     * to the grid the next time the table was touched and the drag undone.
     */
    if (resized.table) {
      resized.table = withTableScaled(resized.table, scaleX, scaleY);
      Object.assign(resized, tableSize(resized.table));
    }

    return resized;
  });
}

/** Every block that moves when one of these does: the selection, plus groups. */
export function withGroupMembers(
  blocks: PublicationBlock[],
  ids: string[]
): string[] {
  const groups = new Set(
    blocks
      .filter((block) => ids.includes(block.id) && block.groupId)
      .map((block) => block.groupId)
  );
  if (groups.size === 0) return [...new Set(ids)];

  return [
    ...new Set([
      ...ids,
      ...blocks
        .filter((block) => block.groupId && groups.has(block.groupId))
        .map((block) => block.id),
    ]),
  ];
}

/* ------------------------------------------------------- Copying a look */

/**
 * How a block is dressed, apart from what it is and where it sits.
 *
 * Its style, its shape's style, the slugs of any saved styles it wears, the
 * colour an icon or a code is drawn in, and how a picture is cropped and
 * cornered. Deliberately not its text, its media, its size or its position:
 * copying a look onto another block should leave that block being what it is
 * and standing where it stood.
 */
export type BlockStyle = Pick<
  PublicationBlock,
  | "styleSlug"
  | "textStyle"
  | "shapeSlug"
  | "shapeStyle"
  | "textPlacement"
  | "color"
  | "radius"
  | "objectFit"
>;

const BLOCK_STYLE_KEYS = [
  "styleSlug",
  "textStyle",
  "shapeSlug",
  "shapeStyle",
  "textPlacement",
  "color",
  "radius",
  "objectFit",
] as const;

export function blockStyleOf(block: PublicationBlock): BlockStyle {
  const style: BlockStyle = {};
  for (const key of BLOCK_STYLE_KEYS) {
    const value = block[key];
    if (value !== undefined) {
      // The cast is the price of copying a fixed set of keys off one object
      // onto another of the same shape; every key is checked above.
      (style as Record<string, unknown>)[key] = value;
    }
  }
  return style;
}

/**
 * Dresses a block in a look taken from another.
 *
 * Every style key is written, including the ones the copied block did not
 * have: a look pasted onto a block that already had one has to be able to
 * clear what was there, or pasting a plain style onto a decorated block would
 * leave the decoration behind and match neither.
 *
 * A key the target's type does not use is dropped the next time it is read —
 * `normalizePublicationBlock` writes only the fields each type has — so a text
 * colour pasted onto a photograph does not linger.
 */
export function withBlockStyle(
  block: PublicationBlock,
  style: BlockStyle
): PublicationBlock {
  const dressed: PublicationBlock = { ...block };
  for (const key of BLOCK_STYLE_KEYS) {
    if (style[key] === undefined) delete (dressed as Record<string, unknown>)[key];
    else (dressed as Record<string, unknown>)[key] = style[key];
  }
  return dressed;
}
