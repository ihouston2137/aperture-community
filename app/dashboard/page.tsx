import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { fullName, getRoleSummaries, splitRoles } from "@/lib/members";
import { User } from "@/lib/models";
import { communityPermissionGroups, membershipStatusLabels } from "@/lib/permissions";
import { getSession } from "@/lib/session";

import { ProfileForm } from "./profile-form";

export const metadata = { title: "Your dashboard" };

/**
 * What a member sees when they sign in: who the community has them down as,
 * what their level opens up, and their own details to correct.
 *
 * It is the member-side counterpart to `/admin` — everything here is about the
 * one account reading it, and nothing on it can change what that account is
 * allowed to reach.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  await connectDB();
  const record = await User.findById(session.userId).lean<any>();
  // The account was deleted while the cookie lived on.
  if (!record) redirect("/login");

  const { permissions, membershipStatus, isAdministrator } = await getUserAccess(
    session.userId
  );

  // A suspended or unapproved member is told where they stand rather than shown
  // a dashboard for a membership they do not currently have.
  if (membershipStatus !== "active" || record.isActive === false) {
    return (
      <SiteChrome>
        <div className="member-page">
          <h1 className="member-title">Your membership</h1>
          <p className="member-lede">
            {membershipStatus === "pending"
              ? "Your registration is waiting to be approved. You will get an email when it is."
              : "This account cannot use the portal at the moment. Contact an administrator."}
          </p>
        </div>
      </SiteChrome>
    );
  }

  const roles = await getRoleSummaries();
  const { community, management } = splitRoles(
    (record.roleIds ?? []).map(String),
    roles
  );

  const canManage = permissions.some(
    (permission) => !permission.startsWith("community.")
  );

  // What their level opens up, in the same words the Administrator saw when
  // they granted it — one vocabulary, described once.
  const granted = communityPermissionGroups
    .map((group) => ({
      label: group.label,
      permissions: group.permissions.filter((permission) =>
        permissions.includes(permission.key)
      ),
    }))
    .filter((group) => group.permissions.length > 0);

  return (
    <SiteChrome>
      <div className="member-page">
        <header className="member-header">
          <h1 className="member-title">
            {record.firstName ? `Hello, ${record.firstName}` : "Your dashboard"}
          </h1>
          <p className="member-lede">
            {community.length > 0
              ? `You are a ${community.map((role) => role.name).join(", ")} of this community.`
              : "You do not hold a membership level yet."}
          </p>
        </header>

        <div className="member-grid">
          <section className="member-card">
            <h2 className="member-card-title">Membership</h2>
            <dl className="member-facts">
              <dt>Level</dt>
              <dd>
                {community.length > 0
                  ? community.map((role) => role.name).join(", ")
                  : "None assigned"}
              </dd>

              <dt>Status</dt>
              <dd>{membershipStatusLabels[membershipStatus]}</dd>

              <dt>Member since</dt>
              <dd>
                {record.registeredAt || record.createdAt
                  ? new Date(record.registeredAt ?? record.createdAt).toLocaleDateString()
                  : "—"}
              </dd>

              {management.length > 0 ? (
                <>
                  <dt>Manages</dt>
                  <dd>{management.map((role) => role.name).join(", ")}</dd>
                </>
              ) : null}
            </dl>

            {community[0]?.description ? (
              <p className="member-note">{community[0].description}</p>
            ) : null}
          </section>

          <section className="member-card">
            <h2 className="member-card-title">What your level opens up</h2>
            {granted.length === 0 ? (
              <p className="member-note">
                Your level does not open anything up yet. An administrator decides
                what each level can reach.
              </p>
            ) : (
              <ul className="member-grants">
                {granted.map((group) => (
                  <li key={group.label}>
                    <strong>{group.label}</strong>
                    <ul>
                      {group.permissions.map((permission) => (
                        <li key={permission.key}>{permission.label}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            {isAdministrator ? (
              <p className="member-note">
                As an Administrator you reach every part of the portal regardless
                of the level you hold.
              </p>
            ) : null}
          </section>

          <section className="member-card member-card-wide">
            <h2 className="member-card-title">Your details</h2>
            <ProfileForm
              member={{
                firstName: record.firstName ?? "",
                lastName: record.lastName ?? "",
                email: record.email ?? "",
                phone: record.phone ?? "",
              }}
              canEdit={permissions.includes("community.profile")}
              emailVerified={Boolean(record.emailVerifiedAt)}
            />
          </section>

          <section className="member-card member-card-wide">
            <h2 className="member-card-title">Account</h2>
            <div className="member-actions">
              <Link href="/admin/change-password" className="btn btn-sm">
                Change password
              </Link>
              {canManage ? (
                <Link href="/admin" className="btn btn-sm">
                  Site admin
                </Link>
              ) : null}
            </div>
            <p className="member-note">
              Signed in as {fullName(record)} ({record.email}).
            </p>
          </section>
        </div>
      </div>
    </SiteChrome>
  );
}
