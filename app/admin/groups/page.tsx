import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getMemberGroups } from "@/lib/member-groups";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";

import { GroupManager, type MemberOption } from "./group-manager";

export const metadata = { title: "Groups" };

export default async function GroupsPage() {
  await requirePermission("members.groups");
  await connectDB();

  const [users, roles, groups] = await Promise.all([
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email roleIds")
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean<any[]>(),
    getRoleSummaries("community"),
    getMemberGroups(),
  ]);

  const seedEmail = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();

  const members: MemberOption[] = users
    .filter((user) => {
      // The account the site was seeded with is staff, not a member of anything.
      if (seedEmail && String(user.email ?? "").toLowerCase() === seedEmail) {
        return false;
      }
      return roles.some((role) => (user.roleIds ?? []).map(String).includes(role._id));
    })
    .map((user) => ({
      // Full names, as on the relationships screen: this is behind a management
      // permission and never public.
      _id: String(user._id),
      name: fullName(user),
      title: roles
        .filter((role) => (user.roleIds ?? []).map(String).includes(role._id))
        .map((role) => role.name)
        .join(", "),
    }));

  return (
    <>
      <AdminHeader
        title="Groups"
        subtitle="Named sets of members — a committee, a year group, a working party. A group says who is in it; what they can reach is still their membership level."
      />

      <GroupManager groups={groups} members={members} />
    </>
  );
}
