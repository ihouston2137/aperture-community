"use client";

import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode, useState } from "react";

import {
  CellShell,
  ColumnShell,
  ContainerShell,
  RowShell,
  type BoundMedia,
} from "@/components/block-primitives";
import { IconView } from "@/components/icons";
import {
  containerCss,
  containerOuterStyle,
  containerShellInnerStyle,
  containerShellStyle,
  containerStyle,
  ensureContainerLayout,
  type ContainerLayout,
} from "@/lib/page-container-layout";
import {
  cloneWithNewIds,
  getBlockAt,
  getBlocksAtParent,
  insertBlockAt,
  moveBlock,
  moveBlockAt,
  moveRow,
  removeBlockAt,
  removeRow,
  updateBlockAt,
  updateColumn,
  updateColumnBlocks,
  updateRow,
  type BlockPath,
  type Selection,
} from "@/lib/layout-edit";
import {
  blockFillsWidth,
  createColumn,
  createRow,
  rebalanceColumns,
  type PageBlock,
  type PageRow,
} from "@/lib/page-layout";
import { layoutResponsiveCss } from "@/lib/responsive-style";

import { EyeOff } from "lucide-react";

import {
  ColumnSettingsFields,
  RowSettingsFields,
  type VisibilityRole,
} from "./settings-fields";

export type PaletteItem = {
  type: string;
  label: string;
  /** Key into the curated icon set, shown above the label. */
  icon?: string;
  /**
   * Optional heading. A run of items sharing a group is preceded by a divider
   * carrying this label; palettes that set no groups render as one plain list.
   */
  group?: string;
};

export type LayoutBuilderProps = {
  layout: PageRow[];
  onChange: (layout: PageRow[]) => void;

  palette: PaletteItem[];
  createBlock: (type: string) => PageBlock;
  blockLabel: (block: PageBlock) => string;

  /**
   * Read-only preview of a block, rendered inside the canvas. The container is
   * supplied for blocks inside one, so a story slot can find the story its
   * container is bound to.
   */
  renderPreview: (block: PageBlock, container?: ContainerLayout) => ReactNode;
  /** Settings panel for the selected block. */
  renderInspector: (
    block: PageBlock,
    update: (patch: Partial<PageBlock>) => void,
    context: InspectorContext
  ) => ReactNode;

  /**
   * Extra CSS to put inside the canvas.
   *
   * The builder derives a layout's own per-view rules itself, but a host may
   * have sheets that come from records rather than from the layout — the page
   * builder's Calendar Styles — and those have to land inside the canvas or the
   * preview shows an unstyled version of what the page will publish.
   */
  extraCss?: string;
  /** Page builder only: nested containers and reusable saved blocks. */
  supportsContainers?: boolean;
  savedBlocks?: SavedBlock[];
  /** Creates the named block, or replaces the one already using that name. */
  onSaveBlock?: (name: string, icon: string, block: PageBlock) => void;
  onDeleteSavedBlock?: (id: string) => void;
  /**
   * The feature media of the story a container is bound to, so an area using
   * "story feature media" as its background shows it on the canvas.
   */
  boundBackgroundMedia?: (container: ContainerLayout) => BoundMedia;

  topbar?: ReactNode;
  /** Where the builder's back link goes; the admin sidebar is hidden here. */
  exitHref: string;
  exitLabel: string;
  /** Optional chrome rendered around the rows, e.g. the live site header/footer. */
  canvasHeader?: ReactNode;
  canvasFooter?: ReactNode;
  /** Extra classes for the canvas, used to scope the chrome's CSS variables. */
  canvasClassName?: string;
  /** Inline custom properties for the canvas, e.g. colour overrides. */
  canvasStyle?: CSSProperties;
  /**
   * Dresses the box the rows sit in, for documents that have one of their own —
   * a form's container and width. The canvas itself must not carry these: its
   * width belongs to the viewport switch.
   */
  canvasContentClassName?: string;
  canvasContentStyle?: CSSProperties;
  /**
   * Settings for the document as a whole. Shown in the inspector when nothing
   * is selected, which is otherwise dead space.
   */
  documentSettings?: ReactNode;
  /**
   * The padding a newly added row or column starts with, in rem.
   *
   * A builder's own choice rather than one rule for all of them: a page and a
   * form are boxes somebody dresses, and want a little room by default, while
   * a template that renders into a fixed slot is measured to fit and would be
   * thrown out by padding it did not ask for. Unset means none, as before.
   */
  newContainerPadding?: number;
  /**
   * The roles a row or column may be restricted to, where that is honoured.
   *
   * Passed only by the page builder: a page filters its layout by who is
   * looking, and the other builders that share this chrome do not. Left unset,
   * no visibility control is offered, which is the honest thing to show for a
   * setting nothing would read.
   */
  visibilityRoles?: VisibilityRole[];
};

export type Viewport = "desktop" | "tablet" | "mobile";

export type SavedBlock = {
  _id: string;
  name: string;
  /** Key into the curated icon set, shown in the saved-block list. */
  icon?: string;
  block: unknown;
};

/** What the inspector needs beyond the block itself. */
export type InspectorContext = {
  /** The canvas viewport, so a container edits the grid being previewed. */
  viewport: Viewport;
  /** The active content area of a selected container, if any. */
  selectedCellIndex: number | null;
  onSelectCell: (index: number | null) => void;
  /** Adds a block into one of the selected container's areas. */
  onAddBlockToCell: (cellIndex: number, type: string) => void;
  /**
   * Drops an already-built block into one of those areas — a saved block,
   * which arrives whole rather than as a type to construct.
   */
  onInsertBlockIntoCell: (cellIndex: number, block: PageBlock) => void;
  /** Selects a block inside one of those areas, from the container outline. */
  onSelectCellBlock: (cellIndex: number, blockIndex: number) => void;

  /** Reusable saved blocks, managed from the container's own panel. */
  savedBlocks: SavedBlock[];
  onSaveBlock?: (name: string, icon: string, block: PageBlock) => void;
  onDeleteSavedBlock?: (id: string) => void;
};

function samePath(a: BlockPath, b: BlockPath) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * One position in the outline: a block in a column, addressed by index.
 *
 * A container is a single collapsed node here, so every position is top-level
 * in some column and an index is the whole address.
 */
type BlockSlot = { rowIndex: number; columnIndex: number; index: number };

function sameSlot(a: BlockSlot | null, b: BlockSlot): boolean {
  return (
    a !== null &&
    a.rowIndex === b.rowIndex &&
    a.columnIndex === b.columnIndex &&
    a.index === b.index
  );
}

export function LayoutBuilder({
  layout,
  onChange,
  palette,
  createBlock,
  blockLabel,
  renderPreview,
  renderInspector,
  extraCss = "",
  supportsContainers = false,
  savedBlocks = [],
  onSaveBlock,
  onDeleteSavedBlock,
  topbar,
  exitHref,
  exitLabel,
  canvasHeader,
  canvasFooter,
  canvasClassName,
  canvasStyle,
  canvasContentClassName,
  canvasContentStyle,
  documentSettings,
  boundBackgroundMedia,
  newContainerPadding,
  visibilityRoles,
}: LayoutBuilderProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<"outline" | "blocks">("outline");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  // Which content area of the selected container is active. Kept here, not in
  // the inspector, because the block palette adds into it.
  const [cellIndex, setCellIndex] = useState<number | null>(null);

  const selectedBlock =
    selection?.kind === "block"
      ? getBlockAt(
          layout[selection.rowIndex]?.columns[selection.columnIndex]?.blocks as PageBlock[],
          selection.path
        )
      : null;

  // Recomputed on every layout change, which is what makes a per-view style
  // edit show in the canvas as it is typed.
  //
  // Plus anything the host needs inside the canvas: the page builder adds its
  // Calendar Styles, which come from records rather than from the layout and so
  // cannot be derived here.
  const responsiveCss = [layoutResponsiveCss(layout), extraCss]
    .filter(Boolean)
    .join("\n");

  /* ------------------------------------------------------------- Mutators */

  /** Any change of selection abandons the container cell that was active. */
  function select(next: Selection) {
    setSelection(next);
    setCellIndex(null);
  }

  function patchBlock(patch: Partial<PageBlock>) {
    if (selection?.kind !== "block") return;
    const { rowIndex, columnIndex, path } = selection;
    onChange(
      updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) =>
        updateBlockAt(blocks, path, patch)
      )
    );
  }

  function addBlock(type: string) {
    insertBlock(createBlock(type));
  }

  /**
   * Places a block by the current selection: into the active container area if
   * there is one, else beside the selected block, else at the end of a column.
   *
   * Takes a finished block rather than a type so a saved block — which arrives
   * whole from the library — lands by exactly the same rules as a new one.
   */
  function insertBlock(block: PageBlock) {
    // A selected content area wins: that is what the user is pointing at.
    if (selection?.kind === "block" && cellIndex !== null && selectedBlock?.container) {
      const cell = selectedBlock.container.cells[cellIndex];
      if (cell) {
        insertBlockIntoCell(
          selection.rowIndex,
          selection.columnIndex,
          selection.path,
          cellIndex,
          block
        );
        return;
      }
    }

    // Insert into the selected container cell if one is active, otherwise at
    // the end of the selected column, otherwise into the first column.
    if (selection?.kind === "block") {
      const { rowIndex, columnIndex, path } = selection;
      const siblings = getBlocksAtParent(
        layout[rowIndex].columns[columnIndex].blocks as PageBlock[],
        path
      );
      const insertAt = [...path.slice(0, -1), (siblings?.length ?? 0)];
      onChange(
        updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) =>
          insertBlockAt(blocks, insertAt, block)
        )
      );
      return;
    }

    const rowIndex = selection?.kind === "column" || selection?.kind === "row" ? selection.rowIndex : 0;
    const columnIndex = selection?.kind === "column" ? selection.columnIndex : 0;
    if (!layout[rowIndex]?.columns[columnIndex]) return;

    onChange(
      updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) => [...blocks, block])
    );
  }

  /** Appends a ready-made block to the end of one container area. */
  function insertBlockIntoCell(
    rowIndex: number,
    columnIndex: number,
    containerPath: BlockPath,
    cellIndex: number,
    block: PageBlock
  ) {
    const container = getBlockAt(
      layout[rowIndex].columns[columnIndex].blocks as PageBlock[],
      containerPath
    );
    const cells = container?.container
      ? ensureContainerLayout(container.container).cells
      : [];
    const cellBlocks = cells[cellIndex]?.blocks ?? [];
    const path = [...containerPath, cellIndex, cellBlocks.length];

    onChange(
      updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) =>
        insertBlockAt(blocks, path, block)
      )
    );
  }

  function addBlockToCell(
    rowIndex: number,
    columnIndex: number,
    containerPath: BlockPath,
    cellIndex: number,
    type: string
  ) {
    insertBlockIntoCell(rowIndex, columnIndex, containerPath, cellIndex, createBlock(type));
  }

  function moveSelectedBlock(direction: -1 | 1) {
    if (selection?.kind !== "block") return;
    const { rowIndex, columnIndex, path } = selection;
    onChange(
      updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) =>
        moveBlockAt(blocks, path, direction)
      )
    );
    const nextIndex = path[path.length - 1] + direction;
    setSelection({ ...selection, path: [...path.slice(0, -1), nextIndex] });
  }

  function deleteSelectedBlock() {
    if (selection?.kind !== "block") return;
    const { rowIndex, columnIndex, path } = selection;
    onChange(
      updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) => removeBlockAt(blocks, path))
    );
    setSelection(null);
  }

  function duplicateSelectedBlock() {
    if (selection?.kind !== "block" || !selectedBlock) return;
    const { rowIndex, columnIndex, path } = selection;
    const copy = cloneWithNewIds(selectedBlock);
    onChange(
      updateColumnBlocks(layout, rowIndex, columnIndex, (blocks) =>
        insertBlockAt(blocks, [...path.slice(0, -1), path[path.length - 1] + 1], copy)
      )
    );
  }

  function renderCanvasBlock(
    block: PageBlock,
    rowIndex: number,
    columnIndex: number,
    path: BlockPath,
    parentContainer?: ContainerLayout
  ) {
    const isSelected =
      selection?.kind === "block" &&
      selection.rowIndex === rowIndex &&
      selection.columnIndex === columnIndex &&
      samePath(selection.path, path);

    // Full-width blocks, then placement, then a container's size setting — the
    // same order `BlockWrapper` applies them, so the canvas shows the published
    // width rather than a shrink-wrapped one.
    const style: CSSProperties = {};
    if (blockFillsWidth(block)) style.alignSelf = "stretch";
    else if (block.align === "center") style.alignSelf = "center";
    else if (block.align === "right") style.alignSelf = "flex-end";
    if (block.type === "container" && block.container) {
      Object.assign(style, containerOuterStyle(ensureContainerLayout(block.container)));
    }

    return (
      <div
        key={block.id}
        className={`pb-block pb-editable${isSelected ? " is-selected" : ""}`}
        data-block-type={block.type}
        style={style}
        onClick={(event) => {
          event.stopPropagation();
          select({ kind: "block", rowIndex, columnIndex, path });
        }}
      >
        {block.type === "container" && block.container ? (
          (() => {
            const container = ensureContainerLayout(block.container);
            const bound = boundBackgroundMedia?.(container);

            return (
              <>
                {/* The same generated sheet the public renderer uses, so the
                    canvas cannot lay the grid out differently. */}
                <style
                  dangerouslySetInnerHTML={{ __html: containerCss(block.id, container) }}
                />
                <ContainerShell
                  settings={container.settings}
                  style={containerShellStyle(container)}
                  innerStyle={containerShellInnerStyle(container)}
                  bound={bound}
                >
                  <div
                    className="pb-container"
                    data-container={block.id}
                    style={containerStyle(container)}
                  >
                    {container.cells.map((cell, index) => (
                      <CellShell
                        key={cell.id}
                        cell={cell}
                        bound={bound}
                        className={`pb-editable${
                          isSelected && cellIndex === index ? " is-selected" : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          select({ kind: "block", rowIndex, columnIndex, path });
                          setCellIndex(index);
                        }}
                      >
                        {(cell.blocks as PageBlock[]).length === 0 ? (
                          <div className="pb-empty-drop">Area {index + 1}</div>
                        ) : null}
                        {(cell.blocks as PageBlock[]).map((child, childIndex) =>
                          renderCanvasBlock(
                            child,
                            rowIndex,
                            columnIndex,
                            [...path, index, childIndex],
                            container
                          )
                        )}
                      </CellShell>
                    ))}
                  </div>
                </ContainerShell>
              </>
            );
          })()
        ) : (
          renderPreview(block, parentContainer)
        )}
      </div>
    );
  }

  return (
    <div className="builder">
      <div className="builder-topbar">
        <Link href={exitHref} className="btn btn-sm" title={`Back to ${exitLabel}`}>
          ← {exitLabel}
        </Link>
        {topbar}
        <div className="spacer" />
        <div className="builder-tabs" style={{ marginBottom: 0, width: "auto" }}>
          {(["desktop", "tablet", "mobile"] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`builder-tab${viewport === size ? " is-active" : ""}`}
              onClick={() => setViewport(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-body">
        {/* ------------------------------------------------------- Outline */}
        <aside className="builder-outline">
          <div className="builder-tabs">
            <button
              type="button"
              className={`builder-tab${tab === "outline" ? " is-active" : ""}`}
              onClick={() => setTab("outline")}
            >
              Outline
            </button>
            <button
              type="button"
              className={`builder-tab${tab === "blocks" ? " is-active" : ""}`}
              onClick={() => setTab("blocks")}
            >
              Blocks
            </button>
          </div>

          {tab === "blocks" ? (
            <>
              <div className="block-palette">
                {palette.map((item, index) => (
                  <Fragment key={item.type}>
                    {item.group && item.group !== palette[index - 1]?.group ? (
                      <div className="block-palette-group">{item.group}</div>
                    ) : null}
                    <button
                      type="button"
                      title={item.label}
                      onClick={() => addBlock(item.type)}
                    >
                      <IconView name={item.icon} width="1.25rem" height="1.25rem" />
                      {item.label}
                    </button>
                  </Fragment>
                ))}
              </div>

              {supportsContainers && savedBlocks.length > 0 ? (
                <div className="inspector-section">
                  <h4 className="inspector-title">Saved blocks</h4>
                  {savedBlocks.map((saved) => (
                    <div key={saved._id} style={{ display: "flex", gap: "0.25rem", marginBottom: "0.25rem" }}>
                      <button
                        type="button"
                        className="btn btn-sm saved-block-button"
                        style={{ flex: 1 }}
                        onClick={() =>
                          insertBlock(cloneWithNewIds(saved.block as PageBlock, "saved"))
                        }
                      >
                        <IconView name={saved.icon} width="1rem" height="1rem" />
                        {saved.name}
                      </button>
                      {onDeleteSavedBlock ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onDeleteSavedBlock(saved._id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <OutlineTree
              layout={layout}
              onChange={onChange}
              selection={selection}
              select={select}
              clearSelection={() => setSelection(null)}
              blockLabel={blockLabel}
              newContainerPadding={newContainerPadding}
            />
          )}
        </aside>

        {/* -------------------------------------------------------- Canvas */}
        <div className="builder-workspace" onClick={() => setSelection(null)}>
          <div
            className={`builder-canvas${canvasClassName ? ` ${canvasClassName}` : ""}`}
            data-viewport={viewport}
            style={canvasStyle}
          >
            {/* Site chrome is shown for context only — it is not editable here. */}
            {canvasHeader ? (
              <div className="builder-canvas-chrome site-shell">{canvasHeader}</div>
            ) : null}

            {/* Wraps the rows so a document-level container — a form's own box
                and width — shows in the canvas as it will on the page. Left
                unstyled by builders that have no such thing. */}
            <div
              className={`builder-canvas-content${
                canvasContentClassName ? ` ${canvasContentClassName}` : ""
              }`}
              style={canvasContentStyle}
            >
              {/* The same sheet the published page emits, so a per-view style
                  edited here is previewed by the rule that will render it.
                  Inside the canvas, where its viewport-keyed half applies. */}
              {responsiveCss ? (
                <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
              ) : null}

              {layout.length === 0 ? (
                <div className="pb-empty-drop">Add a row to start building.</div>
              ) : null}

              {layout.map((row, rowIndex) => (
                <RowShell
                  key={row.id}
                  row={row}
                  className={`pb-editable${
                    selection?.kind === "row" && selection.rowIndex === rowIndex ? " is-selected" : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    select({ kind: "row", rowIndex });
                  }}
                >
                  {row.columns.map((column, columnIndex) => (
                    <ColumnShell
                      key={column.id}
                      column={column}
                      className={`pb-editable${
                        selection?.kind === "column" &&
                        selection.rowIndex === rowIndex &&
                        selection.columnIndex === columnIndex
                          ? " is-selected"
                          : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        select({ kind: "column", rowIndex, columnIndex });
                      }}
                    >
                      {column.blocks.length === 0 ? (
                        <div className="pb-empty-drop">Empty column</div>
                      ) : null}
                      {(column.blocks as PageBlock[]).map((block, blockIndex) =>
                        renderCanvasBlock(block, rowIndex, columnIndex, [blockIndex])
                      )}
                    </ColumnShell>
                  ))}
                </RowShell>
              ))}
            </div>

            {canvasFooter ? (
              <div className="builder-canvas-chrome site-shell">{canvasFooter}</div>
            ) : null}
          </div>
        </div>

        {/* ----------------------------------------------------- Inspector */}
        <aside className="builder-inspector">
          {!selection ? (
            <>
              {documentSettings}
              <p className="admin-subtitle">
                Select a row, column or block to edit it.
              </p>
            </>
          ) : null}

          {selection?.kind === "row" && layout[selection.rowIndex] ? (
            <RowSettingsFields
              row={layout[selection.rowIndex]}
              onChange={(patch) =>
                onChange(
                  updateRow(layout, selection.rowIndex, {
                    ...layout[selection.rowIndex],
                    settings: { ...layout[selection.rowIndex].settings, ...patch },
                  })
                )
              }
              visibilityRoles={visibilityRoles}
            />
          ) : null}

          {selection?.kind === "column" &&
          layout[selection.rowIndex]?.columns[selection.columnIndex] ? (
            <ColumnSettingsFields
              column={layout[selection.rowIndex].columns[selection.columnIndex]}
              onChange={(patch) =>
                onChange(
                  updateColumn(layout, selection.rowIndex, selection.columnIndex, {
                    ...layout[selection.rowIndex].columns[selection.columnIndex],
                    settings: {
                      ...layout[selection.rowIndex].columns[selection.columnIndex].settings,
                      ...patch,
                    },
                  })
                )
              }
              visibilityRoles={visibilityRoles}
              onSpanChange={(span) =>
                onChange(
                  updateColumn(layout, selection.rowIndex, selection.columnIndex, { span })
                )
              }
            />
          ) : null}

          {selectedBlock ? (
            <>
              <div className="inspector-section">
                <h4 className="inspector-title">{blockLabel(selectedBlock)}</h4>
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-sm" onClick={() => moveSelectedBlock(-1)}>
                    Move up
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => moveSelectedBlock(1)}>
                    Move down
                  </button>
                  <button type="button" className="btn btn-sm" onClick={duplicateSelectedBlock}>
                    Duplicate
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={deleteSelectedBlock}>
                    Delete
                  </button>
                </div>
              </div>

              {renderInspector(selectedBlock, patchBlock, {
                viewport,
                selectedCellIndex: cellIndex,
                onSelectCell: setCellIndex,
                onAddBlockToCell: (cell, type) => {
                  if (selection?.kind !== "block") return;
                  addBlockToCell(
                    selection.rowIndex,
                    selection.columnIndex,
                    selection.path,
                    cell,
                    type
                  );
                },
                onInsertBlockIntoCell: (cell, block) => {
                  if (selection?.kind !== "block") return;
                  insertBlockIntoCell(
                    selection.rowIndex,
                    selection.columnIndex,
                    selection.path,
                    cell,
                    block
                  );
                },
                onSelectCellBlock: (cell, blockIndex) => {
                  if (selection?.kind !== "block") return;
                  // Descends into the container rather than replacing the
                  // selection, so the area stays the one being edited.
                  setSelection({ ...selection, path: [...selection.path, cell, blockIndex] });
                  setCellIndex(null);
                },
                savedBlocks,
                onSaveBlock,
                onDeleteSavedBlock,
              })}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}


/**
 * The page outline: rows, their columns, and the blocks in each.
 *
 * A separate component so that dragging keeps its state here rather than in the
 * builder — otherwise every `dragover` re-renders the canvas preview underneath
 * the pointer, which is enough to kill a native drag mid-flight.
 */
/**
 * Says a row or column is not for everybody.
 *
 * The canvas draws restricted parts like any other — an author has to be able
 * to see and edit what they are hiding — so the outline is where it is said,
 * and it has to be said somewhere or a page would look wrong to its author for
 * reasons only the visitor's account explains.
 */
function RestrictedMark({
  settings,
}: {
  settings: { visibility?: { mode: string; roleIds: string[] } };
}) {
  const mode = settings.visibility?.mode ?? "public";
  if (mode === "public") return null;

  const label =
    mode === "signedIn"
      ? "Signed-in visitors only"
      : `Restricted to ${settings.visibility?.roleIds.length ?? 0} role${
          settings.visibility?.roleIds.length === 1 ? "" : "s"
        }`;

  return (
    <span className="outline-restricted" title={label}>
      <EyeOff size={12} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function OutlineTree({
  layout,
  onChange,
  selection,
  select,
  clearSelection,
  blockLabel,
  newContainerPadding,
}: {
  layout: PageRow[];
  onChange: (layout: PageRow[]) => void;
  selection: Selection;
  select: (next: Selection) => void;
  clearSelection: () => void;
  blockLabel: (block: PageBlock) => string;
  /** What a row or column added here starts with on every side, in rem. */
  newContainerPadding?: number;
}) {
  const [drag, setDrag] = useState<BlockSlot | null>(null);
  const [over, setOver] = useState<BlockSlot | null>(null);

  /**
   * Dragging runs on pointer events rather than HTML5 drag and drop.
   *
   * The native API needs a drag source the browser is willing to lift, a
   * `dataTransfer` payload, and a drop target that cancels `dragover` — and it
   * declines quietly when any of that is not to its liking, with no way to tell
   * from the page why. Pointer events have none of those conditions: press,
   * move, release, and the same handler runs on mouse, pen and touch.
   */

  /** Which slot the pointer is over, from the `data-slot` on each target. */
  function slotFromPoint(x: number, y: number): BlockSlot | null {
    const el = document.elementFromPoint(x, y);
    const holder = el?.closest("[data-slot]");
    const value = holder?.getAttribute("data-slot");
    if (!value) return null;

    const [rowIndex, columnIndex, index] = value.split(":").map(Number);
    if ([rowIndex, columnIndex, index].some((part) => !Number.isFinite(part))) return null;
    return { rowIndex, columnIndex, index };
  }

  /**
   * Goes on the grip. Pointer capture routes every later move and the release
   * back here, so the drag survives the pointer leaving the handle — which it
   * does immediately, since the handle is a few millimetres tall.
   */
  function gripProps(slot: BlockSlot) {
    return {
      onPointerDown: (event: React.PointerEvent) => {
        // Stops the press turning into a text selection or a native drag.
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag(slot);
        setOver(null);
      },
      onPointerMove: (event: React.PointerEvent) => {
        if (!drag) return;
        const target = slotFromPoint(event.clientX, event.clientY);
        if (target && !sameSlot(over, target)) setOver(target);
      },
      onPointerUp: (event: React.PointerEvent) => {
        // The release point wins; `over` covers a release between two targets.
        const target = slotFromPoint(event.clientX, event.clientY) ?? over;

        if (drag && target && !sameSlot(drag, target)) {
          onChange(
            moveBlock(
              layout,
              { rowIndex: drag.rowIndex, columnIndex: drag.columnIndex, path: [drag.index] },
              {
                rowIndex: target.rowIndex,
                columnIndex: target.columnIndex,
                path: [target.index],
              }
            )
          );
          // Indices shift when a block moves, so the old selection no longer
          // means what it did.
          clearSelection();
        }

        setDrag(null);
        setOver(null);
      },
      onPointerCancel: () => {
        setDrag(null);
        setOver(null);
      },
    };
  }

  function renderBlockNode(
    block: PageBlock,
    rowIndex: number,
    columnIndex: number,
    blockIndex: number
  ) {
    const path = [blockIndex];
    const isSelected =
      selection?.kind === "block" &&
      selection.rowIndex === rowIndex &&
      selection.columnIndex === columnIndex &&
      samePath(selection.path, path);

    const slot: BlockSlot = { rowIndex, columnIndex, index: blockIndex };

    return (
      // A container stays a single node here. Its areas and the blocks in them
      // are the container inspector's business, which is also the only place a
      // block crosses from one area to another.
      <div
        key={block.id}
        className={`outline-drag is-row${sameSlot(drag, slot) ? " is-dragging" : ""}${
          sameSlot(over, slot) ? " is-drop-before" : ""
        }`}
        data-slot={`${rowIndex}:${columnIndex}:${blockIndex}`}
      >
        {/* The grip is the handle: the label beside it is a button, and a press
            on a button is a button press, not the start of a drag. */}
        <span className="outline-grip" aria-hidden="true" {...gripProps(slot)} />
        <button
          type="button"
          className={`outline-node${isSelected ? " is-selected" : ""}`}
          onClick={() => select({ kind: "block", rowIndex, columnIndex, path })}
        >
          {blockLabel(block)}
        </button>
      </div>
    );
  }

  return (
    <div>
      {layout.map((row, rowIndex) => (
                <div key={row.id} style={{ marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button
                      type="button"
                      className={`outline-node${
                        selection?.kind === "row" && selection.rowIndex === rowIndex
                          ? " is-selected"
                          : ""
                      }`}
                      onClick={() => select({ kind: "row", rowIndex })}
                    >
                      Row {rowIndex + 1}
                      <RestrictedMark settings={row.settings} />
                    </button>
                    <div className="outline-row-actions">
                      <button type="button" onClick={() => onChange(moveRow(layout, rowIndex, -1))}>
                        ↑
                      </button>
                      <button type="button" onClick={() => onChange(moveRow(layout, rowIndex, 1))}>
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(removeRow(layout, rowIndex));
                          clearSelection();
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="outline-children">
                    {row.columns.map((column, columnIndex) => (
                      <div key={column.id}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <button
                            type="button"
                            className={`outline-node${
                              selection?.kind === "column" &&
                              selection.rowIndex === rowIndex &&
                              selection.columnIndex === columnIndex
                                ? " is-selected"
                                : ""
                            }`}
                            onClick={() =>
                              select({ kind: "column", rowIndex, columnIndex })
                            }
                          >
                            Column {columnIndex + 1} ({column.span}/12)
                            <RestrictedMark settings={column.settings} />
                          </button>
                          <div className="outline-row-actions">
                            <button
                              type="button"
                              onClick={() =>
                                onChange(
                                  updateRow(layout, rowIndex, {
                                    ...row,
                                    // Remaining columns re-divide the row evenly.
                                    columns: rebalanceColumns(
                                      row.columns.filter((_, index) => index !== columnIndex)
                                    ),
                                  })
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        <div className="outline-children">
                          {(column.blocks as PageBlock[]).map((block, blockIndex) =>
                            renderBlockNode(block, rowIndex, columnIndex, blockIndex)
                          )}

                          {/* Appends, and the only way into an empty column. */}
                          {drag
                            ? (() => {
                                const end: BlockSlot = {
                                  rowIndex,
                                  columnIndex,
                                  index: (column.blocks as PageBlock[]).length,
                                };
                                return (
                                  <div
                                    className={`outline-drop-zone${
                                      sameSlot(over, end) ? " is-active" : ""
                                    }`}
                                    data-slot={`${rowIndex}:${columnIndex}:${end.index}`}
                                  >
                                    {end.index === 0
                                      ? "Move to this column"
                                      : "Move to the end"}
                                  </div>
                                );
                              })()
                            : null}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ marginTop: "0.25rem" }}
                      onClick={() =>
                        onChange(
                          updateRow(layout, rowIndex, {
                            ...row,
                            columns: rebalanceColumns([
                              ...row.columns,
                              createColumn(undefined, newContainerPadding),
                            ]),
                          })
                        )
                      }
                    >
                      Add column
                    </button>
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.5rem" }}>
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      onChange([...layout, createRow(count, newContainerPadding)])
                    }
                  >
                    + {count} col
                  </button>
                ))}
              </div>
    </div>
  );
}
