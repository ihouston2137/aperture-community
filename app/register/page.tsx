import { redirect } from "next/navigation";

import { AuthLink, AuthShell } from "@/components/auth-shell";
import { getAuthSettings } from "@/lib/auth-settings";
import { getRoleSummaries } from "@/lib/members";
import { ensureSeed } from "@/lib/seed";
import { getSession } from "@/lib/session";

import { RegisterForm } from "./register-form";

export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect("/admin");

  // Reading the form is the first thing that happens on a new site, so the
  // starting membership level is created here rather than only once somebody
  // has already submitted a registration that had nothing to assign.
  await ensureSeed();
  const settings = await getAuthSettings();

  if (!settings.allowRegistration) {
    return (
      <AuthShell
        title="Registration is closed"
        subtitle="This community is not accepting new registrations at the moment."
        footer={<AuthLink href="/login">Back to sign in</AuthLink>}
      >
        <p className="help-text">
          If you were expecting to join, ask whoever invited you to open
          registration or to create your account for you.
        </p>
      </AuthShell>
    );
  }

  const communityRoles = await getRoleSummaries("community");
  const options = communityRoles
    .filter((role) => role.openToRegistration)
    .map((role) => ({
      _id: role._id,
      name: role.name,
      description: role.description,
    }));

  // Mirrors what the action does: the configured default, or the lowest level
  // when none is set or the configured one has since been deleted.
  const defaultRole =
    communityRoles.find((role) => role._id === settings.defaultCommunityRoleId) ??
    communityRoles[0];

  return (
    <AuthShell
      title="Create an account"
      subtitle="Join the community. Every field is needed so members can be reached."
      footer={<AuthLink href="/login">Already have an account? Sign in</AuthLink>}
    >
      <RegisterForm
        roles={settings.allowRoleRequest ? options : []}
        defaultRoleName={defaultRole?.name ?? ""}
        needsApproval={!settings.autoApproveRegistrations}
        verifiesEmail={settings.requireEmailVerification}
      />
    </AuthShell>
  );
}
