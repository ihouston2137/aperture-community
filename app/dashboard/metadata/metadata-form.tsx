"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MetadataEntries } from "@/components/metadata-fields";
import {
  unanswered,
  type MetadataEntry,
  type MetadataGroupSummary,
} from "@/lib/metadata-types";

import { saveOwnMetadataAction } from "./actions";

/**
 * One group of questions, as the member answers it.
 *
 * Saved a group at a time rather than all at once: somebody who fills in one
 * of three should keep that one, and a page that only saved everything
 * together would lose it the moment they left.
 */
export function MetadataForm({
  group,
  entries,
}: {
  group: MetadataGroupSummary;
  entries: MetadataEntry[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<MetadataEntry[]>(entries);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const outstanding = unanswered(group, draft);

  function save() {
    setError("");
    setSaved(false);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("groupId", group._id);
      formData.set("entries", JSON.stringify(draft));

      const result = await saveOwnMetadataAction(formData);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error ?? "Could not save your answers.");
      }
    });
  }

  return (
    <section className="member-card">
      <div className="manager-card-head">
        <h2 className="member-card-title">{group.name}</h2>
        {outstanding.length > 0 ? (
          <span className="badge badge-draft">
            {outstanding.length} still needed
          </span>
        ) : null}
      </div>

      {group.description ? (
        <p className="member-note">{group.description}</p>
      ) : null}

      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <MetadataEntries
        group={group}
        entries={draft}
        onChange={(next) => {
          setDraft(next);
          setSaved(false);
        }}
        disabled={pending}
        idPrefix={`own-${group._id}`}
      />

      <div className="member-actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save answers"}
        </button>

        {/* Said after saving rather than before: a page that claims a question
            is outstanding while the answer is sitting unsaved in the box is
            telling the member something they can see is not true. */}
        {saved ? (
          <span className="help-text">
            {outstanding.length === 0
              ? "Saved. Nothing else is needed here."
              : `Saved. ${outstanding.length} required question${
                  outstanding.length === 1 ? "" : "s"
                } still to answer.`}
          </span>
        ) : null}
      </div>
    </section>
  );
}
