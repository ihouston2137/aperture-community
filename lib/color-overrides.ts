import type { CSSProperties } from "react";

/**
 * Per-document colour overrides.
 *
 * Content colours normally come from the site's Appearance settings, emitted as
 * `--content-*` custom properties on `:root`. A page or a story template can
 * override any of them for its own content by redeclaring those same properties
 * on the element wrapping the layout — so a single set of variables drives the
 * public render, the builder canvas and every block, with no second code path.
 *
 * An empty string means "inherit the site setting"; the property is then not
 * emitted at all rather than being emitted empty, which would break the cascade.
 */
export type ColorOverrides = {
  background: string;
  text: string;
  accent: string;
};

export const emptyColorOverrides: ColorOverrides = {
  background: "",
  text: "",
  accent: "",
};

export function normalizeColorOverrides(input: unknown): ColorOverrides {
  const raw = (input ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  return {
    background: str(raw.background),
    text: str(raw.text),
    accent: str(raw.accent),
  };
}

export function hasColorOverrides(colors: ColorOverrides): boolean {
  return Boolean(colors.background || colors.text || colors.accent);
}

/**
 * The overrides as inline custom properties. Inline rather than a `<style>`
 * block so the values scope to exactly one element with no generated selector
 * to keep unique.
 */
export function colorOverrideStyle(colors: ColorOverrides): CSSProperties {
  const style: Record<string, string> = {};
  if (colors.background) style["--content-bg"] = colors.background;
  if (colors.text) style["--content-text"] = colors.text;
  if (colors.accent) style["--content-accent"] = colors.accent;
  return style as CSSProperties;
}
