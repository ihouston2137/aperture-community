"use server";

import { cookies } from "next/headers";
import { getUserAccess } from "@/lib/access";
import { User } from "@/lib/models";
import { membershipStatus } from "@/lib/permissions";
import { clearPendingAuth, clearUserView, createUserView, getAuthenticatedSession } from "@/lib/session";
import { USER_VIEW_COOKIE } from "@/lib/user-view-token";

export async function startUserViewAction(targetId: string): Promise<{ error?: string; location?: string }> {
  const actor = await getAuthenticatedSession();
  if (!actor || actor.mustChangePassword || !(await getUserAccess(actor.userId)).isAdministrator) {
    return { error: "Only administrators can view as another user." };
  }
  if ((await cookies()).has(USER_VIEW_COOKIE)) {
    return { error: "Return to your administrator account before switching to another user." };
  }
  if (typeof targetId !== "string" || !/^[a-f\d]{24}$/i.test(targetId) || targetId === actor.userId) {
    return { error: "Choose another user account." };
  }
  const target = await User.findById(targetId).select("isActive membershipStatus mustChangePassword");
  if (!target || target.isActive === false || membershipStatus(target.membershipStatus) !== "active") {
    return { error: "This account cannot sign in. Choose an active, approved user." };
  }
  await clearPendingAuth();
  await createUserView(targetId, actor.userId);
  return { location: target.mustChangePassword ? "/admin/change-password" : "/" };
}

export async function stopUserViewAction() {
  // The original session is never replaced. Clearing the overlay grants no new access
  // and works even if the target was deleted or the preview token expired.
  await clearUserView();
}
