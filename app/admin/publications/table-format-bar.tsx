"use client";

import { useState } from "react";

import { IconView } from "@/components/icons";
import { parseColor } from "@/lib/color";
import {
  MIN_TABLE_CELL,
  TABLE_CELL_BLOCK_LABELS,
  TABLE_CELL_BLOCK_TYPES,
  withColumnAdded,
  withColumnRemoved,
  withRowAdded,
  withRowRemoved,
  type PublicationTable,
  type PublicationTableCell,
} from "@/lib/publication-layout";
import type { StyleValues } from "@/lib/style-values";
import { DEFAULT_TABLE_ACCENT } from "@/lib/table-style";

/**
 * The table controls, in the bar above the canvas.
 *
 * Everything about a table is set here — what a cell holds, how it is dressed,
 * how wide its column is, how tall its row is. None of it appears in the right
 * column as well: one place to look for one kind of thing.
 *
 * The groups are the four levels a table actually has, and what belongs at each
 * is what a table can express:
 *
 *   Table   the accent the look is built from, headings, banding, the gap
 *           between cells — and a fill, padding and rounding every cell starts
 *           from.
 *   Column  width, and a fill, padding and rounding for the whole column.
 *   Row     height, likewise.
 *   Cell    what it holds, where it sits, its lines, and its own fill,
 *           padding and rounding.
 *
 * Width is a column's and height is a row's, because that is what a grid is:
 * two cells side by side cannot be different heights, and no control here
 * offers to make them. The size of a *picture* inside a cell is a different
 * question and belongs to the picture, in the right column, exactly as it does
 * for a picture standing on the page.
 *
 * The rich-text toolbar sits beside all of this whenever a cell is chosen, and
 * acts on the words in it.
 */

/**
 * A number field that waits until you have finished typing.
 *
 * Committing on every keystroke and clamping the result made these unusable:
 * the first digit of "120" was clamped to the smallest allowed size, and the
 * field you were typing into changed under you. It commits on blur or Enter,
 * and Escape puts back what was there.
 */
function NumberCommit({
  label,
  title,
  value,
  min = 0,
  step = 1,
  disabled,
  placeholder,
  onCommit,
}: {
  label: string;
  title: string;
  value: number | undefined;
  min?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (value: number | undefined) => void;
}) {
  const asText = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(asText);
  /*
   * The field follows the chosen cells, but only when they change.
   *
   * Adjusted during the render that notices, rather than in an effect: an
   * effect would set state after painting, so the old value would flash. While
   * somebody is typing, `value` is not moving, so the draft is left alone —
   * which is the whole point, since committing every keystroke and clamping it
   * made the first digit of "120" jump to the smallest allowed size.
   */
  const [seen, setSeen] = useState(asText);
  if (asText !== seen) {
    setSeen(asText);
    setDraft(asText);
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(undefined);
      return;
    }
    const next = Number(trimmed);
    if (Number.isFinite(next)) onCommit(Math.max(min, next));
    else setDraft(asText);
  };

  return (
    <label className="pub-format-field" title={title}>
      <span>{label}</span>
      <input
        type="number"
        className="pub-format-number"
        min={min}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            setDraft(asText);
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

/**
 * Fill, padding and rounding — the three every level can say something about.
 *
 * The same three controls at the table, the column, the row and the cell, so
 * that where a colour came from is a question of which group you used rather
 * than of which control exists at which level.
 */
function SurfaceControls({
  style,
  disabled,
  onDress,
}: {
  style: StyleValues;
  disabled?: boolean;
  onDress: (patch: StyleValues) => void;
}) {
  return (
    <>
      <input
        type="color"
        className="pub-format-swatch"
        aria-label="Fill"
        title="Fill"
        disabled={disabled}
        value={parseColor(style.backgroundColor, "#ffffff").hex}
        onChange={(event) => onDress({ backgroundColor: event.target.value })}
      />
      <button
        type="button"
        className="btn btn-sm"
        title="No fill"
        disabled={disabled}
        onClick={() => onDress({ backgroundColor: undefined })}
      >
        <IconView name="Ban" size={13} />
      </button>
      <NumberCommit
        label="Pad"
        title="Padding, in rem"
        value={style.paddingTop}
        step={0.125}
        disabled={disabled}
        placeholder="—"
        onCommit={(next) =>
          onDress({
            paddingTop: next,
            paddingRight: next,
            paddingBottom: next,
            paddingLeft: next,
          })
        }
      />
      <NumberCommit
        label="Round"
        title="Corner rounding, in rem"
        value={style.borderRadius}
        step={0.125}
        disabled={disabled}
        placeholder="—"
        onCommit={(borderRadius) => onDress({ borderRadius })}
      />
    </>
  );
}

export function TableFormatBar({
  table,
  cell,
  cells,
  rows,
  columns,
  onTable,
  onKind,
  onDressCells,
  onDressAxis,
  onSize,
}: {
  table: PublicationTable;
  /** The cell the choice was started at, whose settings are shown. */
  cell: PublicationTableCell | null;
  /** How many cells are chosen, for labelling. */
  cells: number;
  /** The rows and columns those cells sit in. */
  rows: number[];
  columns: number[];
  onTable: (change: (table: PublicationTable) => PublicationTable) => void;
  onKind: (type: (typeof TABLE_CELL_BLOCK_TYPES)[number]) => void;
  onDressCells: (patch: StyleValues) => void;
  onDressAxis: (axis: "rows" | "columns", patch: StyleValues) => void;
  onSize: (axis: "rows" | "columns", size: number) => void;
}) {
  const chosen = cells > 0;
  const cellStyle = cell?.style ?? {};
  const rowStyle = rows.length ? table.rows[rows[0]].style ?? {} : {};
  const columnStyle = columns.length ? table.columns[columns[0]].style ?? {} : {};

  return (
    <div className="pub-table-bar">
      {/* ------------------------------------------------------------ Table */}
      <span className="pub-format-group">
        <span className="pub-format-title">Table</span>
        <input
          type="color"
          className="pub-format-swatch"
          aria-label="Table colour"
          title="The colour the heading, banding and lines are built from"
          value={parseColor(table.accentColor, DEFAULT_TABLE_ACCENT).hex}
          onChange={(event) =>
            onTable((current) => ({ ...current, accentColor: event.target.value }))
          }
        />
        <label className="pub-format-check" title="Dress the first row as a heading">
          <input
            type="checkbox"
            checked={table.headerRow}
            onChange={(event) =>
              onTable((current) => ({ ...current, headerRow: event.target.checked }))
            }
          />
          Head row
        </label>
        <label className="pub-format-check" title="Dress the first column as a heading">
          <input
            type="checkbox"
            checked={table.headerColumn}
            onChange={(event) =>
              onTable((current) => ({ ...current, headerColumn: event.target.checked }))
            }
          />
          Head col
        </label>
        <label className="pub-format-check" title="Wash every other body row">
          <input
            type="checkbox"
            checked={table.bandedRows}
            onChange={(event) =>
              onTable((current) => ({ ...current, bandedRows: event.target.checked }))
            }
          />
          Banded
        </label>
        <NumberCommit
          label="Gap"
          title="Space between cells, in canvas units — nought makes them share their lines"
          value={table.cellSpacing ?? 0}
          onCommit={(cellSpacing) =>
            onTable((current) => ({ ...current, cellSpacing: cellSpacing ?? 0 }))
          }
        />
        <SurfaceControls
          style={table.cellStyle ?? {}}
          onDress={(patch) =>
            onTable((current) => ({
              ...current,
              cellStyle: { ...current.cellStyle, ...patch },
            }))
          }
        />
      </span>

      {/* ----------------------------------------------------------- Column */}
      <span className="pub-format-group">
        <span className="pub-format-title">
          {columns.length > 1 ? `${columns.length} cols` : "Column"}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          title="Add a column after the chosen one"
          onClick={() =>
            onTable((current) => withColumnAdded(current, columns[columns.length - 1]))
          }
        >
          <IconView name="Plus" size={13} />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!chosen || table.columns.length <= 1}
          title="Remove the chosen columns"
          onClick={() =>
            onTable((current) =>
              [...columns].sort((a, b) => b - a).reduce(withColumnRemoved, current)
            )
          }
        >
          <IconView name="Minus" size={13} />
        </button>
        <NumberCommit
          label="W"
          title="Width of the chosen columns — every cell in a column is this wide"
          value={columns.length ? table.columns[columns[0]].size : undefined}
          min={MIN_TABLE_CELL}
          step={10}
          disabled={!chosen}
          onCommit={(next) => next !== undefined && onSize("columns", next)}
        />
        <SurfaceControls
          style={columnStyle}
          disabled={!chosen}
          onDress={(patch) => onDressAxis("columns", patch)}
        />
      </span>

      {/* -------------------------------------------------------------- Row */}
      <span className="pub-format-group">
        <span className="pub-format-title">
          {rows.length > 1 ? `${rows.length} rows` : "Row"}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          title="Add a row below the chosen one"
          onClick={() => onTable((current) => withRowAdded(current, rows[rows.length - 1]))}
        >
          <IconView name="Plus" size={13} />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!chosen || table.rows.length <= 1}
          title="Remove the chosen rows"
          onClick={() =>
            onTable((current) =>
              [...rows].sort((a, b) => b - a).reduce(withRowRemoved, current)
            )
          }
        >
          <IconView name="Minus" size={13} />
        </button>
        <NumberCommit
          label="H"
          title="Least height of the chosen rows — a row grows to fit its words"
          value={rows.length ? table.rows[rows[0]].size : undefined}
          min={MIN_TABLE_CELL}
          step={10}
          disabled={!chosen}
          onCommit={(next) => next !== undefined && onSize("rows", next)}
        />
        <SurfaceControls
          style={rowStyle}
          disabled={!chosen}
          onDress={(patch) => onDressAxis("rows", patch)}
        />
      </span>

      {/* ------------------------------------------------------------- Cell */}
      <span className="pub-format-group">
        <span className="pub-format-title">
          {cells > 1 ? `${cells} cells` : "Cell"}
        </span>
        <select
          className="pub-format-select"
          aria-label="What the cell holds"
          title="What the cell holds — double-click a cell to edit it"
          value={cell?.block.type ?? "richText"}
          disabled={!chosen}
          onChange={(event) =>
            onKind(event.target.value as (typeof TABLE_CELL_BLOCK_TYPES)[number])
          }
        >
          {TABLE_CELL_BLOCK_TYPES.map((type) => (
            <option key={type} value={type}>
              {TABLE_CELL_BLOCK_LABELS[type]}
            </option>
          ))}
        </select>

        {/* Nine little cells: where the content sits, both ways at once. */}
        <span className="pub-align-grid" role="group" aria-label="Where content sits">
          {(["top", "middle", "bottom"] as const).map((y) =>
            (["left", "center", "right"] as const).map((x) => {
              const current =
                (cellStyle.verticalAlign ?? "top") === y &&
                (cellStyle.textAlign ?? "left") === x;
              return (
                <button
                  key={`${y}-${x}`}
                  type="button"
                  className={`pub-align-cell${current ? " is-current" : ""}`}
                  disabled={!chosen}
                  title={`${y} ${x}`}
                  aria-label={`Align ${y} ${x}`}
                  aria-pressed={current}
                  onClick={() => onDressCells({ textAlign: x, verticalAlign: y })}
                />
              );
            })
          )}
        </span>

        <select
          className="pub-format-select"
          aria-label="Cell lines"
          title="Lines around the chosen cells"
          disabled={!chosen}
          value={cellStyle.borderStyle ?? ""}
          onChange={(event) =>
            onDressCells({
              // Empty is "say nothing", which lets the table's own lines show
              // again; `none` is the decision to have none at all.
              borderStyle: (event.target.value || undefined) as StyleValues["borderStyle"],
              borderWidth: cellStyle.borderWidth || 0.0625,
            })
          }
        >
          <option value="">Table lines</option>
          <option value="none">No lines</option>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
        <input
          type="color"
          className="pub-format-swatch"
          aria-label="Cell line colour"
          title="Line colour"
          disabled={!chosen}
          value={parseColor(cellStyle.borderColor, DEFAULT_TABLE_ACCENT).hex}
          onChange={(event) =>
            onDressCells({
              borderColor: event.target.value,
              borderStyle:
                !cellStyle.borderStyle || cellStyle.borderStyle === "none"
                  ? "solid"
                  : cellStyle.borderStyle,
              borderWidth: cellStyle.borderWidth || 0.0625,
            })
          }
        />

        <SurfaceControls style={cellStyle} disabled={!chosen} onDress={onDressCells} />
      </span>
    </div>
  );
}
