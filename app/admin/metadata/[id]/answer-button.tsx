"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { MetadataEntries } from "@/components/metadata-fields";
import { ModalPortal } from "@/components/modal-portal";
import type {
  MetadataEntry,
  MetadataGroupSummary,
} from "@/lib/metadata-types";

import { saveManagedAnswerAction } from "../actions";

/**
 * Filling in what is kept about one member, from the report.
 *
 * The report is where somebody works through a group — checking who is
 * outstanding and settling them one at a time — so the way to answer is on the
 * row rather than on a page of its own.
 */
export function AnswerButton({
  group,
  userId,
  userName,
  entries,
}: {
  group: MetadataGroupSummary;
  userId: string;
  userName: string;
  entries: MetadataEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MetadataEntry[]>(entries);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
    // Back to what is on file, so a half-typed answer is not still sitting
    // there the next time the row is opened.
    setDraft(entries);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("groupId", group._id);
      formData.set("userId", userId);
      formData.set("entries", JSON.stringify(draft));

      const result = await saveManagedAnswerAction(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Could not save that.");
      }
    });
  }

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Answer
      </button>

      {open ? (
        <ModalPortal>
          <div
            className="style-modal-backdrop"
            onClick={pending ? undefined : close}
            role="presentation"
          >
            <div
              className="style-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Metadata for ${userName}`}
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <div className="style-modal-form">
                <div className="style-modal-header">
                  <strong>{userName}</strong>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: "auto" }}
                    disabled={pending}
                    onClick={close}
                  >
                    Close
                  </button>
                </div>

                <div className="style-modal-body">
                  {error ? (
                    <div className="admin-notice is-error">{error}</div>
                  ) : null}

                  <p className="help-text">
                    Kept about this member. They do not see it.
                  </p>

                  <MetadataEntries
                    group={group}
                    entries={draft}
                    onChange={setDraft}
                    disabled={pending}
                    idPrefix={`answer-${userId}`}
                  />
                </div>

                <div className="style-modal-footer">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: "auto" }}
                    disabled={pending}
                    onClick={save}
                  >
                    {pending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
