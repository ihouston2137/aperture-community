"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { backfillThumbnails, rebuildMediaUsage } from "@/lib/media-maintenance";
import { unifyLegacyMedia } from "@/lib/unify-media";

/**
 * Maintenance jobs for the media library. These are the only places that scan
 * all site content; every request-time path uses indexed queries instead.
 */
export async function rebuildMediaUsageAction() {
  await requirePermission("media.upload");
  const result = await rebuildMediaUsage();
  revalidatePath("/admin/media");
  return result;
}

export async function backfillThumbnailsAction() {
  await requirePermission("media.upload");
  const result = await backfillThumbnails();
  revalidatePath("/admin/media");
  return result;
}

export async function unifyLegacyMediaAction() {
  await requirePermission("media.upload");
  const result = await unifyLegacyMedia();
  revalidatePath("/admin/media");
  return result;
}
