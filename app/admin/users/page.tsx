import Link from "next/link";

import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { getRoleSummaries } from "@/lib/members";
import { loadUserPage, readUserQuery } from "@/lib/user-query";

import { UserManager, type RoleOption, type UserRecord } from "./user-manager";

export const metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requirePermission("users.manage");

  // The whole list state lives in the URL, so a filtered view can be linked to
  // and the browser's back button steps through it.
  const query = readUserQuery(await searchParams);
  const [page, roles] = await Promise.all([loadUserPage(query), getRoleSummaries()]);

  const userRecords: UserRecord[] = page.users.map((user) => ({
    ...user,
    isSelf: user._id === session.userId,
  }));

  const roleOptions: RoleOption[] = roles.map((role) => ({
    _id: role._id,
    name: role.name,
    kind: role.kind,
  }));

  return (
    <>
      <AdminHeader
        title="Users"
        subtitle="Every account on the site: who can sign in, what they hold, and how to reach them."
        actions={
          <Link href="/admin/roles" className="btn btn-sm">
            Roles
          </Link>
        }
      />

      <UserManager
        users={userRecords}
        roles={roleOptions}
        query={query}
        total={page.total}
        overall={page.overall}
        page={page.page}
        pageCount={page.pageCount}
      />
    </>
  );
}
