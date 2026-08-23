import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { CalendarSettings, CalendarStyle } from "@/lib/models";

import { deleteCalendarStyleAction, setDefaultCalendarStyleAction } from "./actions";

export const metadata = { title: "Calendar styles" };

export default async function CalendarStylesPage() {
  await requirePermission("calendar.manage");
  await connectDB();

  const [docs, settings] = await Promise.all([
    CalendarStyle.find().sort({ name: 1 }).lean<any[]>(),
    CalendarSettings.findOne().select("defaultStyleId").lean<any>(),
  ]);

  const defaultId = String(settings?.defaultStyleId ?? "");

  return (
    <>
      <AdminHeader
        title="Calendar styles"
        subtitle="How a calendar looks, saved by name. A calendar block picks one; the default is used when it picks none."
        actions={
          <>
            <Link href="/admin/calendar" className="btn">
              Back to calendar
            </Link>
            <Link href="/admin/calendar/styles/new" className="btn btn-primary">
              New style
            </Link>
          </>
        }
      />

      {docs.length === 0 ? (
        <EmptyState
          message="No calendar styles yet — calendars use the built-in look."
          actionHref="/admin/calendar/styles/new"
          actionLabel="Create a style"
        />
      ) : (
        <ul className="admin-list">
          {docs.map((doc) => {
            const id = String(doc._id);
            return (
              <li key={id} className="admin-list-item">
                <div>
                  <h3>{doc.name}</h3>
                  <div className="admin-list-meta">
                    {id === defaultId ? "Site default" : `/${doc.slug ?? ""}`}
                  </div>
                </div>
                {id === defaultId ? <span className="badge badge-published">default</span> : null}
                <div className="admin-list-actions">
                  <Link className="btn btn-sm" href={`/admin/calendar/styles/${id}/edit`}>
                    Edit
                  </Link>
                  {id === defaultId ? null : (
                    <form action={setDefaultCalendarStyleAction}>
                      <input type="hidden" name="id" value={id} />
                      <button type="submit" className="btn btn-sm">
                        Make default
                      </button>
                    </form>
                  )}
                  <form action={deleteCalendarStyleAction}>
                    <input type="hidden" name="id" value={id} />
                    <button type="submit" className="btn btn-danger btn-sm">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
