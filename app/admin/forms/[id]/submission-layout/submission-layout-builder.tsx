"use client";

import { useState } from "react";

import { saveSubmissionLayoutAction } from "@/app/admin/forms/actions";

export type LayoutEntry = { id: string; label: string; visible: boolean };

/**
 * Chooses which submitted fields the submissions inbox shows, and in what
 * order. Ordering is done with explicit up/down controls rather than dragging,
 * matching the outline panels in the builders.
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

  return (
    <form action={saveSubmissionLayoutAction}>
      <input type="hidden" name="id" value={formId} />
      <input
        type="hidden"
        name="submissionLayout"
        value={JSON.stringify(items.filter((item) => item.visible).map(({ id }) => ({ id })))}
      />

      <ul className="admin-list">
        {items.map((item, index) => (
          <li key={item.id} className="admin-list-item">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={item.visible}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, visible: event.target.checked }
                        : entry
                    )
                  )
                }
              />
              {item.label}
            </label>
            <div className="admin-list-actions">
              <button type="button" className="btn btn-sm" onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" className="btn btn-sm" onClick={() => move(index, 1)}>
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="admin-subtitle">This form has no fields yet.</p>
      ) : null}

      <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>
        Save layout
      </button>
    </form>
  );
}
