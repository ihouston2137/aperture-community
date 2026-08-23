"use client";

import { useState } from "react";

import { Panel } from "@/components/admin-ui";
import type { DocSetSummary } from "@/lib/doc-tree";

import { saveDocSetAction } from "./actions";

/** The set's own details: what it is called, where it lives, how it renders. */
export function DocSetForm({
  set,
  templates,
}: {
  set?: DocSetSummary;
  templates: { _id: string; name: string }[];
}) {
  const [title, setTitle] = useState(set?.title ?? "");
  const [slug, setSlug] = useState(set?.slug ?? "");

  return (
    <form action={saveDocSetAction}>
      {set ? <input type="hidden" name="id" value={set._id} /> : null}

      <Panel title={set ? "Documentation details" : "New documentation"}>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="set-title">Title</label>
            <input
              id="set-title"
              name="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="set-slug">Slug</label>
            <input
              id="set-slug"
              name="slug"
              type="text"
              value={slug}
              placeholder="from the title"
              onChange={(event) => setSlug(event.target.value)}
            />
            <span className="help-text">Pages live at /docs/{slug || "…"}/…</span>
          </div>
          <div className="field">
            <label htmlFor="set-status">Status</label>
            <select id="set-status" name="status" defaultValue={set?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <span className="help-text">
              A draft set hides every page in it, whatever the pages say.
            </span>
          </div>
          <div className="field">
            <label htmlFor="set-template">Template</label>
            <select
              id="set-template"
              name="templateId"
              defaultValue={set?.templateId ?? ""}
            >
              <option value="">Default template</option>
              {templates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                </option>
              ))}
            </select>
            <span className="help-text">Every page in the set renders through it.</span>
          </div>
        </div>

        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="set-description">Description</label>
          <textarea
            id="set-description"
            name="description"
            rows={2}
            defaultValue={set?.description ?? ""}
          />
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <button type="submit" className="btn btn-primary btn-sm">
            {set ? "Save details" : "Create documentation"}
          </button>
        </div>
      </Panel>
    </form>
  );
}
