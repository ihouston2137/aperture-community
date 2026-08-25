import { AuthLink, AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Registration received" };

/**
 * Where a registration lands when a human has to approve it. Deliberately says
 * nothing about who approves or how long it takes — that is the community
 * organiser's message to send, not the software's promise to make.
 */
export default function RegistrationPendingPage() {
  return (
    <AuthShell
      title="Thanks — you are on the list"
      subtitle="Your registration has been received and is waiting to be approved."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <p className="help-text">
        You will get an email when your membership is approved, and you can sign
        in from then on. There is nothing else you need to do.
      </p>
    </AuthShell>
  );
}
