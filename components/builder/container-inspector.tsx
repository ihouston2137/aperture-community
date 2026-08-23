"use client";

import { useState, type ReactNode } from "react";

import { IconField } from "@/components/icon-picker";
import { IconView } from "@/components/icons";
import {
  CONTAINER_BREAKPOINTS,
  CONTAINER_BREAKPOINT_LABELS,
  CONTAINER_SIZINGS,
  CONTAINER_COLLECTION_SOURCES,
  CONTAINER_STORY_SOURCES,
  cellHasOverride,
  cellSettings,
  createContainerCell,
  normalizeContainerLayout,
  withCellOverride,
  withCellPlacement,
  withCellSettings,
  withContainerSettings,
  withGrid,
  withMovedCellBlock,
  withoutCellBlock,
  type ContainerBreakpoint,
  type ContainerLayout,
} from "@/lib/page-container-layout";
import type { ColumnSettings, ContainerSettings, PageBlock } from "@/lib/page-layout";
import {
  STORY_TEMPLATE_BLOCK_TYPES,
  type StoryTemplateBlockType,
} from "@/lib/story-template-layout";

import {
  COLLECTION_SLOT_BLOCK_TYPES,
} from "@/lib/collection-slot-layout";
import { cloneWithNewIds } from "@/lib/layout-edit";

import type { SavedBlock } from "./layout-builder";
import {
  BackgroundFields,
  BorderFields,
  CheckField,
  NumField,
  RemField,
  SelectField,
  SpacingFields,
} from "./settings-fields";

/**
 * Settings for a container block.
 *
 * The panel is organised the way the container is used: pick an area from the
 * map that is always on screen, then open the group that acts on it. Every
 * group starts closed, because a container carries five groups' worth of
 * settings and showing them all at once is what made this unusable.
 *
 * The grid is edited one breakpoint at a time, following the canvas's own
 * viewport switch so the map always describes what is on screen. Selecting a
 * cell in the map is what the block palette adds into, which is why the
 * selection lives in the builder rather than here.
 */

const SIZING_LABELS: Record<(typeof CONTAINER_SIZINGS)[number], string> = {
  fill: "Fill the available space",
  fit: "Fit to its content",
};

const STORY_SOURCE_LABELS: Record<(typeof CONTAINER_STORY_SOURCES)[number], string> = {
  none: "No story",
  latest: "Latest published story",
  specific: "A specific story",
};

const COLLECTION_SOURCE_LABELS: Record<
  (typeof CONTAINER_COLLECTION_SOURCES)[number],
  string
> = {
  none: "No collection",
  latest: "Latest public collection",
  specific: "A specific collection",
};

const COLLECTION_BLOCK_LABELS: Record<string, string> = {
  collectionName: "Name",
  collectionCategory: "Category",
  collectionDescription: "Description",
  collectionFeatureMedia: "Feature image",
  collectionGallery: "Gallery",
  collectionLink: "Link to the collection",
};

const STORY_BLOCK_LABELS: Record<string, string> = {
  storyHeadline: "Headline",
  storySubHeadline: "Sub headline",
  storyDate: "Date",
  storyCategory: "Category",
  storyLocation: "Location",
  storyAuthor: "Author",
  storyMeta: "Meta line",
  storyFeatureMedia: "Feature media",
  storyContent: "Story content",
  storyLink: "Link to the story",
};

/** A section that can be folded away; `details` needs no state to do it. */
function Collapsible({
  title,
  level = "top",
  defaultOpen = false,
  children,
}: {
  title: string;
  /** `sub` groups nest one level in, e.g. Background inside Container. */
  level?: "top" | "sub";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`inspector-fold is-${level}`} open={defaultOpen}>
      <summary>{title}</summary>
      <div className="inspector-fold-body">{children}</div>
    </details>
  );
}

/** Stands in for area settings while nothing is selected. */
function SelectFirst() {
  return (
    <p className="help-text" style={{ marginTop: 0 }}>
      Select an area in the map above to edit it.
    </p>
  );
}

export function ContainerInspector({
  block,
  layout,
  breakpoint,
  onChange,
  selectedCellIndex,
  onSelectCell,
  onAddBlockToCell,
  onInsertBlockIntoCell,
  onSelectCellBlock,
  blockLabel,
  stories,
  collections,
  savedBlocks,
  onSaveBlock,
  onDeleteSavedBlock,
}: {
  /** The container block itself, needed to save it as a reusable block. */
  block: PageBlock;
  layout: ContainerLayout;
  breakpoint: ContainerBreakpoint;
  onChange: (layout: ContainerLayout) => void;
  selectedCellIndex: number | null;
  onSelectCell: (index: number | null) => void;
  /** Adds a block into the selected content area. */
  onAddBlockToCell: (cellIndex: number, type: string) => void;
  /** Drops a whole saved block into the selected content area. */
  onInsertBlockIntoCell: (cellIndex: number, block: PageBlock) => void;
  onSelectCellBlock: (cellIndex: number, blockIndex: number) => void;
  blockLabel: (block: PageBlock) => string;
  stories: { _id: string; label: string }[];
  collections: { _id: string; label: string }[];
  savedBlocks: SavedBlock[];
  onSaveBlock?: (name: string, icon: string, block: PageBlock) => void;
  onDeleteSavedBlock?: (id: string) => void;
}) {
  const grid = layout.grids[breakpoint];
  const cell = selectedCellIndex === null ? null : layout.cells[selectedCellIndex];
  const placement = cell?.placement[breakpoint];
  const breakpointLabel = CONTAINER_BREAKPOINT_LABELS[breakpoint];
  const storyBound = layout.storySource !== "none";
  const collectionBound = layout.collectionSource !== "none";

  // Every area setting reads and writes the view currently on the canvas.
  const areaSettings = cell ? cellSettings(cell, breakpoint) : null;
  const hasOverride = cell ? cellHasOverride(cell, breakpoint) : false;

  const patchCell = (patch: Partial<ColumnSettings>) => {
    if (selectedCellIndex === null) return;
    onChange(withCellSettings(layout, selectedCellIndex, breakpoint, patch));
  };

  const patchContainer = (patch: Partial<ContainerSettings>) => {
    onChange(withContainerSettings(layout, patch));
  };

  const areaLabel = selectedCellIndex === null ? "Area" : `Area ${selectedCellIndex + 1}`;

  return (
    <>
      {/* Always on screen: every group below acts on whatever is selected here. */}
      <div className="inspector-section">
        <h4 className="inspector-title">Content areas · {breakpointLabel}</h4>

        {/* A map of the grid at this breakpoint. Areas sit where they will
            render, so overlaps and gaps are visible while editing. */}
        <div
          className="cell-map"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(1.75rem, auto))`,
          }}
          onClick={() => onSelectCell(null)}
        >
          {layout.cells.map((item, index) => {
            const place = item.placement[breakpoint];
            return (
              <button
                key={item.id}
                type="button"
                className={`cell-map-cell${index === selectedCellIndex ? " is-selected" : ""}`}
                style={{
                  gridColumn: `${place.colStart} / span ${place.colSpan}`,
                  gridRow: `${place.rowStart} / span ${place.rowSpan}`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectCell(index === selectedCellIndex ? null : index);
                }}
              >
                <span>{index + 1}</span>
                <small>{(item.blocks as unknown[]).length}</small>
              </button>
            );
          })}
        </div>

        <p className="help-text">
          {selectedCellIndex === null
            ? "Select an area to place it, style it, and add blocks to it."
            : "Blocks you add from the Blocks tab go into the selected area."}
        </p>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const next = normalizeContainerLayout({
              ...layout,
              cells: [...layout.cells, createContainerCell(layout.cells.length, grid.columns)],
            });
            onChange(next);
            onSelectCell(next.cells.length - 1);
          }}
        >
          Add area
        </button>
      </div>

      {/* ------------------------------------------------------------ Config */}
      <Collapsible title="Config">
        <Collapsible title="Container" level="sub">
          <Collapsible title={`Layout · ${breakpointLabel}`} level="sub">
            <p className="help-text" style={{ marginTop: 0 }}>
              Switch the viewport in the toolbar to lay out the other breakpoints.
            </p>
            <div className="inspector-grid">
              <NumField
                label="Columns"
                value={grid.columns}
                min={1}
                max={12}
                onChange={(value) => onChange(withGrid(layout, breakpoint, { columns: value }))}
              />
              <NumField
                label="Rows"
                value={grid.rows}
                min={1}
                max={12}
                onChange={(value) => onChange(withGrid(layout, breakpoint, { rows: value }))}
              />
              <RemField
                label="Gap"
                value={grid.gap}
                onChange={(value) => onChange(withGrid(layout, breakpoint, { gap: value }))}
              />
              <RemField
                label="Min row height"
                value={grid.rowMinHeight}
                onChange={(value) =>
                  onChange(withGrid(layout, breakpoint, { rowMinHeight: value }))
                }
              />
            </div>
          </Collapsible>

          <Collapsible title="Size" level="sub">
            <SelectField
              label="Width"
              value={layout.sizing}
              options={CONTAINER_SIZINGS.map((value) => ({
                value,
                label: SIZING_LABELS[value],
              }))}
              onChange={(value) =>
                onChange({ ...layout, sizing: value as ContainerLayout["sizing"] })
              }
            />
            <p className="help-text" style={{ marginTop: 0 }}>
              Applies to the container itself, not to its areas.
            </p>
          </Collapsible>

          <Collapsible title="Story content" level="sub">
            <SelectField
              label="Bound story"
              value={layout.storySource}
              options={CONTAINER_STORY_SOURCES.map((value) => ({
                value,
                label: STORY_SOURCE_LABELS[value],
              }))}
              onChange={(value) =>
                onChange(
                  normalizeContainerLayout({
                    ...layout,
                    storySource: value,
                    // Keep the chosen story when staying on "specific".
                    storyId: value === "specific" ? layout.storyId : "",
                  })
                )
              }
            />

            {layout.storySource === "specific" ? (
              <SelectField
                label="Story"
                value={layout.storyId}
                options={[
                  { value: "", label: "Select a story…" },
                  ...stories.map((story) => ({ value: story._id, label: story.label })),
                ]}
                onChange={(value) => onChange({ ...layout, storyId: value })}
              />
            ) : null}

            {storyBound ? (
              <p className="help-text" style={{ marginTop: 0 }}>
                Story blocks are added from the Content group below.
              </p>
            ) : (
              <p className="help-text" style={{ marginTop: 0 }}>
                Bind a story to place its headline, media and content inside this
                container, the same blocks a story template uses.
              </p>
            )}
          </Collapsible>

          <Collapsible title="Collection content" level="sub">
            <SelectField
              label="Bound collection"
              value={layout.collectionSource}
              options={CONTAINER_COLLECTION_SOURCES.map((value) => ({
                value,
                label: COLLECTION_SOURCE_LABELS[value],
              }))}
              onChange={(value) =>
                onChange(
                  normalizeContainerLayout({
                    ...layout,
                    collectionSource: value,
                    collectionId: value === "specific" ? layout.collectionId : "",
                  })
                )
              }
            />

            {layout.collectionSource === "specific" ? (
              <SelectField
                label="Collection"
                value={layout.collectionId}
                options={[
                  { value: "", label: "Select a collection…" },
                  ...collections.map((item) => ({
                    value: item._id,
                    label: item.label,
                  })),
                ]}
                onChange={(value) => onChange({ ...layout, collectionId: value })}
              />
            ) : null}

            {collectionBound ? (
              <p className="help-text" style={{ marginTop: 0 }}>
                Collection blocks are added from the Content group below.
              </p>
            ) : (
              <p className="help-text" style={{ marginTop: 0 }}>
                Bind a collection to place its name, feature image and gallery
                inside this container.
              </p>
            )}
          </Collapsible>

          <Collapsible title="Background" level="sub">
            <BackgroundFields
              settings={layout.settings}
              onChange={patchContainer}
              allowStoryFeature={storyBound}
              allowCollectionFeature={collectionBound}
            />
          </Collapsible>

          <Collapsible title="Border" level="sub">
            <BorderFields settings={layout.settings} onChange={patchContainer} />
          </Collapsible>

          <Collapsible title="Spacing" level="sub">
            <SpacingFields settings={layout.settings} onChange={patchContainer} />
          </Collapsible>
        </Collapsible>

        <Collapsible title={`${areaLabel} · ${breakpointLabel}`} level="sub">
          {cell && placement && areaSettings && selectedCellIndex !== null ? (
            <>
              {/* Every group below edits this view. Desktop is the base the
                  other two follow until one is given settings of its own. */}
              {breakpoint === "desktop" ? (
                <p className="help-text" style={{ margin: "0 0 0.5rem" }}>
                  These are the area&rsquo;s base settings. Tablet and mobile follow
                  them unless given their own.
                </p>
              ) : (
                <div className="inspector-section">
                  <CheckField
                    label={`Give ${breakpointLabel.toLowerCase()} its own settings`}
                    value={hasOverride}
                    onChange={(value) =>
                      onChange(
                        withCellOverride(layout, selectedCellIndex, breakpoint, value)
                      )
                    }
                  />
                  <p className="help-text" style={{ marginTop: 0 }}>
                    {hasOverride
                      ? "Only this view uses the settings below."
                      : "Following the desktop settings — editing anything below will change every view."}
                  </p>
                </div>
              )}

              <Collapsible title="Layout" level="sub">
                <div className="inspector-grid">
                  <NumField
                    label="Column"
                    value={placement.colStart}
                    min={1}
                    max={grid.columns}
                    onChange={(value) =>
                      onChange(
                        withCellPlacement(layout, selectedCellIndex, breakpoint, {
                          colStart: value,
                        })
                      )
                    }
                  />
                  <NumField
                    label="Column span"
                    value={placement.colSpan}
                    min={1}
                    max={grid.columns - placement.colStart + 1}
                    onChange={(value) =>
                      onChange(
                        withCellPlacement(layout, selectedCellIndex, breakpoint, {
                          colSpan: value,
                        })
                      )
                    }
                  />
                  <NumField
                    label="Row"
                    value={placement.rowStart}
                    min={1}
                    max={grid.rows}
                    onChange={(value) =>
                      onChange(
                        withCellPlacement(layout, selectedCellIndex, breakpoint, {
                          rowStart: value,
                        })
                      )
                    }
                  />
                  <NumField
                    label="Row span"
                    value={placement.rowSpan}
                    min={1}
                    max={12}
                    onChange={(value) =>
                      onChange(
                        withCellPlacement(layout, selectedCellIndex, breakpoint, {
                          rowSpan: value,
                        })
                      )
                    }
                  />
                </div>

                {/* The same alignment a column has, applied to the area. */}
                <div className="inspector-grid">
                  <SelectField
                    label="Alignment"
                    value={areaSettings.align}
                    options={[
                      { value: "left", label: "Left" },
                      { value: "center", label: "Center" },
                      { value: "right", label: "Right" },
                    ]}
                    onChange={(value) => patchCell({ align: value })}
                  />
                  <SelectField
                    label="Vertical"
                    value={areaSettings.verticalAlign}
                    options={[
                      { value: "top", label: "Top" },
                      { value: "center", label: "Center" },
                      { value: "bottom", label: "Bottom" },
                    ]}
                    onChange={(value) => patchCell({ verticalAlign: value })}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() => {
                    onChange(
                      normalizeContainerLayout({
                        ...layout,
                        cells: layout.cells.filter((_, index) => index !== selectedCellIndex),
                      })
                    );
                    onSelectCell(null);
                  }}
                >
                  Remove area
                </button>
              </Collapsible>

              <Collapsible title="Background" level="sub">
                <BackgroundFields
                  settings={areaSettings}
                  onChange={patchCell}
                  allowStoryFeature={storyBound}
                  allowCollectionFeature={collectionBound}
                />
              </Collapsible>

              <Collapsible title="Border" level="sub">
                <BorderFields settings={areaSettings} onChange={patchCell} />
              </Collapsible>

              <Collapsible title="Spacing" level="sub">
                <SpacingFields settings={areaSettings} onChange={patchCell} />
              </Collapsible>
            </>
          ) : (
            <SelectFirst />
          )}
        </Collapsible>
      </Collapsible>

      {/* ----------------------------------------------------------- Content */}
      <Collapsible title={`Content — ${areaLabel}`}>
        {selectedCellIndex === null || !cell ? (
          <SelectFirst />
        ) : (
          <>
            {storyBound ? (
              <Collapsible title="Story content" level="sub">
                <div className="field">
                  <label>Add a story block</label>
                  <select
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      onAddBlockToCell(selectedCellIndex, event.target.value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">Add to {areaLabel.toLowerCase()}…</option>
                    {STORY_TEMPLATE_BLOCK_TYPES.map((type: StoryTemplateBlockType) => (
                      <option key={type} value={type}>
                        {STORY_BLOCK_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </Collapsible>
            ) : null}

            {collectionBound ? (
              <Collapsible title="Collection content" level="sub">
                <div className="field">
                  <label>Add a collection block</label>
                  <select
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      onAddBlockToCell(selectedCellIndex, event.target.value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">Add to {areaLabel.toLowerCase()}…</option>
                    {COLLECTION_SLOT_BLOCK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {COLLECTION_BLOCK_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </Collapsible>
            ) : null}

            {/* A saved block is a whole container, so this nests one inside an
                area — the same clone-with-fresh-ids the Blocks tab uses when it
                drops one into a column. */}
            <Collapsible title="Saved blocks" level="sub">
              {savedBlocks.length === 0 ? (
                <p className="help-text" style={{ marginTop: 0 }}>
                  Save a container as a custom block to reuse it here.
                </p>
              ) : (
                <>
                  <p className="help-text" style={{ marginTop: 0 }}>
                    Adds a copy to {areaLabel.toLowerCase()}. Later edits to it
                    stay on this page.
                  </p>
                  {savedBlocks.map((saved) => (
                    <button
                      key={saved._id}
                      type="button"
                      className="btn btn-sm saved-block-button"
                      style={{ width: "100%", marginBottom: "0.25rem" }}
                      onClick={() =>
                        onInsertBlockIntoCell(
                          selectedCellIndex,
                          cloneWithNewIds(saved.block as PageBlock, "saved")
                        )
                      }
                    >
                      <IconView name={saved.icon} width="1rem" height="1rem" />
                      {saved.name}
                    </button>
                  ))}
                </>
              )}
            </Collapsible>
          </>
        )}
      </Collapsible>

      {/* Every area, whatever is selected — the page outline shows a container
          as one collapsed node, so this is the whole picture of its contents
          and the only place a block moves between areas. */}
      <Collapsible title="Container outline" defaultOpen>
        <ContainerOutline
          layout={layout}
          blockLabel={blockLabel}
          onSelect={onSelectCellBlock}
          onRemove={(cellIndex, index) =>
            onChange(withoutCellBlock(layout, cellIndex, index))
          }
          onMove={(from, to) =>
            onChange(withMovedCellBlock(layout, from.cell, from.index, to.cell, to.index))
          }
        />
      </Collapsible>

      {/* ------------------------------------------------- Save custom block */}
      {onSaveBlock ? (
        <Collapsible title="Save custom block">
          <SaveCustomBlock
            block={block}
            savedBlocks={savedBlocks}
            onSave={onSaveBlock}
            onDelete={onDeleteSavedBlock}
          />
        </Collapsible>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------ Container outline */

type CellSlot = { cell: number; index: number };

function sameSlot(a: CellSlot | null, b: CellSlot): boolean {
  return a !== null && a.cell === b.cell && a.index === b.index;
}

/**
 * Every area of the container and the blocks in each, with drag to reorder
 * inside an area or move between them.
 *
 * Shown whatever area is selected, because the page outline lists a container
 * as one collapsed node — this is the only view of what is inside it.
 */
function ContainerOutline({
  layout,
  blockLabel,
  onSelect,
  onRemove,
  onMove,
}: {
  layout: ContainerLayout;
  blockLabel: (block: PageBlock) => string;
  onSelect: (cellIndex: number, blockIndex: number) => void;
  onRemove: (cellIndex: number, blockIndex: number) => void;
  onMove: (from: CellSlot, to: CellSlot) => void;
}) {
  const [drag, setDrag] = useState<CellSlot | null>(null);
  const [over, setOver] = useState<CellSlot | null>(null);

  const finish = () => {
    setDrag(null);
    setOver(null);
  };

  return (
    <div onDragLeave={() => setOver(null)}>
      {layout.cells.map((cell, cellIndex) => {
        const blocks = cell.blocks as PageBlock[];
        // Dropping past the last block appends, so an empty area still has one
        // slot to aim at.
        const endSlot: CellSlot = { cell: cellIndex, index: blocks.length };

        return (
          <div key={cell.id} style={{ marginBottom: "0.5rem" }}>
            <div className="admin-nav-group" style={{ padding: "0.2rem 0.3rem" }}>
              Area {cellIndex + 1}
            </div>

            {blocks.map((block, index) => {
              const slot: CellSlot = { cell: cellIndex, index };
              return (
                <div
                  key={block.id}
                  className={`outline-drag is-row${sameSlot(drag, slot) ? " is-dragging" : ""}${
                    sameSlot(over, slot) ? " is-drop-before" : ""
                  }`}
                  onDragOver={(event) => {
                    if (!drag) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (!sameSlot(over, slot)) setOver(slot);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (drag) onMove(drag, slot);
                    finish();
                  }}
                >
                  {/* The drag source is the grip, not the row: a drag cannot
                      begin from a mousedown on a button, and the label fills
                      the rest of the row. */}
                  <span
                    className="outline-grip"
                    aria-hidden="true"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      // Firefox refuses to start a drag without payload.
                      event.dataTransfer.setData("text/plain", block.id);
                      setDrag(slot);
                    }}
                    onDragEnd={finish}
                  />
                  <button
                    type="button"
                    className="outline-node"
                    onClick={() => onSelect(cellIndex, index)}
                  >
                    {blockLabel(block)}
                  </button>
                  <div className="outline-row-actions">
                    <button
                      type="button"
                      onClick={() => onRemove(cellIndex, index)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}

            {drag ? (
              <div
                className={`outline-drop-zone${sameSlot(over, endSlot) ? " is-active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (!sameSlot(over, endSlot)) setOver(endSlot);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onMove(drag, endSlot);
                  finish();
                }}
              >
                {blocks.length === 0 ? "Move into this area" : "Move to the end"}
              </div>
            ) : blocks.length === 0 ? (
              <p className="help-text" style={{ margin: "0 0 0 0.3rem" }}>
                No blocks yet.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- Save custom block */

function SaveCustomBlock({
  block,
  savedBlocks,
  onSave,
  onDelete,
}: {
  block: PageBlock;
  savedBlocks: SavedBlock[];
  onSave: (name: string, icon: string, block: PageBlock) => void;
  onDelete?: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("LayoutGrid");

  const trimmed = name.trim();
  // Matching by name is what makes the button read "Update": saving under a
  // name already in the library replaces that entry rather than adding a twin.
  const existing = savedBlocks.find(
    (saved) => saved.name.toLowerCase() === trimmed.toLowerCase()
  );

  return (
    <>
      <IconField label="Icon" value={icon} onChange={setIcon} />

      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={name}
          placeholder="e.g. Story hero"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!trimmed}
          onClick={() => {
            onSave(trimmed, icon, block);
            setName("");
          }}
        >
          {existing ? "Update" : "Save"}
        </button>

        {existing && onDelete ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              onDelete(existing._id);
              setName("");
            }}
          >
            Delete
          </button>
        ) : null}
      </div>

      {savedBlocks.length > 0 ? (
        <>
          <p className="help-text">Already saved — pick one to overwrite it.</p>
          <div className="saved-block-chips">
            {savedBlocks.map((saved) => (
              <button
                key={saved._id}
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setName(saved.name);
                  if (saved.icon) setIcon(saved.icon);
                }}
              >
                <IconView name={saved.icon} width="1rem" height="1rem" />
                {saved.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export { CONTAINER_BREAKPOINTS };
