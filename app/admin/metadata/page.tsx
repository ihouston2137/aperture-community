import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getMetadataGroups } from "@/lib/metadata";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";

import {
  MetadataManager,
  type RoleChoice,
  type UserChoice,
} from "./metadata-manager";

export const metadata = { title: "Member metadata" };

export default async function MetadataPage() {
  await requirePermission("members.metadata");
  await connectDB();

  const [groups, communityRoles, managementRoles, users] = await Promise.all([
    getMetadataGroups(),
    getRoleSummaries("community"),
    getRoleSummaries("management"),
    // Only active accounts can be named on a group: naming somebody who has
    // left as a reader of it grants nothing and reads as an oversight.
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email")
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean<any[]>(),
  ]);

  const roleChoices = (list: typeof communityRoles): RoleChoice[] =>
    list.map((role) => ({
      _id: role._id,
      name: role.name,
      permissions: role.permissions,
    }));

  const userChoices: UserChoice[] = users.map((user) => ({
    _id: String(user._id),
    name: fullName(user),
  }));

  return (
    <>
      <AdminHeader
        title="Member metadata"
        subtitle="What this community asks of its members, and what it keeps about them. A group is a set of questions put to everybody holding a membership level."
      />

      <MetadataManager
        groups={groups}
        communityRoles={roleChoices(communityRoles)}
        managementRoles={roleChoices(managementRoles)}
        users={userChoices}
      />
    </>
  );
}
