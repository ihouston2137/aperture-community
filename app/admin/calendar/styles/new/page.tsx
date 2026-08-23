import { requirePermission } from "@/lib/access";
import { emptyCalendarStyle } from "@/lib/calendar-style";

import { CalendarStyleEditor } from "../calendar-style-editor";
import { loadStyleEditorSource } from "../style-source";

export const metadata = { title: "New calendar style" };

export default async function NewCalendarStylePage() {
  await requirePermission("calendar.manage");
  const source = await loadStyleEditorSource();

  return (
    <CalendarStyleEditor
      style={emptyCalendarStyle()}
      // A slug the CSS can be scoped to before the record has one of its own.
      slug="preview"
      layouts={source.layouts}
      eventLayouts={source.eventLayouts}
      lightboxLayouts={source.lightboxLayouts}
      events={source.events}
      todayKey={source.todayKey}
      fonts={source.fonts}
      saved={false}
    />
  );
}
