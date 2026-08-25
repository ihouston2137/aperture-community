"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { clampCodeTtl, readTwoFactorMode, saveAuthSettings } from "@/lib/auth-settings";
import { parseRecipients } from "@/lib/members";

export type RegistrationSettingsResult = { ok: boolean; error?: string; message?: string };

export async function saveRegistrationSettingsAction(
  formData: FormData
): Promise<RegistrationSettingsResult> {
  await requirePermission("registration.manage");

  const recipients = parseRecipients(String(formData.get("registrationRecipients") ?? ""));
  const notifyOnRegistration = formData.get("notifyOnRegistration") === "on";

  // Switching notifications on with nowhere to send them looks like it worked
  // and then never does anything.
  if (notifyOnRegistration && recipients.length === 0) {
    return {
      ok: false,
      error: "Add at least one address to notify, or switch the notification off.",
    };
  }

  await saveAuthSettings({
    allowRegistration: formData.get("allowRegistration") === "on",
    allowRoleRequest: formData.get("allowRoleRequest") === "on",
    autoApproveRegistrations: formData.get("autoApproveRegistrations") === "on",
    requireEmailVerification: formData.get("requireEmailVerification") === "on",
    defaultCommunityRoleId: String(formData.get("defaultCommunityRoleId") ?? ""),
    twoFactorMode: readTwoFactorMode(formData.get("twoFactorMode")),
    codeTtlMinutes: clampCodeTtl(formData.get("codeTtlMinutes")),
    notifyOnRegistration,
    registrationRecipients: recipients,
    registrationSubject: String(formData.get("registrationSubject") ?? "").trim().slice(0, 200),
    registrationIntro: String(formData.get("registrationIntro") ?? "").trim().slice(0, 2000),
  });

  revalidatePath("/admin/registration");
  revalidatePath("/register");
  return { ok: true, message: "Registration settings saved." };
}
