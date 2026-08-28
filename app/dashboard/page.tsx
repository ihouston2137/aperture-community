import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getMemberProfile } from "@/lib/member-profiles";
import { memberMetadataTasks } from "@/lib/metadata";
import { fullName } from "@/lib/members";
import { User } from "@/lib/models";
import { getSession } from "@/lib/session";

import { AccountCard } from "./account-card";

export const metadata = { title: "Your dashboard" };

/**
 * What a member sees when they sign in: their own account, and the way in to
 * changing it.
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

  const { permissions, membershipStatus, roleIds } = await getUserAccess(
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

  // Every member carries a profile; this creates it the first time one who
  // predates them signs in. An Administrator is staff and gets none, so this
  // can be empty.
  const bio = await getMemberProfile(session.userId);

  // What the community has asked of them, and how much of it is still owed.
  const tasks = await memberMetadataTasks(session.userId, roleIds);
  const outstanding = tasks.reduce((total, task) => total + task.outstanding, 0);

  return (
    <SiteChrome>
      <div className="member-page">
        <header className="member-header">
          <h1 className="member-title">
            {record.firstName ? `Hello, ${record.firstName}` : "Your dashboard"}
          </h1>
        </header>

        {tasks.length > 0 ? (
          <section
            className={`member-card${outstanding > 0 ? " is-flagged" : ""}`}
            style={{ marginBottom: "1.25rem" }}
          >
            <h2 className="member-card-title">Your details</h2>
            <p className="member-note">
              {outstanding > 0
                ? `${outstanding} question${
                    outstanding === 1 ? "" : "s"
                  } asked of you still needs an answer.`
                : "Everything asked of you has been answered."}
            </p>
            <div className="member-actions">
              <Link href="/dashboard/metadata" className="btn btn-sm">
                {outstanding > 0 ? "Answer them" : "Review your answers"}
              </Link>
            </div>
          </section>
        ) : null}

        <AccountCard
          member={{
            firstName: record.firstName ?? "",
            lastName: record.lastName ?? "",
            email: record.email ?? "",
            phone: record.phone ?? "",
          }}
          bio={
            bio
              ? {
                  name: bio.name ?? "",
                  membership: bio.membership ?? "",
                  title: bio.title ?? "",
                  location: bio.location ?? "",
                  description: bio.description ?? "",
                  headshotMediaId: bio.headshotMediaId ?? "",
                  headshotUrl: bio.headshotUrl ?? "",
                }
              : null
          }
          canEdit={permissions.includes("community.profile")}
          emailVerified={Boolean(record.emailVerifiedAt)}
          signedInAs={`${fullName(record)} (${record.email})`}
        />
      </div>
    </SiteChrome>
  );
}
