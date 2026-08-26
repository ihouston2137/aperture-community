"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import type { SponsorCategorySummary } from "@/lib/sponsorship-types";

import { deleteCategoryAction, saveCategoryAction } from "./actions";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; category: SponsorCategorySummary }
  | null;

/**
 * The labels this community puts on its sponsors — "Local business",
 * "Alumni-owned", "Season partner".
 *
 * Separate from type and industry, which describe what a sponsor *is*. These
 * are how the people running the campaign think of them, so they are defined
 * here rather than fixed by the app, and a sponsor can carry several.
 */
export function CategoryManager({
  categories,
  counts,
  canManage,
}: {
  categories: SponsorCategorySummary[];
  /** How many sponsors carry each, so one in use is obvious. */
  counts: Record<string, number>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <Panel title={`Sponsor categories (${categories.length})`}>
      {canManage ? (
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            Add category
          </button>
        </div>
      ) : null}

      {categories.length === 0 ? (
        <p className="help-text">
          No categories yet. Add some and each sponsor can be put into as many as
          apply.
        </p>
      ) : (
        <ul className="admin-list">
          {categories.map((category) => (
            <li key={category._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>{category.name}</h3>
                <div className="admin-list-meta">
                  {category.description || "no description"}
                </div>
              </div>

              <span
                className={`badge${counts[category._id] ? " badge-published" : ""}`}
              >
                {counts[category._id] ?? 0} sponsor
                {(counts[category._id] ?? 0) === 1 ? "" : "s"}
              </span>

              {canManage ? (
                <div className="admin-list-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDialog({ mode: "edit", category })}
                  >
                    Edit
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <CategoryDialog
          category={dialog.mode === "edit" ? dialog.category : undefined}
          inUse={
            dialog.mode === "edit" ? (counts[dialog.category._id] ?? 0) : 0
          }
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </Panel>
  );
}

function CategoryDialog({
  category,
  inUse,
  onClose,
  onSaved,
}: {
  category?: SponsorCategorySummary;
  inUse: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function save(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveCategoryAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that category.");
    });
  }

  function remove() {
    if (!category) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", category._id);
      const result = await deleteCategoryAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that category.");
    });
  }

  const title = category ? "Edit category" : "Add category";

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
            <div className="style-modal-header">
              <strong>{title}</strong>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="style-modal-body">
              {category ? (
                <input type="hidden" name="id" value={category._id} />
              ) : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field">
                <label htmlFor="category-name">Name</label>
                <input
                  id="category-name"
                  name="name"
                  type="text"
                  defaultValue={category?.name ?? ""}
                  placeholder="Local business, Alumni-owned, Season partner…"
                  required
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="category-description">Description</label>
                <textarea
                  id="category-description"
                  name="description"
                  rows={3}
                  defaultValue={category?.description ?? ""}
                  placeholder="What belongs in it, so it is used the same way each time."
                />
              </div>
            </div>

            <div className="style-modal-footer">
              {category ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">
                      {inUse > 0
                        ? `Delete this category? It comes off ${inUse} sponsor${
                            inUse === 1 ? "" : "s"
                          }.`
                        : "Delete this category?"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={remove}
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete category
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : category ? "Save category" : "Create category"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
