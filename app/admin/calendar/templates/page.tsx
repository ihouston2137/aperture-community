import Link from "next/link";

import { AdminHeader, EmptyState, Panel } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import {
  CALENDAR_TEMPLATE_KINDS,
  CALENDAR_TEMPLATE_KIND_LABELS,
  normalizeCalendarTemplateKind,
} from "@/lib/calendar";
import { normalizeCalendarTemplateLayout } from "@/lib/calendar-slot-layout";
import { connectDB } from "@/lib/db";
import { CalendarTemplate } from "@/lib/models";

import { deleteCalendarTemplateAction } from "../actions";

export const metadata = { title: "Calendar layout templates" };

export default async function CalendarTemplatesPage() {
  await requirePermission("calendar.manage");
  await connectDB();

  const docs = await CalendarTemplate.find().sort({ name: 1 }).lean<any[]>();
  const templates = docs.map((doc) => ({
    _id: String(doc._id),
    name: doc.name ?? "",
    kind: normalizeCalendarTemplateKind(doc.kind),
    rowCount: normalizeCalendarTemplateLayout(doc.layout).length,
  }));

  return (
    <>
      <AdminHeader
        title="Calendar layout templates"
        subtitle="Reusable arrangements a calendar block can be started from. Applying one copies it — later edits here do not change pages already built."
        actions={
          <Link href="/admin/calendar" className="btn">
            Back to calendar
          </Link>
        }
      />

      {templates.length === 0 ? (
        <EmptyState message="No layout templates yet." />
      ) : null}

      {CALENDAR_TEMPLATE_KINDS.map((kind) => {
        const forKind = templates.filter((template) => template.kind === kind);

        return (
          <Panel key={kind} title={CALENDAR_TEMPLATE_KIND_LABELS[kind]}>
            <div className="panel-actions">
              <Link
                href={`/admin/calendar/templates/new?kind=${kind}`}
                className="btn btn-primary btn-sm"
              >
                New {CALENDAR_TEMPLATE_KIND_LABELS[kind].toLowerCase()} template
              </Link>
            </div>

            {forKind.length === 0 ? (
              <span className="help-text">None yet.</span>
            ) : (
              <ul className="admin-list">
                {forKind.map((template) => (
                  <li key={template._id} className="admin-list-item">
                    <div>
                      <h3>{template.name}</h3>
                      <div className="admin-list-meta">
                        {template.rowCount} row{template.rowCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="admin-list-actions">
                      <Link
                        className="btn btn-sm"
                        href={`/admin/calendar/templates/${template._id}/edit`}
                      >
                        Edit
                      </Link>
                      <form action={deleteCalendarTemplateAction}>
                        <input type="hidden" name="id" value={template._id} />
                        <button type="submit" className="btn btn-danger btn-sm">
                          Delete
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </>
  );
}
