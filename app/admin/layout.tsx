import Link from "next/link";

import { getAccessContext } from "@/lib/access";
import { ensureSeed } from "@/lib/seed";
import { logoutAction } from "@/app/actions";

import { AdminNavClient } from "./admin-nav-client";
import { AdminShell } from "./admin-shell";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureSeed();
  // `allowPasswordChange` keeps a forced password change from redirect-looping;
  // every individual page still calls requireSession()/requirePermission().
  const { session, permissions } = await getAccessContext(true);

  return (
    <AdminShell
      sidebar={
        <aside className="admin-sidebar">
          <div className="admin-logo">ADMIN</div>
          <AdminNavClient permissions={permissions} />

          <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
            <div className="admin-nav-group">Signed in</div>
            <div style={{ padding: "0 0.625rem 0.5rem", fontSize: "0.8125rem" }}>
              {session.name || session.email}
            </div>
            <Link href="/" className="admin-nav-link">
              View site
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="admin-nav-link" style={{ width: "100%", border: 0, background: "none" }}>
                Sign out
              </button>
            </form>
          </div>
        </aside>
      }
    >
      {children}
    </AdminShell>
  );
}
