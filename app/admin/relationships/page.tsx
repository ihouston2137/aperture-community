import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { getRelationships } from "@/lib/relationships";

import { RelationshipManager, type MemberOption } from "./relationship-manager";

export const metadata = { title: "Relationships" };

export default async function RelationshipsPage() {
  await requirePermission("members.relationships");
  await connectDB();

  const [users, roles, relationships] = await Promise.all([
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email roleIds")
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean<any[]>(),
    getRoleSummaries("community"),
    getRelationships(),
  ]);

  const seedEmail = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();

  const members: MemberOption[] = users
    .filter((user) => {
      // The account the site was seeded with is staff, not somebody anybody is
      // related to.
      if (seedEmail && String(user.email ?? "").toLowerCase() === seedEmail) {
        return false;
      }
      // Only people who hold a membership level. A relationship is shown on a
      // directory entry, and an account without a level has none — so offering
      // one here would be offering a link nobody could ever see.
      return roles.some((role) => (user.roleIds ?? []).map(String).includes(role._id));
    })
    .map((user) => {
      const levels = roles
        .filter((role) => (user.roleIds ?? []).map(String).includes(role._id))
        .map((role) => role.name);

      return {
        // Full names here: this screen is behind a management permission and is
        // never public, and two members can share the first-name-and-initial
        // the directory shows them by.
        _id: String(user._id),
        name: fullName(user),
        title: levels.join(", "),
      };
    });

  return (
    <>
      <AdminHeader
        title="Relationships"
        subtitle="Link one member to others — a parent to their children, a mentor to the people they mentor. Everybody named sees the link on their directory entry."
      />

      <RelationshipManager relationships={relationships} members={members} />
    </>
  );
}
