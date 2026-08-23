import type { CSSProperties } from "react";

import {
  backgroundBoxStyle,
  backgroundColorStyle,
  backgroundMediaStyle,
  borderStyle,
  columnInnerStyle,
  isBoundMediaBackground,
  defaultColumnSettings,
  normalizeColumnSettings,
  normalizeContainerSettings,
  MEDIA_BACKGROUNDS,
  type ColumnSettings,
  type ContainerSettings,
  type PageColumn,
} from "./page-layout";

/**
 * Nested `container` blocks are a real CSS grid: the container declares a
 * column and row count, and every cell states where it starts and how far it
 * spans. Nothing is auto-placed, so what the outline map shows is what renders.
 *
 * The whole grid — counts, gap, and every cell's placement — is defined once
 * per breakpoint, because a layout that works across three columns rarely
 * survives being squeezed into one. Cells otherwise behave exactly like
 * columns: same background, alignment and spacing settings, same renderer.
 */

export const CONTAINER_BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;
export type ContainerBreakpoint = (typeof CONTAINER_BREAKPOINTS)[number];

export const CONTAINER_BREAKPOINT_LABELS: Record<ContainerBreakpoint, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

/** Where a cell sits on the grid at one breakpoint. */
export type CellPlacement = {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
};

/**
 * An area's settings, per breakpoint.
 *
 * Desktop is the base and always present; tablet and mobile are `null` until
 * the area is given settings of its own for that view, and inherit desktop
 * until then. Storing the override rather than three full copies is what keeps
 * a background set once on desktop from silently vanishing on a phone.
 */
export type CellSettings = {
  desktop: ColumnSettings;
  tablet: ColumnSettings | null;
  mobile: ColumnSettings | null;
};

export type ContainerCell = {
  id: string;
  placement: Record<ContainerBreakpoint, CellPlacement>;
  settings: CellSettings;
  blocks: unknown[];
};

/** The settings an area renders with at one breakpoint. */
export function cellSettings(
  cell: ContainerCell,
  breakpoint: ContainerBreakpoint
): ColumnSettings {
  return cell.settings[breakpoint] ?? cell.settings.desktop;
}

/** True when this view states settings of its own rather than following desktop. */
export function cellHasOverride(
  cell: ContainerCell,
  breakpoint: ContainerBreakpoint
): boolean {
  return breakpoint !== "desktop" && cell.settings[breakpoint] !== null;
}

export type ContainerGrid = {
  columns: number;
  rows: number;
  gap: number; // rem
  rowMinHeight: number; // rem, 0 = auto
};

/** Whether the container claims its slot or shrinks to what is inside it. */
export const CONTAINER_SIZINGS = ["fill", "fit"] as const;
export type ContainerSizing = (typeof CONTAINER_SIZINGS)[number];

/**
 * Which record feeds the slots placed inside the container. A container can be
 * bound to a story and a collection at once — they fill different slots.
 */
export const CONTAINER_STORY_SOURCES = ["none", "latest", "specific"] as const;
export type ContainerStorySource = (typeof CONTAINER_STORY_SOURCES)[number];

export const CONTAINER_COLLECTION_SOURCES = CONTAINER_STORY_SOURCES;
export type ContainerCollectionSource = ContainerStorySource;

export type ContainerLayout = {
  grids: Record<ContainerBreakpoint, ContainerGrid>;
  cells: ContainerCell[];
  sizing: ContainerSizing;
  /** Background, border and spacing of the container itself. */
  settings: ContainerSettings;
  storySource: ContainerStorySource;
  /** Only meaningful when `storySource` is "specific". */
  storyId: string;
  collectionSource: ContainerCollectionSource;
  /** Only meaningful when `collectionSource` is "specific". */
  collectionId: string;
};

const MAX_TRACKS = 12;
const MAX_CELLS = 60;

export const defaultContainerGrid: Record<ContainerBreakpoint, ContainerGrid> = {
  desktop: { columns: 2, rows: 1, gap: 1, rowMinHeight: 0 },
  tablet: { columns: 2, rows: 1, gap: 1, rowMinHeight: 0 },
  mobile: { columns: 1, rows: 2, gap: 1, rowMinHeight: 0 },
};

let cellCounter = 0;
function cellId() {
  cellCounter += 1;
  return `cell-${Date.now().toString(36)}-${cellCounter}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** A cell created at `index` is placed in the next free slot, reading in order. */
export function createContainerCell(index = 0, columns = 2): ContainerCell {
  const placement = (cols: number): CellPlacement => ({
    colStart: (index % cols) + 1,
    colSpan: 1,
    rowStart: Math.floor(index / cols) + 1,
    rowSpan: 1,
  });

  return {
    id: cellId(),
    placement: {
      desktop: placement(columns),
      tablet: placement(Math.min(columns, 2)),
      mobile: { colStart: 1, colSpan: 1, rowStart: index + 1, rowSpan: 1 },
    },
    settings: { desktop: { ...defaultColumnSettings }, tablet: null, mobile: null },
    blocks: [],
  };
}

/**
 * Lay spans out left to right, wrapping when one will not fit — the same order
 * the browser used to auto-place them. Used for cells that carry no placement
 * of their own, which is every cell in a layout saved before the grid became
 * explicit.
 */
function flowPlacements(spans: number[], columns: number): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  let col = 1;
  let row = 1;

  for (const rawSpan of spans) {
    const span = Math.min(Math.max(1, rawSpan), columns);
    if (col + span - 1 > columns) {
      col = 1;
      row += 1;
    }
    out.push({ col, row });
    col += span;
  }
  return out;
}

function normalizePlacement(
  input: unknown,
  grid: ContainerGrid,
  fallback: { col: number; row: number }
): CellPlacement {
  const raw = (input ?? {}) as Partial<CellPlacement>;
  const colStart = clampInt(raw.colStart, 1, grid.columns, fallback.col);
  const rowStart = clampInt(raw.rowStart, 1, Math.max(1, grid.rows), fallback.row);

  return {
    colStart,
    // A span can never run past the last track it starts in.
    colSpan: clampInt(raw.colSpan, 1, grid.columns - colStart + 1, 1),
    rowStart,
    rowSpan: clampInt(raw.rowSpan, 1, 12, 1),
  };
}

function normalizeGrid(input: unknown, fallback: ContainerGrid): ContainerGrid {
  const raw = (input ?? {}) as Partial<ContainerGrid>;
  return {
    columns: clampInt(raw.columns, 1, MAX_TRACKS, fallback.columns),
    rows: clampInt(raw.rows, 1, MAX_TRACKS, fallback.rows),
    gap: numberOr(raw.gap, fallback.gap),
    rowMinHeight: numberOr(raw.rowMinHeight, fallback.rowMinHeight),
  };
}

export function normalizeContainerLayout(
  input: unknown,
  /**
   * Applied to each cell's blocks. Omitted when re-normalizing an already
   * normalized layout, where running block normalization again is wasted work.
   */
  normalizeBlocksFn?: (input: unknown) => unknown[]
): ContainerLayout {
  const raw = (input ?? {}) as Record<string, any>;

  // Layouts saved before the grid became explicit stored one column count per
  // breakpoint and let the browser place cells. Read those into the new shape
  // so an existing container keeps its arrangement.
  const legacy = raw.grids === undefined;
  const gridsRaw = legacy
    ? {
        desktop: {
          columns: raw.columns,
          rows: 0,
          gap: raw.gap,
          rowMinHeight: raw.rowMinHeight,
        },
        tablet: {
          columns: raw.columnsTablet,
          rows: 0,
          gap: raw.gap,
          rowMinHeight: raw.rowMinHeight,
        },
        mobile: {
          columns: raw.columnsMobile,
          rows: 0,
          gap: raw.gap,
          rowMinHeight: raw.rowMinHeight,
        },
      }
    : raw.grids;

  const grids = {} as Record<ContainerBreakpoint, ContainerGrid>;
  for (const breakpoint of CONTAINER_BREAKPOINTS) {
    grids[breakpoint] = normalizeGrid(
      gridsRaw?.[breakpoint],
      defaultContainerGrid[breakpoint]
    );
  }

  const cellsRaw = Array.isArray(raw.cells) ? raw.cells.slice(0, MAX_CELLS) : [];

  // Enough rows to hold the arrangement, so nothing spills into an implicit
  // track the editor cannot see.
  const legacySpans = cellsRaw.map((cell: any) => Number(cell?.colSpan) || 1);
  const flowSpans = legacy ? legacySpans : cellsRaw.map(() => 1);

  for (const breakpoint of CONTAINER_BREAKPOINTS) {
    const flowed = flowPlacements(flowSpans, grids[breakpoint].columns);
    const stated = cellsRaw.map(
      (cell: any) => Number(cell?.placement?.[breakpoint]?.rowStart) || 0
    );
    const needed = Math.max(1, ...flowed.map((place) => place.row), ...stated);
    if (grids[breakpoint].rows < needed) grids[breakpoint].rows = needed;
  }

  // Where each cell lands when it states no placement of its own.
  const flow = {} as Record<ContainerBreakpoint, { col: number; row: number }[]>;
  for (const breakpoint of CONTAINER_BREAKPOINTS) {
    flow[breakpoint] = flowPlacements(flowSpans, grids[breakpoint].columns);
  }

  const cells: ContainerCell[] = cellsRaw.map((cell: any, index: number) => {
    const source = (cell ?? {}) as Record<string, any>;
    const placement = {} as Record<ContainerBreakpoint, CellPlacement>;

    for (const breakpoint of CONTAINER_BREAKPOINTS) {
      // Legacy cells carried one span shared by every breakpoint.
      const from = legacy
        ? { colSpan: source.colSpan, rowSpan: source.rowSpan }
        : source.placement?.[breakpoint];
      placement[breakpoint] = normalizePlacement(
        from,
        grids[breakpoint],
        flow[breakpoint][index] ?? { col: 1, row: 1 }
      );
    }

    // Areas used to carry one set of settings for every view. That becomes the
    // desktop base, which the other two then follow.
    const rawSettings = (source.settings ?? {}) as Record<string, unknown>;
    const perView = rawSettings.desktop !== undefined;

    return {
      id: typeof source.id === "string" && source.id ? source.id : cellId(),
      placement,
      settings: {
        desktop: normalizeColumnSettings(perView ? rawSettings.desktop : rawSettings),
        tablet: perView && rawSettings.tablet ? normalizeColumnSettings(rawSettings.tablet) : null,
        mobile: perView && rawSettings.mobile ? normalizeColumnSettings(rawSettings.mobile) : null,
      },
      blocks: normalizeBlocksFn
        ? normalizeBlocksFn(source.blocks)
        : Array.isArray(source.blocks)
          ? source.blocks
          : [],
    };
  });

  if (cells.length === 0) {
    for (let index = 0; index < grids.desktop.columns; index += 1) {
      cells.push(createContainerCell(index, grids.desktop.columns));
    }
  }

  const storySource = (CONTAINER_STORY_SOURCES as readonly string[]).includes(
    raw.storySource
  )
    ? (raw.storySource as ContainerStorySource)
    : "none";

  const collectionSource = (CONTAINER_COLLECTION_SOURCES as readonly string[]).includes(
    raw.collectionSource
  )
    ? (raw.collectionSource as ContainerCollectionSource)
    : "none";

  return {
    grids,
    cells,
    sizing: (CONTAINER_SIZINGS as readonly string[]).includes(raw.sizing)
      ? (raw.sizing as ContainerSizing)
      : "fill",
    settings: normalizeContainerSettings(raw.settings),
    storySource,
    // Dropped when the source changes, so a stale id cannot resurface.
    storyId: storySource === "specific" ? String(raw.storyId ?? "") : "",
    collectionSource,
    collectionId:
      collectionSource === "specific" ? String(raw.collectionId ?? "") : "",
  };
}

/* ------------------------------------------------------------------- CSS */

function gridDeclarations(grid: ContainerGrid): string {
  const rows =
    grid.rowMinHeight > 0
      ? `repeat(${grid.rows}, minmax(${grid.rowMinHeight}rem, auto))`
      : `repeat(${grid.rows}, auto)`;
  return (
    `grid-template-columns: repeat(${grid.columns}, minmax(0, 1fr));` +
    `grid-template-rows: ${rows};` +
    `gap: ${grid.gap}rem;`
  );
}

function placementDeclarations(placement: CellPlacement): string {
  return (
    `grid-column: ${placement.colStart} / span ${placement.colSpan};` +
    `grid-row: ${placement.rowStart} / span ${placement.rowSpan};`
  );
}

/** React style objects into a CSS declaration list. */
function declarations(style: CSSProperties): string {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`)
    .join("");
}

/**
 * Every rule an area needs at one breakpoint.
 *
 * An area's settings vary by view, and a style attribute cannot: the same
 * element has to look different inside a media query. So none of this is
 * applied inline — the whole appearance of an area lives here, keyed by its id.
 */
function cellRules(
  cell: ContainerCell,
  breakpoint: ContainerBreakpoint,
  prefix: string
): string[] {
  const settings = cellSettings(cell, breakpoint);
  const at = `${prefix}[data-cell="${cell.id}"]`;
  const flow = settings.backgroundFit === "width";

  /*
   * Every property is stated at every breakpoint, including the ones this view
   * does not use. A view that turns a border off has to say so: the desktop
   * rule is still in the cascade, and an omitted property would simply keep it.
   */
  const box = {
    backgroundColor: "transparent",
    borderStyle: "none",
    borderWidth: 0,
    borderRadius: 0,
    aspectRatio: "auto",
    ...backgroundColorStyle(settings),
    ...borderStyle(settings),
    ...backgroundBoxStyle(settings),
  } as CSSProperties;

  const media = { minHeight: 0, ...backgroundMediaStyle(settings) } as CSSProperties;

  const lines = [
    `${at} { ${placementDeclarations(cell.placement[breakpoint])}${declarations(box)} }`,
    `${at} > .pb-column-inner { ${declarations(
      columnInnerStyle({ settings } as PageColumn)
    )} }`,
    // Only "scale to width" is in flow, where the media's height grows the area.
    `${at} > .pb-column-bg { position: ${flow ? "relative" : "absolute"}; inset: ${
      flow ? "auto" : "0"
    }; }`,
    `${at} > .pb-column-bg > img, ${at} > .pb-column-bg > video { ${declarations(media)} }`,
    `${at} > .pb-column-bg > .pb-bg-overlay { background: ${
      settings.backgroundOverlay || "transparent"
    }; }`,
  ];

  // Media that differs by view is rendered once per source and shown here, so
  // only the variant this breakpoint asks for is on screen.
  if (cellMediaIsGated(cell)) {
    lines.push(
      `${at} > .pb-column-bg > [data-bp] { display: none; }`,
      `${at} > .pb-column-bg > [data-bp~="${breakpoint}"] { display: block; }`
    );
  }

  return lines;
}

/**
 * The distinct background media an area needs across the three views.
 *
 * One entry when every view shows the same thing, which is the common case and
 * the one that must not download an image per breakpoint.
 */
export function cellMediaVariants(
  cell: ContainerCell
): { key: string; type: string; url: string; breakpoints: ContainerBreakpoint[] }[] {
  const variants: ReturnType<typeof cellMediaVariants> = [];

  for (const breakpoint of CONTAINER_BREAKPOINTS) {
    const settings = cellSettings(cell, breakpoint);
    const type = settings.backgroundType;
    // Bound media has no address of its own; the type is what identifies it.
    const bound = isBoundMediaBackground(type);
    const url = bound ? "" : settings.backgroundMediaUrl;
    if (!MEDIA_BACKGROUNDS.includes(type) || (!bound && !url)) continue;

    const key = `${type}|${url}`;
    const existing = variants.find((variant) => variant.key === key);
    if (existing) existing.breakpoints.push(breakpoint);
    else variants.push({ key, type, url, breakpoints: [breakpoint] });
  }

  return variants;
}

/**
 * Whether the media elements have to be tagged and shown per view.
 *
 * Not just "more than one source": a single image that only some views ask for
 * still has to be hidden in the others, or a view that switched its background
 * to a colour would keep showing the image behind it.
 */
export function cellMediaIsGated(cell: ContainerCell): boolean {
  const variants = cellMediaVariants(cell);
  if (variants.length === 0) return false;
  return (
    variants.length > 1 ||
    variants[0].breakpoints.length !== CONTAINER_BREAKPOINTS.length
  );
}

function breakpointRules(
  id: string,
  layout: ContainerLayout,
  breakpoint: ContainerBreakpoint,
  prefix: string
): string {
  const container = `${prefix}[data-container="${id}"]`;
  const lines = [`${container} { ${gridDeclarations(layout.grids[breakpoint])} }`];

  for (const cell of layout.cells) lines.push(...cellRules(cell, breakpoint, prefix));

  return lines.join("\n");
}

/**
 * The whole grid as one scoped stylesheet.
 *
 * Media queries cannot live in a style attribute, and the builder canvas is a
 * narrow box inside a wide window — so each breakpoint is emitted twice: once
 * for real viewports and once keyed to the canvas's viewport switch, which is
 * what makes the preview agree with the published page.
 */
export function containerCss(id: string, input: ContainerLayout): string {
  // A container reaching a renderer unnormalized is rare but real — a reusable
  // block saved before the grid became explicit still carries the old shape.
  const layout = ensureContainerLayout(input);
  return [
    breakpointRules(id, layout, "desktop", ""),
    `@media (max-width: 64rem) {\n${breakpointRules(id, layout, "tablet", "")}\n}`,
    `@media (max-width: 48rem) {\n${breakpointRules(id, layout, "mobile", "")}\n}`,
    breakpointRules(id, layout, "tablet", '.builder-canvas[data-viewport="tablet"] '),
    breakpointRules(id, layout, "mobile", '.builder-canvas[data-viewport="mobile"] '),
  ].join("\n");
}

/** Normalizes only when the value has not been through it already. */
export function ensureContainerLayout(input: unknown): ContainerLayout {
  const raw = input as ContainerLayout | undefined;
  return raw?.grids && Array.isArray(raw.cells) && raw.settings
    ? raw
    : normalizeContainerLayout(input);
}

/**
 * The size setting belongs on the block wrapper, not on the grid inside it.
 *
 * A column is a flex column whose `align-items` decides how wide its children
 * are, so the wrapper — the actual flex item — is what has to stretch or
 * shrink. Sizing the grid alone leaves it filling a wrapper that is already
 * only as wide as its content, which is why "fill" used to do nothing.
 *
 * `fit` deliberately sets no `align-self`, so a block alignment of centre or
 * right still moves the shrunken container within its column.
 */
export function containerOuterStyle(layout: ContainerLayout): CSSProperties {
  return layout.sizing === "fit"
    ? { width: "fit-content", maxWidth: "100%" }
    : { width: "100%", alignSelf: "stretch" };
}

/** Only what cannot be expressed in the scoped sheet. */
export function containerStyle(layout: ContainerLayout): CSSProperties {
  return layout.sizing === "fit"
    ? { display: "grid", width: "fit-content", maxWidth: "100%" }
    : { display: "grid", width: "100%" };
}

/**
 * The shell around the grid, which is what carries the container's own
 * background, border and spacing.
 *
 * These cannot go on the grid element itself: its children are grid items, and
 * a background layer sitting among them would claim a track.
 */
export function containerShellStyle(layout: ContainerLayout): CSSProperties {
  return {
    ...backgroundColorStyle(layout.settings),
    ...borderStyle(layout.settings),
    marginTop: `${layout.settings.marginTop}rem`,
    marginRight: `${layout.settings.marginRight}rem`,
    marginBottom: `${layout.settings.marginBottom}rem`,
    marginLeft: `${layout.settings.marginLeft}rem`,
  };
}

/**
 * Padding sits on the inner element, not the shell.
 *
 * The background layer is a sibling of this element rather than a child, so
 * padding here still has the media behind it — the same arrangement a column
 * and its areas already use.
 */
export function containerShellInnerStyle(layout: ContainerLayout): CSSProperties {
  return {
    paddingTop: `${layout.settings.paddingTop}rem`,
    paddingRight: `${layout.settings.paddingRight}rem`,
    paddingBottom: `${layout.settings.paddingBottom}rem`,
    paddingLeft: `${layout.settings.paddingLeft}rem`,
  };
}

/* --------------------------------------------------------------- Editing */

/** Re-clamps every placement after a grid change, so nothing lands off-grid. */
export function withGrid(
  layout: ContainerLayout,
  breakpoint: ContainerBreakpoint,
  patch: Partial<ContainerGrid>
): ContainerLayout {
  return normalizeContainerLayout({
    ...layout,
    grids: { ...layout.grids, [breakpoint]: { ...layout.grids[breakpoint], ...patch } },
  });
}

export function withCellPlacement(
  layout: ContainerLayout,
  cellIndex: number,
  breakpoint: ContainerBreakpoint,
  patch: Partial<CellPlacement>
): ContainerLayout {
  return normalizeContainerLayout({
    ...layout,
    cells: layout.cells.map((cell, index) =>
      index === cellIndex
        ? {
            ...cell,
            placement: {
              ...cell.placement,
              [breakpoint]: { ...cell.placement[breakpoint], ...patch },
            },
          }
        : cell
    ),
  });
}

/**
 * Edits an area's settings for one view.
 *
 * Editing a view that is still following desktop writes into desktop, so a
 * change made without asking for an override reaches every view — the opposite
 * would let someone style the desktop panel and find the phone unchanged.
 */
export function withCellSettings(
  layout: ContainerLayout,
  cellIndex: number,
  breakpoint: ContainerBreakpoint,
  patch: Partial<ColumnSettings>
): ContainerLayout {
  return {
    ...layout,
    cells: layout.cells.map((cell, index) => {
      if (index !== cellIndex) return cell;
      const target = cell.settings[breakpoint] === null ? "desktop" : breakpoint;
      return {
        ...cell,
        settings: {
          ...cell.settings,
          [target]: { ...cellSettings(cell, target), ...patch },
        },
      };
    }),
  };
}

/**
 * Gives a view its own copy of the settings, or drops it back to following
 * desktop. Desktop itself is the base and can never be an override.
 */
export function withCellOverride(
  layout: ContainerLayout,
  cellIndex: number,
  breakpoint: ContainerBreakpoint,
  enabled: boolean
): ContainerLayout {
  if (breakpoint === "desktop") return layout;

  return {
    ...layout,
    cells: layout.cells.map((cell, index) =>
      index === cellIndex
        ? {
            ...cell,
            settings: {
              ...cell.settings,
              // Starts from what the view already showed, so turning the
              // override on changes nothing until something is edited.
              [breakpoint]: enabled ? { ...cellSettings(cell, breakpoint) } : null,
            },
          }
        : cell
    ),
  };
}

export function withContainerSettings(
  layout: ContainerLayout,
  patch: Partial<ContainerSettings>
): ContainerLayout {
  return { ...layout, settings: { ...layout.settings, ...patch } };
}

/** Reorders the blocks in one area, used by the container outline's drag. */
export function withReorderedCellBlocks(
  layout: ContainerLayout,
  cellIndex: number,
  from: number,
  to: number
): ContainerLayout {
  const cell = layout.cells[cellIndex];
  if (!cell || from === to) return layout;

  const blocks = [...cell.blocks];
  const [moved] = blocks.splice(from, 1);
  if (moved === undefined) return layout;
  // `to` was measured before the removal, so anything after it shifts down.
  blocks.splice(from < to ? to - 1 : to, 0, moved);

  return {
    ...layout,
    cells: layout.cells.map((item, index) =>
      index === cellIndex ? { ...item, blocks } : item
    ),
  };
}

/**
 * Moves a block between areas, used by the container outline's drag.
 *
 * The page outline lists a container as a single collapsed node, so this is the
 * only way a block crosses from one area to another.
 */
export function withMovedCellBlock(
  layout: ContainerLayout,
  fromCell: number,
  fromIndex: number,
  toCell: number,
  toIndex: number
): ContainerLayout {
  if (fromCell === toCell) {
    return withReorderedCellBlocks(layout, fromCell, fromIndex, toIndex);
  }

  const source = layout.cells[fromCell];
  const target = layout.cells[toCell];
  if (!source || !target) return layout;

  const moved = source.blocks[fromIndex];
  if (moved === undefined) return layout;

  return {
    ...layout,
    cells: layout.cells.map((cell, index) => {
      if (index === fromCell) {
        return { ...cell, blocks: cell.blocks.filter((_, item) => item !== fromIndex) };
      }
      if (index === toCell) {
        const blocks = [...cell.blocks];
        // `toIndex` indexes the target area, which the removal above does not
        // touch, so it needs no adjustment.
        blocks.splice(Math.min(Math.max(0, toIndex), blocks.length), 0, moved);
        return { ...cell, blocks };
      }
      return cell;
    }),
  };
}

export function withoutCellBlock(
  layout: ContainerLayout,
  cellIndex: number,
  blockIndex: number
): ContainerLayout {
  return {
    ...layout,
    cells: layout.cells.map((cell, index) =>
      index === cellIndex
        ? { ...cell, blocks: cell.blocks.filter((_, item) => item !== blockIndex) }
        : cell
    ),
  };
}
