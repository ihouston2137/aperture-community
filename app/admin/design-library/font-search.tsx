"use client";

import { useEffect, useState } from "react";

import type { GoogleFontMeta } from "@/lib/google-fonts";

import { saveFontAction } from "./actions";

export function FontSearch() {
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<GoogleFontMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [complete, setComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GoogleFontMeta | null>(null);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/google-fonts?q=${encodeURIComponent(query)}`
        );
        if (cancelled) return;
        if (!response.ok) throw new Error(String(response.status));

        const data = await response.json();
        if (cancelled) return;

        setFonts(data.fonts ?? []);
        setTotal(data.total ?? data.fonts?.length ?? 0);
        setComplete(data.complete !== false);
      } catch {
        if (!cancelled) {
          setFonts([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // The search caps what it returns; the whole catalogue is far too much to
  // render as buttons.
  const hint = loading
    ? "Searching…"
    : total === 0
      ? "No families match that."
      : total > fonts.length
        ? `Showing ${fonts.length} of ${total} matches — keep typing to narrow it down.`
        : `${total} ${total === 1 ? "family" : "families"}`;

  return (
    <div>
      <div className="field">
        <label>Search Google Fonts</label>
        <input
          type="text"
          value={query}
          placeholder="e.g. Inter, serif, mono"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="help-text">{hint}</span>
      </div>

      {complete ? null : (
        <div className="admin-notice is-error" style={{ marginTop: "0.75rem" }}>
          The Google Fonts catalogue could not be reached, so only the built-in
          shortlist is being searched.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", margin: "0.75rem 0" }}>
        {fonts.map((font) => (
          <button
            key={font.family}
            type="button"
            className={`btn btn-sm${selected?.family === font.family ? " btn-primary" : ""}`}
            onClick={() => setSelected(font)}
          >
            {font.family}
          </button>
        ))}
      </div>

      {selected ? (
        <form action={saveFontAction}>
          <input type="hidden" name="family" value={selected.family} />
          <input type="hidden" name="category" value={selected.category} />

          <div className="field">
            <label>Weights for {selected.family}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {selected.variants.map((variant) => (
                <label key={variant} className="checkbox-row">
                  <input
                    type="checkbox"
                    name="variants"
                    value={variant}
                    defaultChecked={variant === "400" || variant === "700"}
                  />
                  {variant}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
            Add {selected.family}
          </button>
        </form>
      ) : null}
    </div>
  );
}
