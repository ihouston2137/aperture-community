import { redirect } from "next/navigation";

import { AuthLink, AuthShell } from "@/components/auth-shell";
import { safeNextPath } from "@/lib/auth-rules";
import { getAuthSettings } from "@/lib/auth-settings";
import { getSession } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/**
 * The messages a redirect can arrive with. Every flow that sends somebody back
 * to the sign-in form names one of these rather than inventing its own.
 */
const notices: Record<string, string> = {
  reset:
    "The site was reset to a clean install. Sign in with the seed administrator account.",
  registered: "Your account is ready. Sign in to get started.",
  passwordReset: "Your password has been changed. Sign in with the new one.",
  blocked: "That account cannot sign in at the moment. Contact an administrator.",
  next: "Sign in to see that page.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (session) redirect("/admin");

  const params = await searchParams;
  const { allowRegistration } = await getAuthSettings();
  // Set when a restricted page sent them here, so signing in returns them.
  const next = safeNextPath(params.next);

  const noticeKey = Object.keys(notices).find((key) => params[key]);

  return (
    <AuthShell
      title="Sign in"
      notice={
        noticeKey ? (
          <div className="admin-notice">{notices[noticeKey]}</div>
        ) : null
      }
      footer={
        <>
          <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
          {allowRegistration ? (
            <AuthLink href="/register">Create an account</AuthLink>
          ) : null}
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
