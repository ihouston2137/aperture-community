/**
 * The one list of aspect ratios in the app.
 *
 * Shared by the story feature media block and by background media, so a frame
 * offered in one place is offered — and computed — identically in the other.
 */

export const ASPECT_RATIOS = [
  "actual",
  "2:1",
  "16:9",
  "3:2",
  "5:4",
  "1:1",
  "4:5",
  "2:3",
  "9:16",
  "1:2",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Every ratio except `actual`, for settings where a frame is the whole point. */
export const FIXED_ASPECT_RATIOS = ASPECT_RATIOS.filter(
  (ratio): ratio is Exclude<AspectRatio, "actual"> => ratio !== "actual"
);

export function aspectRatioLabel(aspect: AspectRatio): string {
  return aspect === "actual" ? "Actual" : aspect;
}

/** The width/height ratio a named aspect stands for; `actual` has none. */
export function aspectRatioValue(aspect: AspectRatio | undefined): number | null {
  if (!aspect || aspect === "actual") return null;
  const [width, height] = aspect.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : null;
}

/** The same ratio as a CSS `aspect-ratio` value, or null when unconstrained. */
export function aspectRatioCss(aspect: AspectRatio | undefined): string | null {
  if (!aspect || aspect === "actual") return null;
  const [width, height] = aspect.split(":").map(Number);
  return width > 0 && height > 0 ? `${width} / ${height}` : null;
}
