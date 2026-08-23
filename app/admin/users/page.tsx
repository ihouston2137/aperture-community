import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Role, User } from "@/lib/models";
import { ADMINISTRATOR_ROLE_SLUG } from "@/lib/permissions";

import { RoleManager, type RoleRecord } from "./role-manager";
import { UserManager, type RoleOption, type UserRecord } from "./user-manager";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const [users, roles] = await Promise.all([
    User.find().sort({ email: 1 }).lean<any[]>(),
    Role.find().sort({ name: 1 }).lean<any[]>(),
  ]);

  const holdsRole = (user: any, roleId: unknown) =>
    (user.roleIds ?? []).some((id: any) => String(id) === String(roleId));

  const userRecords: UserRecord[] = users.map((user) => ({
    _id: String(user._id),
    email: user.email ?? "",
    name: user.name ?? "",
    isActive: user.isActive !== false,
    mustChangePassword: Boolean(user.mustChangePassword),
    roleIds: (user.roleIds ?? []).map(String),
    isSelf: String(user._id) === session.userId,
  }));

  const roleRecords: RoleRecord[] = roles.map((role) => ({
    _id: String(role._id),
    name: role.name ?? "",
    slug: role.slug ?? "",
    description: role.description ?? "",
    permissions: Array.isArray(role.permissions) ? role.permissions.map(String) : [],
    isSystem: Boolean(role.isSystem),
    isAdministrator: role.slug === ADMINISTRATOR_ROLE_SLUG,
    userCount: users.filter((user) => holdsRole(user, role._id)).length,
  }));

  const roleOptions: RoleOption[] = roleRecords.map((role) => ({
    _id: role._id,
    name: role.name,
  }));

  return (
    <>
      <AdminHeader
        title="Users & roles"
        subtitle="Control who can sign in and what each person can manage."
      />

      <UserManager users={userRecords} roles={roleOptions} />
      <RoleManager roles={roleRecords} />
    </>
  );
}
