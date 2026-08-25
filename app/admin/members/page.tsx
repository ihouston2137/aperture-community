import { AdminHeader, EmptyState, Panel } from "@/components/admin-ui";
import { requireAnyPermission } from "@/lib/access";
import { getAuthSettings } from "@/lib/auth-settings";
import { connectDB } from "@/lib/db";
import { getRoleSummaries, toMemberSummary } from "@/lib/members";
import { User } from "@/lib/models";

import { MemberDirectory } from "./member-directory";
import { PendingQueue } from "./pending-queue";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const { session, can } = await requireAnyPermission([
    "members.view",
    "members.approve",
  ]);
  await connectDB();

  const [users, roles, settings] = await Promise.all([
    User.find().sort({ lastName: 1, firstName: 1, email: 1 }).lean<any[]>(),
    getRoleSummaries("community"),
    getAuthSettings(),
  ]);

  const members = users
    .map((user) => toMemberSummary(user, roles))
    // Everyone with an account is a member of something; the ones with no level
    // at all are staff accounts and belong on the Users screen instead.
    .filter((member) => member.communityRoleIds.length > 0 || member.membershipStatus !== "active");

  const pending = members.filter((member) => member.membershipStatus === "pending");
  const roleOptions = roles.map((role) => ({ _id: role._id, name: role.name }));

  return (
    <>
      <AdminHeader
        title="Members"
        subtitle="Approve people who have registered, and set the level each member holds."
      />

      {roles.length === 0 ? (
        <Panel title="No membership levels yet">
          <EmptyState
            message="Registration has nothing to assign until at least one membership level exists."
            actionHref="/admin/roles"
            actionLabel="Add a membership level"
          />
        </Panel>
      ) : null}

      <PendingQueue
        members={pending}
        roles={roleOptions}
        defaultRoleId={settings.defaultCommunityRoleId}
        canApprove={can("members.approve")}
        autoApprove={settings.autoApproveRegistrations}
      />

      <MemberDirectory
        members={members.filter((member) => member.membershipStatus !== "pending")}
        roles={roleOptions}
        canApprove={can("members.approve")}
        currentUserId={session.userId}
      />
    </>
  );
}
