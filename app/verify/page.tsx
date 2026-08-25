import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getPendingAuth } from "@/lib/session";
import { verificationCopy } from "@/lib/verification-types";

import { VerifyForm } from "./verify-form";

export const metadata = { title: "Enter your code" };

/**
 * The second factor, whichever flow asked for it. Reachable only while the
 * short-lived pending cookie is set — holding it is not a session, it only says
 * that a password or a registration form was already accepted.
 */
export default async function VerifyPage() {
  const pending = await getPendingAuth();
  if (!pending) redirect("/login");

  const copy = verificationCopy[pending.purpose];

  return (
    <AuthShell title={copy.heading} subtitle={copy.intro}>
      <VerifyForm email={pending.email} />
    </AuthShell>
  );
}
