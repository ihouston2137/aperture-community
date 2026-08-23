"use client";

import { useEffect, useState } from "react";

import type { GoogleFontMeta } from "@/lib/google-fonts";

import { saveFontAction } from "./actions";

export function FontSearch() {
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<GoogleFontMeta[]>([]);
  const [selected, setSelected] = useState<GoogleFontMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/admin/google-fonts?q=${encodeURIComponent(query)}`);
      if (!response.ok || cancelled) return;
      const data = await response.json();
      setFonts(data.fonts ?? []);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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
      </div>

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
