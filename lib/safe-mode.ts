import { cookies } from "next/headers";

import { NSFW_FEATURES_ENABLED } from "./nsfw";

export const SAFE_MODE_COOKIE = "aperture_safe_mode";

/**
 * Safe mode blurs assets flagged `isNsfw`. It defaults to the site-wide
 * `safeModeDefault` and can be flipped per visitor with a cookie.
 */
export async function getSafeMode(fallback = true): Promise<boolean> {
  // With the feature off there is no toggle to turn it back on, so shielding
  // anything would leave a visitor with media they could never reveal.
  if (!NSFW_FEATURES_ENABLED) return false;

  const store = await cookies();
  const value = store.get(SAFE_MODE_COOKIE)?.value;
  if (value === "on") return true;
  if (value === "off") return false;
  return fallback;
}
