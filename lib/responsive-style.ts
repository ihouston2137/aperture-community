import {
  CORNER_KEYS,
  normalizeStyleValues,
  styleValuesToDeclarations,
  type StyleValues,
} from "./style-values";

/**
 * Per-view style overrides for a block.
 *
 * A block's local style is one `StyleValues` object applied inline. That is
 * enough until a view wants to differ: a style attribute has no media queries,
 * and it outranks any rule that might supply them. So a block that opts into a
 * tablet or mobile override stops being styled inline altogether and is styled
 * by a generated rule instead — the same trade `page-container-layout` makes for
 * areas, and for the same reason.
 *
 * Nothing changes for a block without overrides: it keeps its inline style and
 * emits no CSS at all, so the common page is byte-for-byte what it was.
 */

export const STYLE_VIEWS = ["desktop", "tablet", "mobile"] as const;
export type StyleView = (typeof STYLE_VIEWS)[number];

/** Views that can carry an override. Desktop is the base every view falls back to. */
export const OVERRIDE_VIEWS = ["tablet", "mobile"] as const;
export type OverrideView = (typeof OVERRIDE_VIEWS)[number];

/**
 * The style slots a block can carry. `textStyle` dresses the block itself; the
 * others dress the parts inside it, and each gets its own set of overrides.
 */
export const STYLE_VALUE_KEYS = [
  "textStyle",
  "imageStyle",
  "captionStyle",
  "iconStyle",
  "shapeTextStyle",
  // The event list dresses two boxes: the run of items, and each item in it.
  "listStyle",
  "itemStyle",
  // A documentation slot dresses the parts inside it: the links in a contents
  // tree, the pair of pagination buttons, and the control and panel the
  // contents fold into on a narrow screen.
  "linkStyle",
  "buttonStyle",
  "dropdownStyle",
  "panelStyle",
] as const;
export type StyleValuesKey = (typeof STYLE_VALUE_KEYS)[number];

type ViewSuffix = "Tablet" | "Mobile";

/** Mixed into every block type that can be styled. */
export type ResponsiveStyleFields = {
  [K in `${StyleValuesKey}${ViewSuffix}`]?: StyleValues;
} & {
  [K in `${StyleValuesKey}${ViewSuffix}Enabled`]?: boolean;
};

/** The record the keys are read from — any block, whatever its own type. */
type StyleHost = Record<string, unknown>;

function suffix(view: OverrideView): ViewSuffix {
  return view === "tablet" ? "Tablet" : "Mobile";
}

export function viewValuesKey(valuesKey: string, view: OverrideView): string {
  return `${valuesKey}${suffix(view)}`;
}

export function viewEnabledKey(valuesKey: string, view: OverrideView): string {
  return `${valuesKey}${suffix(view)}Enabled`;
}

export function styleViewEnabled(
  host: StyleHost | undefined,
  valuesKey: string,
  view: OverrideView
): boolean {
  return Boolean(host?.[viewEnabledKey(valuesKey, view)]);
}

/** True once any view overrides this slot — the switch to generated CSS. */
export function hasResponsiveStyle(
  host: StyleHost | undefined,
  valuesKey: string
): boolean {
  return OVERRIDE_VIEWS.some((view) => styleViewEnabled(host, valuesKey, view));
}

/**
 * The values one view renders with.
 *
 * A view that is not overridden shows the next one up: mobile falls back to
 * tablet, tablet to desktop. That matches how a reader narrows a window — the
 * layout keeps the last thing that was said about it.
 */
export function styleValuesForView(
  host: StyleHost | undefined,
  valuesKey: string,
  view: StyleView
): StyleValues | undefined {
  const base = host?.[valuesKey] as StyleValues | undefined;
  if (view === "desktop") return base;

  const tablet = styleViewEnabled(host, valuesKey, "tablet")
    ? (host?.[viewValuesKey(valuesKey, "tablet")] as StyleValues | undefined)
    : undefined;
  if (view === "tablet") return tablet ?? base;

  const mobile = styleViewEnabled(host, valuesKey, "mobile")
    ? (host?.[viewValuesKey(valuesKey, "mobile")] as StyleValues | undefined)
    : undefined;
  return mobile ?? tablet ?? base;
}

/**
 * Whether a per-view style decides this slot's corner radius.
 *
 * Image and video blocks set a radius from their own sizing controls, inline.
 * Once the style values move into a rule that inline value outranks them, so
 * the block has to stand aside for the views that state one.
 */
export function responsiveStyleSetsRadius(
  host: StyleHost | undefined,
  valuesKey: string
): boolean {
  if (!hasResponsiveStyle(host, valuesKey)) return false;
  return STYLE_VIEWS.some((view) => {
    const values = styleValuesForView(host, valuesKey, view);
    if (!values) return false;
    return (
      values.borderRadius !== undefined ||
      CORNER_KEYS.some((key) => values[key] !== undefined)
    );
  });
}

/* -------------------------------------------------------------------- CSS */

/** Ids come from `makeId`, but old records may hold anything. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** `textStyle` → `text`, so the class reads as the part it dresses. */
function slotName(valuesKey: string): string {
  return valuesKey.replace(/Style$/, "").toLowerCase() || "text";
}

export function responsiveStyleClass(id: string, valuesKey: string): string {
  return `pb-rs-${safeId(id)}-${slotName(valuesKey)}`;
}

/**
 * The three views as mutually exclusive bands.
 *
 * Non-overlapping on purpose: a property a narrow view leaves unset then falls
 * back to whatever the block's own classes say, exactly as it does today when
 * the inline style omits it. Overlapping bands would instead leak the wider
 * view's value, which is the bug this shape avoids.
 *
 * The boundaries match `page-container-layout`, so a container area and a block
 * inside it change over at the same width.
 */
export const VIEW_MEDIA: Record<StyleView, string> = {
  // Range syntax, so the bands meet exactly. Written as min/max pairs they
  // would leave a sub-pixel gap at each boundary where no rule applies, and a
  // fractional viewport width does land there.
  desktop: "(width > 64rem)",
  tablet: "(48rem < width <= 64rem)",
  mobile: "(width <= 48rem)",
};

/**
 * One slot's rules, at all three views.
 *
 * Emitted twice, as the container grid is: once for real viewports, and once
 * keyed to the builder canvas's viewport switch. The canvas is a narrow box in
 * a wide window, so only the second set can make the preview agree with the
 * published page — and being two compound selectors, it outranks the first.
 */
function slotCss(id: string, host: StyleHost, valuesKey: string): string {
  const className = responsiveStyleClass(id, valuesKey);
  const lines: string[] = [];

  for (const view of STYLE_VIEWS) {
    const declarations = styleValuesToDeclarations(
      styleValuesForView(host, valuesKey, view)
    );
    if (!declarations) continue;

    lines.push(`@media ${VIEW_MEDIA[view]} {\n.${className} {\n${declarations}\n}\n}`);
    lines.push(
      `.builder-canvas[data-viewport="${view}"] .${className} {\n${declarations}\n}`
    );
  }

  return lines.join("\n");
}

/**
 * The named-style key that pairs with a values key.
 *
 * The block's own style is the odd one out: its slug is `styleSlug`, not
 * `textStyleSlug`, because it predates the per-part slots.
 */
export function slugKeyFor(valuesKey: string): string {
  return valuesKey === "textStyle" ? "styleSlug" : `${valuesKey}Slug`;
}

/** Every overridden slot on one block. Empty for a block with no overrides. */
export function blockResponsiveCss(block: StyleHost & { id?: string }): string {
  if (!block.id) return "";

  const parts: string[] = [];
  for (const valuesKey of STYLE_VALUE_KEYS) {
    // A named style replaces every local setting, per-view ones included.
    if (block[slugKeyFor(valuesKey)]) continue;
    if (!hasResponsiveStyle(block, valuesKey)) continue;
    parts.push(slotCss(block.id, block, valuesKey));
  }

  return parts.filter(Boolean).join("\n");
}

/**
 * The whole layout's overrides as one stylesheet.
 *
 * Gathered at the root rather than beside each block so a page emits one sheet
 * however deeply its containers nest, and so the builder canvas and the public
 * renderer can each produce it from the layout they already hold.
 */
export function layoutResponsiveCss(layout: unknown): string {
  const parts: string[] = [];

  const visitBlocks = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const css = blockResponsiveCss(block as StyleHost & { id?: string });
      if (css) parts.push(css);

      const cells = (block as any).container?.cells;
      if (Array.isArray(cells)) for (const cell of cells) visitBlocks(cell?.blocks);
    }
  };

  if (Array.isArray(layout)) {
    for (const row of layout) {
      for (const column of row?.columns ?? []) visitBlocks(column?.blocks);
    }
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------ Persistence */

/**
 * Copies the per-view keys for one slot onto a normalized block.
 *
 * Kept beside the readers so a slot cannot be rendered from a key that is never
 * saved — the failure mode where an override works until the page is reloaded.
 */
export function normalizeResponsiveStyle(
  raw: Record<string, unknown>,
  target: Record<string, unknown>,
  valuesKey: string
): void {
  for (const view of OVERRIDE_VIEWS) {
    const enabledKey = viewEnabledKey(valuesKey, view);
    const key = viewValuesKey(valuesKey, view);
    if (raw[enabledKey]) target[enabledKey] = true;
    if (raw[key]) target[key] = normalizeStyleValues(raw[key]);
  }
}
