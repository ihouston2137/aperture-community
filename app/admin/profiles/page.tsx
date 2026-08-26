import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { normalizeBioType } from "@/lib/bio-types";
import { connectDB } from "@/lib/db";
import { ensureMemberProfiles } from "@/lib/member-profiles";
import { Bio, User } from "@/lib/models";

import { ProfileManager } from "./profile-manager";
import type { BioRecord } from "./bio-form";

export const metadata = { title: "Profiles" };

export default async function ProfilesPage() {
  await requirePermission("profiles.manage");
  await connectDB();
  // Accounts that predate profiles, or were made by a path that does not sync,
  // get theirs here rather than being quietly missing from this list.
  await ensureMemberProfiles();

  const bios = await Bio.find().sort({ name: 1 }).lean<any[]>();

  // The address of the account behind a member profile, so two people of the
  // same name can be told apart at a glance.
  const userIds = bios.map((bio) => String(bio.userId ?? "")).filter(Boolean);
  const accounts = await User.find({ _id: { $in: userIds } })
    .select("email")
    .lean<any[]>();
  const emailById = new Map(
    accounts.map((account) => [String(account._id), account.email ?? ""])
  );

  const records: BioRecord[] = bios.map((bio) => ({
    _id: String(bio._id),
    name: bio.name ?? "",
    slug: bio.slug ?? "",
    // Profiles saved under the older three-way split still hold `Author` or
    // `Model`; both are people.
    type: normalizeBioType(bio.type),
    membership: bio.membership ?? "",
    title: bio.title ?? "",
    location: bio.location ?? "",
    description: bio.description ?? "",
    headshotMediaId: bio.headshotMediaId ?? "",
    headshotUrl: bio.headshotUrl ?? "",
    isPrimary: Boolean(bio.isPrimary),
    userId: bio.userId ? String(bio.userId) : "",
    accountEmail: emailById.get(String(bio.userId ?? "")) ?? "",
  }));

  return (
    <>
      <AdminHeader
        title="Profiles"
        subtitle="People and subjects referenced by stories and media, and the profile every member carries. Only a subject cannot be credited as an author."
      />

      <ProfileManager profiles={records} />
    </>
  );
}
