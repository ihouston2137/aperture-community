import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { memberMetadataTasks } from "@/lib/metadata";
import { getSession } from "@/lib/session";

import { MetadataForm } from "./metadata-form";

export const metadata = { title: "Your details" };

/**
 * The questions this community asks of its members, answered by them.
 *
 * Its own page rather than another card on the dashboard: a required group is
 * what a member is sent here for at sign-in, and being dropped onto a page of
 * everything else with the questions somewhere down it is not being asked.
 */
export default async function OwnMetadataPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  await connectDB();
  const { roleIds, membershipStatus, isActive } = await getUserAccess(
    session.userId
  );
  if (membershipStatus !== "active" || !isActive) redirect("/dashboard");

  const tasks = await memberMetadataTasks(session.userId, roleIds);
  const outstanding = tasks.reduce((total, task) => total + task.outstanding, 0);

  return (
    <SiteChrome>
      <div className="member-page">
        <header className="member-header">
          <h1 className="member-title">Your details</h1>
          <p className="member-lede">
            {tasks.length === 0
              ? "Nothing is being asked of you at the moment."
              : outstanding > 0
                ? `${outstanding} question${
                    outstanding === 1 ? "" : "s"
                  } still needs an answer.`
                : "Everything asked of you has been answered. You can change any of it here."}
          </p>
        </header>

        {tasks.length === 0 ? (
          <p className="member-note">
            <Link href="/dashboard">Back to your dashboard</Link>
          </p>
        ) : (
          <div className="member-stack">
            {tasks.map((task) => (
              <MetadataForm
                key={task.group._id}
                group={task.group}
                values={task.values}
              />
            ))}

            <p className="help-text">
              <Link href="/dashboard">Back to your dashboard</Link>
            </p>
          </div>
        )}
      </div>
    </SiteChrome>
  );
}
