"use server";

import { revalidatePath } from "next/cache";

import { processAnalytics, rebuildAllAnalytics } from "@/lib/analytics/process";
import { saveAnalyticsSettings } from "@/lib/analytics/settings";
import { isValidTimezone } from "@/lib/analytics/time";
import { requirePermission } from "@/lib/access";

function revalidate() {
  revalidatePath("/admin/analytics");
  revalidatePath("/admin");
}

export async function saveAnalyticsSettingsAction(formData: FormData) {
  await requirePermission("analytics.manage");

  const timezone = String(formData.get("timezone") ?? "").trim();

  await saveAnalyticsSettings({
    enabled: formData.get("enabled") === "on",
    // A zone the runtime cannot resolve would throw on every hit, so an
    // unrecognised one is refused here and the stored value is left alone.
    timezone: isValidTimezone(timezone) ? timezone : "",
    retentionDays: Number(formData.get("retentionDays") ?? 400),
    intervalMinutes: Number(formData.get("intervalMinutes") ?? 15),
    excludeLoggedInByDefault: formData.get("excludeLoggedInByDefault") === "on",
  });

  revalidate();
}

export async function processAnalyticsAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requirePermission("analytics.view");

  const result = await processAnalytics();
  revalidate();

  if (!result.ok) {
    return { ok: false, message: result.error ?? "Processing failed." };
  }

  const finalized =
    result.finalized.length > 0
      ? ` Finalized ${result.finalized.join(", ")}.`
      : "";

  return {
    ok: true,
    message: `Processed ${result.processed.length} day(s), ${result.hits} hit(s) in ${result.ranMs}ms.${finalized}`,
  };
}

/**
 * Discards every summary and rebuilds from the logs.
 *
 * The way back after a timezone change: the day boundaries moved, so what was
 * derived under the old calendar no longer describes anything.
 */
export async function rebuildAnalyticsAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  await requirePermission("analytics.manage");

  const result = await rebuildAllAnalytics();
  revalidate();

  return result.ok
    ? {
        ok: true,
        message: `Rebuilt ${result.processed.length} day(s) from ${result.hits} logged hit(s).`,
      }
    : { ok: false, message: result.error ?? "Rebuild failed." };
}
