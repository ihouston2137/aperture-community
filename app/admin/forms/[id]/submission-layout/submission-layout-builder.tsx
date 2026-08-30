"use client";

import { useState } from "react";

import { saveSubmissionLayoutAction } from "@/app/admin/forms/actions";

export type LayoutEntry = {
  id: string;
  label: string;
  /** Shown when the entry is opened. */
  visible: boolean;
  /** Shown as a column of the submissions list. */
  inList: boolean;
};

/**
 * Chooses what the submissions inbox shows of each entry, and in what order.
 *
 * Two answers per field, because the inbox asks two different questions. The
 * list has to be scannable — two or three answers wide, enough to recognise
 * the submission you are looking for — while the entry it opens has room for
 * everything that was sent. A field can be in one, both, or neither.
 *
 * Ordering is done with explicit up/down controls rather than dragging,
 * matching the outline panels in the builders, and one order serves both.
 */
export function SubmissionLayoutBuilder({
  formId,
  entries,
}: {
  formId: string;
  entries: LayoutEntry[];
}) {
  const [items, setItems] = useState<LayoutEntry[]>(entries);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  }

  function set(index: number, patch: Partial<LayoutEntry>) {
    setItems((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      )
    );
  }

  const listed = items.filter((item) => item.inList);

  return (
    <form action={saveSubmissionLayoutAction}>
      <input type="hidden" name="id" value={formId} />
      <input
        type="hidden"
        name="submissionLayout"
        value={JSON.stringify(items.filter((item) => item.visible).map(({ id }) => ({ id })))}
      />
      <input
        type="hidden"
        name="submissionColumns"
        value={JSON.stringify(listed.map(({ id }) => ({ id })))}
      />

      <table className="admin-table submission-layout-table">
        <thead>
          <tr>
            <th>Field</th>
            <th className="is-narrow">In the list</th>
            <th className="is-narrow">In the entry</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}>
              <th scope="row">{item.label}</th>

              <td className="is-narrow">
                <input
                  type="checkbox"
                  aria-label={`Show ${item.label} in the list`}
                  checked={item.inList}
                  onChange={(event) => set(index, { inList: event.target.checked })}
                />
              </td>

              <td className="is-narrow">
                <input
                  type="checkbox"
                  aria-label={`Show ${item.label} in the opened entry`}
                  checked={item.visible}
                  onChange={(event) => set(index, { visible: event.target.checked })}
                />
              </td>

              <td className="is-narrow">
                <div className="admin-list-actions">
                  <button type="button" className="btn btn-sm" onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => move(index, 1)}>
                    ↓
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 ? (
        <p className="admin-subtitle">This form has no fields yet.</p>
      ) : null}

      {/* A row four or five answers wide stops being scannable, which is the
          only thing the list is for. Said rather than enforced: a short set of
          one-word answers reads fine at five. */}
      {listed.length > 4 ? (
        <p className="help-text">
          {listed.length} fields in the list. Rows this wide are hard to scan —
          consider leaving some for the opened entry.
        </p>
      ) : null}

      {listed.length === 0 && items.length > 0 ? (
        <p className="help-text">
          With nothing in the list, rows show only when each was received.
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>
        Save layout
      </button>
    </form>
  );
}
