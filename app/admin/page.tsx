import Link from "next/link";

import { AdminHeader, Notice, Panel } from "@/components/admin-ui";
import { AnalyticsChart } from "@/components/admin/analytics-chart";
import { getAnalyticsOverview } from "@/lib/analytics/report";
import { getAccessContext } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { countPendingMembers } from "@/lib/members";
import { IS_DEV } from "@/lib/dev-reset";
import {
  Collection,
  FormSubmission,
  MediaAsset,
  SitePage,
  Story,
  Zine,
} from "@/lib/models";
import { permissionLabel } from "@/lib/permissions";

import { DevResetButton } from "./dev-reset-button";

const CARDS = [
  { href: "/admin/pages", label: "Pages", permission: "pages.manage" },
  { href: "/admin/stories", label: "Stories", permission: "stories.manage" },
  { href: "/admin/collections", label: "Collections", permission: "collections.manage" },
  { href: "/admin/media", label: "Media", permission: "media.view" },
  { href: "/admin/publications", label: "Publications", permission: "publications.manage" },
  { href: "/admin/forms/submissions", label: "Submissions", permission: "forms.submissions" },
  { href: "/admin/members", label: "Awaiting approval", permission: "members.approve" },
];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; passwordChanged?: string }>;
}) {
  const { session, permissions, can } = await getAccessContext();
  const params = await searchParams;

  await connectDB();
  const [pages, stories, collections, media, publications, submissions] =
    await Promise.all([
      SitePage.countDocuments(),
      Story.countDocuments(),
      Collection.countDocuments(),
      MediaAsset.countDocuments(),
      Zine.countDocuments(),
      FormSubmission.countDocuments({ status: "new" }),
    ]);

  // Only counted for someone who can act on it.
  const pendingMembers = can("members.approve") ? await countPendingMembers() : 0;

  // Only fetched for a reader who is allowed to see it.
  const analytics =
    can("analytics.view") || can("analytics.manage")
      ? await getAnalyticsOverview("hour", 48)
      : null;

  const counts: Record<string, number> = {
    "/admin/pages": pages,
    "/admin/stories": stories,
    "/admin/collections": collections,
    "/admin/media": media,
    "/admin/publications": publications,
    "/admin/forms/submissions": submissions,
    "/admin/members": pendingMembers,
  };

  return (
    <>
      <AdminHeader
        title={`Welcome back${session.name ? `, ${session.name}` : ""}`}
        subtitle="Everything on the site is managed from here."
      />

      {params.passwordChanged ? <Notice>Your password has been changed.</Notice> : null}
      {params.denied ? (
        <Notice variant="error">
          You do not have the “{permissionLabel(params.denied)}” permission.
        </Notice>
      ) : null}

      <div className="field-grid">
        {CARDS.filter((card) => can(card.permission)).map((card) => (
          <Link key={card.href} href={card.href} className="panel" style={{ display: "block" }}>
            <div className="admin-subtitle">{card.label}</div>
            <div style={{ fontSize: "2rem", fontWeight: 600 }}>{counts[card.href] ?? 0}</div>
          </Link>
        ))}
      </div>

      {can("analytics.view") || can("analytics.manage") ? (
        <Panel title="Last 48 hours">
          <AnalyticsChart
            points={analytics!.points}
            variant="bar"
            totals={analytics!.totals}
            caption={`Visitors, visits and page views by hour · ${analytics!.timezone}`}
          />
          {/* The figures in the legend are the whole 48 hours. Visitors is the
              one that cannot be counted exactly over an hourly window, so it
              says so rather than quietly overstating itself. */}
          {analytics!.visitorsExact ? null : (
            <p className="admin-subtitle" style={{ marginTop: "0.75rem" }}>
              Visitors adds the hourly buckets up, so someone returning later in
              the period is counted more than once. Daily and longer ranges count
              each visitor once.
            </p>
          )}
          <p className="admin-subtitle" style={{ marginTop: "0.75rem" }}>
            <Link href="/admin/analytics">Full analytics →</Link>
          </p>
        </Panel>
      ) : null}

      {permissions.length === 0 ? (
        <Panel title="No permissions assigned">
          <p className="admin-subtitle">
            Your account has no roles yet. Ask an administrator to assign one.
          </p>
        </Panel>
      ) : null}

      {/* Never rendered in a production build; the action refuses to run there
          regardless. */}
      {IS_DEV && can("users.manage") ? (
        <Panel title="Development tools">
          <p className="admin-subtitle" style={{ marginBottom: "0.75rem" }}>
            Deletes every page, story, collection, publication, form, profile and
            media record, empties the uploads folder, and recreates the seed
            administrator. Sample files in <code>public/images</code> are kept.
            This cannot be undone.
          </p>
          <DevResetButton />
        </Panel>
      ) : null}
    </>
  );
}
