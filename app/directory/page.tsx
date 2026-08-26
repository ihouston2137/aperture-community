import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { Bio, User } from "@/lib/models";
import { getRelationships, linksByMember } from "@/lib/relationships";
import { getSession } from "@/lib/session";

import { DirectoryList, type DirectoryEntry } from "./directory-list";

export const metadata = { title: "Member directory" };

/**
 * Who else is in the community.
 *
 * Members are shown by their full name — this is behind a sign-in and a
 * permission, never public — with what they have written about themselves.
 * Contact details are a separate permission from being able to look at all, so
 * a level can browse the directory without being handed everybody's phone
 * number.
 */
export default async function DirectoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { permissions, membershipStatus } = await getUserAccess(session.userId);

  if (membershipStatus !== "active") {
    return (
      <SiteChrome>
        <div className="member-page">
          <h1 className="member-title">Member directory</h1>
          <p className="member-lede">
            {membershipStatus === "pending"
              ? "Your registration is waiting to be approved."
              : "This account cannot use the portal at the moment."}
          </p>
        </div>
      </SiteChrome>
    );
  }

  if (!permissions.includes("community.directory")) {
    return (
      <SiteChrome>
        <div className="member-page">
          <h1 className="member-title">Member directory</h1>
          <p className="member-lede">
            Your membership level does not open the directory. An administrator
            decides what each level can reach.
          </p>
        </div>
      </SiteChrome>
    );
  }

  await connectDB();

  const [users, roles, bios, relationships] = await Promise.all([
    User.find({ isActive: { $ne: false }, membershipStatus: "active" })
      .select("_id firstName lastName name email phone roleIds")
      .lean<any[]>(),
    getRoleSummaries("community"),
    Bio.find({ userId: { $nin: ["", null] } }).lean<any[]>(),
    getRelationships(),
  ]);

  const bioByUser = new Map(bios.map((bio) => [String(bio.userId), bio]));

  // Only people who hold a level: an account that administers the site without
  // being a member of the community does not belong in a list of members.
  const listed = users.filter((user) =>
    roles.some((role) => (user.roleIds ?? []).map(String).includes(role._id))
  );

  const nameById = new Map(
    listed.map((user) => [String(user._id), fullName(user)])
  );
  const links = linksByMember(relationships, (id) => nameById.get(id) ?? "");

  const showContact = permissions.includes("community.directory.contact");

  const entries: DirectoryEntry[] = listed
    .map((user) => {
      const id = String(user._id);
      const bio = bioByUser.get(id);
      const held = roles.filter((role) =>
        (user.roleIds ?? []).map(String).includes(role._id)
      );

      return {
        _id: id,
        name: nameById.get(id) ?? "",
        title: bio?.title ?? "",
        levelIds: held.map((role) => role._id),
        levels: held.map((role) => role.name),
        location: bio?.location ?? "",
        description: bio?.description ?? "",
        headshotUrl: bio?.headshotUrl ?? "",
        email: showContact ? (user.email ?? "") : "",
        phone: showContact ? (user.phone ?? "") : "",
        links: links.get(id) ?? [],
        isSelf: id === session.userId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SiteChrome>
      <div className="member-page">
        <header className="member-header">
          <h1 className="member-title">Member directory</h1>
        </header>

        <DirectoryList
          entries={entries}
          levels={roles.map((role) => ({ _id: role._id, name: role.name }))}
          showContact={showContact}
        />
      </div>
    </SiteChrome>
  );
}
