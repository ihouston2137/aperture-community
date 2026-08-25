import { AuthLink, AuthShell } from "@/components/auth-shell";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a six-digit code, then you can choose a new password."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
