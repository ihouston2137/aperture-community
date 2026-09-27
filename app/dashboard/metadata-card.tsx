import Link from "next/link";
import type { MemberMetadataTask } from "@/lib/metadata";
import { metadataDashboardSummary } from "@/lib/metadata-dashboard";

export function MetadataCard({ task }: { task: MemberMetadataTask }) {
  const { group } = task;
  if (!group.showOnDashboard) return null;
  const summary = metadataDashboardSummary(group, task.entries);
  return (
    <section className="member-card dashboard-metadata-card" aria-labelledby={`metadata-title-${group._id}`}>
      <div className="dashboard-metadata-heading">
        <h2 id={`metadata-title-${group._id}`} className="member-card-title">{group.name}</h2>
        {group.dashboardShowPercent && <strong className="dashboard-metadata-percent">{summary.percent}% complete</strong>}
      </div>
      {group.description && <p className="member-note">{group.description}</p>}
      {group.dashboardShowPercent && <>
        <progress className="dashboard-metadata-progress" value={summary.complete} max={summary.total || 1} aria-label={`${group.name} completion`} />
        <p className="member-note">{summary.complete} of {summary.total} items complete</p>
      </>}
      {group.dashboardItems !== "none" && (
        summary.items.length ? <ul className="dashboard-metadata-items">
          {summary.items.map(item => <li key={item.id}>
            <div>
              {item.entryLabel && <span className="dashboard-metadata-entry">{item.entryLabel}</span>}
              <strong>{item.label}</strong>
              {item.complete && <p>{item.value}</p>}
            </div>
            <span className="dashboard-metadata-status" data-complete={item.complete}>{item.complete ? "Complete" : "Incomplete"}</span>
          </li>)}
        </ul> : <p className="member-note">{group.dashboardItems === "complete" ? "No completed items yet." : "No incomplete items."}</p>
      )}
      {group.managedBy === "member" ? <div className="member-actions">
        <Link href={`/dashboard/metadata#metadata-${group._id}`} className="btn btn-sm">{summary.complete < summary.total ? "Complete your details" : "Review your details"}</Link>
      </div> : null}
    </section>
  );
}
