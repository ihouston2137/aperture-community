"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { IS_DEV, resetInstall } from "@/lib/dev-reset";
import { requirePermission } from "@/lib/access";
import { clearSession } from "@/lib/session";

/**
 * Wipes the database and the uploads directory.
 *
 * Guarded twice over: the button is not rendered outside development, and this
 * refuses to run there even if the request is forged. It also needs the highest
 * permission the app has, since it destroys everything every other permission
 * protects.
 */
export async function resetInstallAction() {
  if (!IS_DEV) throw new Error("The reset is only available in development.");
  await requirePermission("users.manage");

  await resetInstall();

  // The signed-in user no longer exists — the seed account is a new record.
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/login?reset=1");
}
