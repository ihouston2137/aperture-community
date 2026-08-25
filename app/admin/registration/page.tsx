import { AdminHeader, Notice } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { getAuthSettings } from "@/lib/auth-settings";
import { getEmailSettings } from "@/lib/email";
import { getRoleSummaries } from "@/lib/members";

import { RegistrationSettingsForm } from "./settings-form";

export const metadata = { title: "Registration" };

export default async function RegistrationPage() {
  await requirePermission("registration.manage");

  const [settings, roles, email] = await Promise.all([
    getAuthSettings(),
    getRoleSummaries("community"),
    getEmailSettings(),
  ]);

  return (
    <>
      <AdminHeader
        title="Registration"
        subtitle="How people join, what they are given, who is told about it, and when a six-digit code is asked for."
      />

      {/* Verification codes, recovery codes and the notification all go out
          over SMTP, so an unconfigured mail server disables more than it looks
          like it does. */}
      {!email.enabled ? (
        <Notice variant="error">
          Email sending is switched off, so no verification code, recovery code or
          notification can be delivered. Turn it on under Email before requiring
          any of them.
        </Notice>
      ) : null}

      <RegistrationSettingsForm
        settings={settings}
        roles={roles.map((role) => ({
          _id: role._id,
          name: role.name,
          openToRegistration: role.openToRegistration,
        }))}
      />
    </>
  );
}
