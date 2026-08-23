import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { getEmailSettings } from "@/lib/email";

import { EmailSettingsForm } from "./settings-form";

export const metadata = { title: "Email" };

export default async function EmailPage() {
  await requirePermission("email.manage");
  const settings = await getEmailSettings();

  return (
    <>
      <AdminHeader
        title="Email"
        subtitle="SMTP credentials and form submission notifications."
      />
      {/* The stored password is never sent to the browser. */}
      <EmailSettingsForm
        settings={{ ...settings, password: "", hasPassword: Boolean(settings.password) }}
      />
    </>
  );
}
