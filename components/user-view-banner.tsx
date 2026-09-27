import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { USER_VIEW_COOKIE } from "@/lib/user-view-token";
import { ReturnToAdministratorButton } from "./user-view-controls";

export async function UserViewBanner() {
  if (!(await cookies()).has(USER_VIEW_COOKIE)) return null;
  const session = await getSession();
  return <aside className="user-view-banner" aria-label="User view">
    <div>
      <strong>{session?.impersonatorId ? `Viewing as ${session.name || session.email}` : "User view expired or unavailable"}</strong>
      {session?.impersonatorId && <span> {session.email} · Changes affect this account. Applies to all tabs in this browser.</span>}
    </div>
    <ReturnToAdministratorButton />
  </aside>;
}
