"use client";

import { useState } from "react";

import { ICON_NAMES, IconView } from "@/components/icons";
import { ModalPortal } from "@/components/modal-portal";

/**
 * Picks one icon from the curated Lucide set.
 *
 * The set is curated rather than the whole library — a dynamic namespace lookup
 * defeats tree-shaking — so the search filters names in memory and never hits
 * the network.
 */

export function IconPicker({
  open,
  value,
  title = "Select an icon",
  onSelect,
  onClose,
}: {
  open: boolean;
  value?: string;
  title?: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return <IconPickerBody value={value} title={title} onSelect={onSelect} onClose={onClose} />;
}

function IconPickerBody({
  value,
  title,
  onSelect,
  onClose,
}: {
  value?: string;
  title: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = term
    ? ICON_NAMES.filter((name) => name.toLowerCase().includes(term))
    : ICON_NAMES;

  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={onClose}>
        <div className="style-modal" onClick={(event) => event.stopPropagation()}>
          <div className="style-modal-header">
            <strong>{title}</strong>
          </div>

          <div className="style-modal-body">
            <div className="field">
              <label>Search</label>
              <input
                type="text"
                autoFocus
                value={query}
                placeholder="e.g. arrow, mail, star"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {matches.length === 0 ? (
              <p className="help-text">No icon matches “{query}”.</p>
            ) : (
              <div className="icon-picker-grid">
                {matches.map((name) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    className={`icon-picker-item${name === value ? " is-selected" : ""}`}
                    onClick={() => {
                      onSelect(name);
                      onClose();
                    }}
                  >
                    <IconView name={name} width="1.25rem" height="1.25rem" />
                    <small>{name}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="style-modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** The trigger used in inspectors: shows the current icon and opens the popup. */
export function IconField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="field">
      <label>{label}</label>
      <button type="button" className="btn btn-sm icon-field" onClick={() => setOpen(true)}>
        <IconView name={value} width="1.1rem" height="1.1rem" />
        {value || "Select an icon…"}
      </button>
      <IconPicker
        open={open}
        value={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
