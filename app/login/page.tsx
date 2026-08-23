import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/admin");

  const params = await searchParams;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        background: "var(--admin-bg)",
        color: "var(--admin-text)",
        padding: "1.5rem",
      }}
    >
      {/* The reset signs the account out, so this is the only report the
          development reset gets to make. */}
      {params.reset ? (
        <p className="admin-subtitle" style={{ margin: 0 }}>
          The site was reset to a clean install. Sign in with the seed
          administrator account.
        </p>
      ) : null}

      <LoginForm />
    </div>
  );
}
