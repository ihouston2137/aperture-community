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

  /*
   * Inactive accounts included, deliberately.
   *
   * A group is a record of who was in something, and the 2019 committee does
   * not stop having had its members because they have since left. Leaving them
   * out would quietly empty every historical group as people move on, and
   * would stop anybody putting one together after the fact.
   */
  const [users, roles, groups] = await Promise.all([
    User.find()
      .select("_id firstName lastName name email roleIds isActive")
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
    .map((user) => {
      const heldRoles = roles
        .filter((role) => (user.roleIds ?? []).map(String).includes(role._id))
        .map((role) => role.name);

      return {
        // Full names, as on the relationships screen: this is behind a
        // management permission and never public.
        _id: String(user._id),
        name: fullName(user),
        // Said in the picker, because putting somebody who has left into a
        // group is usually deliberate and occasionally a mistake.
        title: [...heldRoles, user.isActive === false ? "inactive" : ""]
          .filter(Boolean)
          .join(", "),
        isInactive: user.isActive === false,
      };
    });

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
