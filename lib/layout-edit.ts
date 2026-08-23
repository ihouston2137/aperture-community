import type { PageBlock, PageColumn, PageRow } from "./page-layout";

/**
 * Immutable edit helpers shared by every builder.
 *
 * A block is addressed by a `BlockPath`: the index of the block in its column,
 * then repeating `[cellIndex, blockIndex]` pairs for each nested container it
 * sits inside. That single addressing scheme is what lets the outline, canvas
 * and inspector agree on "the selected block" at any depth.
 */
export type BlockPath = number[];

export type Selection =
  | { kind: "row"; rowIndex: number }
  | { kind: "column"; rowIndex: number; columnIndex: number }
  | { kind: "block"; rowIndex: number; columnIndex: number; path: BlockPath }
  | null;

type AnyBlock = PageBlock & { container?: { cells: { blocks: any[] }[] } };

export function getBlocksAtParent(blocks: AnyBlock[], path: BlockPath): AnyBlock[] | null {
  if (path.length === 1) return blocks;

  const [blockIndex, cellIndex, ...rest] = path;
  const block = blocks[blockIndex];
  const cell = block?.container?.cells?.[cellIndex];
  if (!cell) return null;
  return getBlocksAtParent(cell.blocks as AnyBlock[], rest);
}

export function getBlockAt(blocks: AnyBlock[], path: BlockPath): AnyBlock | null {
  const parent = getBlocksAtParent(blocks, path);
  if (!parent) return null;
  return parent[path[path.length - 1]] ?? null;
}

function mapBlocksAtParent(
  blocks: AnyBlock[],
  path: BlockPath,
  transform: (siblings: AnyBlock[]) => AnyBlock[]
): AnyBlock[] {
  if (path.length === 1) return transform(blocks);

  const [blockIndex, cellIndex, ...rest] = path;
  return blocks.map((block, index) => {
    if (index !== blockIndex || !block.container) return block;
    return {
      ...block,
      container: {
        ...block.container,
        cells: block.container.cells.map((cell, currentCell) =>
          currentCell !== cellIndex
            ? cell
            : { ...cell, blocks: mapBlocksAtParent(cell.blocks as AnyBlock[], rest, transform) }
        ),
      },
    };
  });
}

export function updateBlockAt(
  blocks: AnyBlock[],
  path: BlockPath,
  patch: Partial<AnyBlock>
): AnyBlock[] {
  const index = path[path.length - 1];
  return mapBlocksAtParent(blocks, path, (siblings) =>
    siblings.map((block, blockIndex) =>
      blockIndex === index ? { ...block, ...patch } : block
    )
  );
}

export function removeBlockAt(blocks: AnyBlock[], path: BlockPath): AnyBlock[] {
  const index = path[path.length - 1];
  return mapBlocksAtParent(blocks, path, (siblings) =>
    siblings.filter((_, blockIndex) => blockIndex !== index)
  );
}

export function insertBlockAt(
  blocks: AnyBlock[],
  path: BlockPath,
  block: AnyBlock
): AnyBlock[] {
  const index = path[path.length - 1];
  return mapBlocksAtParent(blocks, path, (siblings) => [
    ...siblings.slice(0, index),
    block,
    ...siblings.slice(index),
  ]);
}

export function moveBlockAt(
  blocks: AnyBlock[],
  path: BlockPath,
  direction: -1 | 1
): AnyBlock[] {
  const index = path[path.length - 1];
  return mapBlocksAtParent(blocks, path, (siblings) => {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return siblings;
    const next = [...siblings];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

/* ---------------------------------------------------------- Row / column */

export function updateRow(
  layout: PageRow[],
  rowIndex: number,
  patch: Partial<PageRow>
): PageRow[] {
  return layout.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row));
}

export function updateColumn(
  layout: PageRow[],
  rowIndex: number,
  columnIndex: number,
  patch: Partial<PageColumn>
): PageRow[] {
  return updateRow(layout, rowIndex, {
    ...layout[rowIndex],
    columns: layout[rowIndex].columns.map((column, index) =>
      index === columnIndex ? { ...column, ...patch } : column
    ),
  });
}

export function updateColumnBlocks(
  layout: PageRow[],
  rowIndex: number,
  columnIndex: number,
  transform: (blocks: AnyBlock[]) => AnyBlock[]
): PageRow[] {
  return updateColumn(layout, rowIndex, columnIndex, {
    blocks: transform(layout[rowIndex].columns[columnIndex].blocks as AnyBlock[]) as PageBlock[],
  });
}

export function moveRow(layout: PageRow[], rowIndex: number, direction: -1 | 1): PageRow[] {
  const target = rowIndex + direction;
  if (target < 0 || target >= layout.length) return layout;
  const next = [...layout];
  [next[rowIndex], next[target]] = [next[target], next[rowIndex]];
  return next;
}

export function removeRow(layout: PageRow[], rowIndex: number): PageRow[] {
  return layout.filter((_, index) => index !== rowIndex);
}

/* ------------------------------------------------------------------ Moving */

/** A block's full address: which row, which column, and where inside it. */
export type BlockLocation = {
  rowIndex: number;
  columnIndex: number;
  path: BlockPath;
};

function sameParent(a: BlockLocation, b: BlockLocation): boolean {
  return (
    a.rowIndex === b.rowIndex &&
    a.columnIndex === b.columnIndex &&
    a.path.length === b.path.length &&
    a.path.slice(0, -1).every((value, index) => value === b.path[index])
  );
}

/** True when `to` is inside the block at `from` — dropping there would orphan it. */
function isDescendant(from: BlockLocation, to: BlockLocation): boolean {
  if (from.rowIndex !== to.rowIndex || from.columnIndex !== to.columnIndex) return false;
  if (to.path.length <= from.path.length) return false;
  return from.path.every((value, index) => value === to.path[index]);
}

/**
 * Move a block anywhere: within its column, into another column, into or out of
 * a container cell.
 *
 * The block is removed before it is reinserted, so when both ends share a parent
 * the destination index has to shift down by one for anything after the removal.
 */
export function moveBlock(
  layout: PageRow[],
  from: BlockLocation,
  to: BlockLocation
): PageRow[] {
  const sourceColumn = layout[from.rowIndex]?.columns[from.columnIndex];
  const targetColumn = layout[to.rowIndex]?.columns[to.columnIndex];
  if (!sourceColumn || !targetColumn) return layout;
  if (isDescendant(from, to)) return layout;

  const block = getBlockAt(sourceColumn.blocks as AnyBlock[], from.path);
  if (!block) return layout;

  const fromIndex = from.path[from.path.length - 1];
  let toIndex = to.path[to.path.length - 1];
  if (sameParent(from, to) && toIndex > fromIndex) toIndex -= 1;
  if (sameParent(from, to) && toIndex === fromIndex) return layout;

  const destination = [...to.path.slice(0, -1), toIndex];

  const withoutBlock = updateColumnBlocks(layout, from.rowIndex, from.columnIndex, (blocks) =>
    removeBlockAt(blocks, from.path)
  );

  return updateColumnBlocks(withoutBlock, to.rowIndex, to.columnIndex, (blocks) =>
    insertBlockAt(blocks, destination, block)
  );
}

/** Deep clone with fresh ids, used by duplicate actions and saved blocks. */
export function cloneWithNewIds<T>(value: T, prefix = "copy"): T {
  const seed = `${prefix}-${Date.now().toString(36)}`;
  let counter = 0;

  const walk = (input: any): any => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(input)) {
        out[key] = key === "id" && typeof item === "string" ? `${seed}-${counter++}` : walk(item);
      }
      return out;
    }
    return input;
  };

  return walk(value) as T;
}
