"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { syncMediaUsage } from "@/lib/media-usage-sync";
import { PwaSettings } from "@/lib/models";
import { sanitizeMediaPath } from "@/lib/protected-media-url";
import { normalizePwa, type PwaValues } from "@/lib/pwa-types";

export type PwaResult = { ok: boolean; error?: string };

/**
 * The manifest settings, saved whole.
 *
 * One document like appearance and site content, upserted rather than looked
 * up first: a site has one manifest, and the first save is as likely to be the
 * one that creates it as not.
 */
export async function savePwaSettingsAction(
  formData: FormData
): Promise<PwaResult> {
  await requirePermission("design.pwa");
  await connectDB();

  let settings: PwaValues;
  try {
    settings = normalizePwa(JSON.parse(String(formData.get("settings") ?? "{}")));
  } catch {
    return { ok: false, error: "Could not read those settings." };
  }

  if (settings.isEnabled && !settings.name) {
    return { ok: false, error: "Name the app — it goes under the icon." };
  }

  const icons = settings.icons
    // Through the same path check as every other stored media reference, so a
    // hand-edited payload cannot point an icon outside the media roots.
    .map((icon) => ({ ...icon, url: sanitizeMediaPath(icon.url) }))
    .filter((icon) => icon.url);

  await PwaSettings.findOneAndUpdate(
    {},
    { ...settings, icons },
    { upsert: true, new: true }
  );

  // So the media library can say where a picture is being used, and refuse to
  // delete an icon the site is installed with.
  await syncMediaUsage("pwa", "App & icons", [{ kind: "app-icon", source: { icons } }]);

  // The manifest, the apple tags and the theme colour all hang off the root
  // layout, so the whole site is what goes stale when this changes.
  revalidatePath("/", "layout");
  revalidatePath("/manifest.webmanifest");
  return { ok: true };
}
