import { AdminHeader, Notice } from "@/components/admin-ui";
import { requireSession } from "@/lib/session";

import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const session = await requireSession(true);

  return (
    <>
      <AdminHeader
        title="Change password"
        subtitle="Update the password used to sign in to the admin."
      />
      {session.mustChangePassword ? (
        <Notice>
          You must change your password before you can use the rest of the admin.
        </Notice>
      ) : null}
      <PasswordForm />
    </>
  );
}
