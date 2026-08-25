import Link from "next/link";

import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { ADMINISTRATOR_ROLE_SLUG } from "@/lib/permissions";

import { RoleManager, type RoleRecord } from "./role-manager";

export const metadata = { title: "Roles" };

/**
 * What the community is organised by: the membership levels members wear, and
 * the management roles that grant access to this admin.
 *
 * Separate from the user list because they are edited on different rhythms —
 * roles are set up once and revisited rarely, while accounts are worked through
 * every day.
 */
export default async function RolesPage() {
  await requirePermission("users.manage");
  await connectDB();

  const roles = await getRoleSummaries();

  // One pass over the accounts rather than a count query per role.
  const counts = new Map<string, number>();
  const holders = await User.find().select("roleIds").lean<any[]>();
  for (const user of holders) {
    for (const roleId of user.roleIds ?? []) {
      const key = String(roleId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const roleRecords: RoleRecord[] = roles.map((role) => ({
    ...role,
    isAdministrator: role.slug === ADMINISTRATOR_ROLE_SLUG,
    userCount: counts.get(role._id) ?? 0,
  }));

  return (
    <>
      <AdminHeader
        title="Roles"
        subtitle="Membership levels and management roles: what people are called, and what each of them can reach."
        actions={
          <Link href="/admin/users" className="btn btn-sm">
            Users
          </Link>
        }
      />

      <RoleManager roles={roleRecords} />
    </>
  );
}
