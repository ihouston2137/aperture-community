"use client";

import { useMemo, useState } from "react";

import { LucideIconView, iconNames, toIconName } from "./lucide-icon";

/**
 * Search the whole Lucide library and pick an icon.
 *
 * Results are capped: the library is over 1,700 icons and drawing them all at
 * once costs more than it helps. Typing narrows the list, which is how anyone
 * finds an icon in a set this size anyway.
 */
const LIMIT = 120;

export function IconSearchField({
  label = "Icon",
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = toIconName(value);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/\s+/g, "-");
    const matches = term
      ? iconNames.filter((name) => name.includes(term))
      : iconNames;
    return matches.slice(0, LIMIT);
  }, [query]);

  return (
    <div className="field">
      <label>{label}</label>

      <div className="icon-search-current">
        <LucideIconView name={value} width="1.5rem" height="1.5rem" />
        <span>{selected ?? "None selected"}</span>
      </div>

      <input
        type="search"
        value={query}
        placeholder={`Search ${iconNames.length} icons…`}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="icon-search-grid">
        {results.map((name) => (
          <button
            key={name}
            type="button"
            className={`icon-search-item${name === selected ? " is-selected" : ""}`}
            title={name}
            aria-label={name}
            onClick={() => onChange(name)}
          >
            <LucideIconView name={name} width="1.15rem" height="1.15rem" />
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <span className="help-text">No icon matches “{query}”.</span>
      ) : (
        <span className="help-text">
          {results.length === LIMIT
            ? `First ${LIMIT} matches — keep typing to narrow it down.`
            : `${results.length} match${results.length === 1 ? "" : "es"}.`}
        </span>
      )}
    </div>
  );
}
