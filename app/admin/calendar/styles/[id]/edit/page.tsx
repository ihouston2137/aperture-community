import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { normalizeCalendarStyle } from "@/lib/calendar-style";
import { connectDB } from "@/lib/db";
import { CalendarStyle } from "@/lib/models";

import { CalendarStyleEditor } from "../../calendar-style-editor";
import { loadStyleEditorSource } from "../../style-source";

export const metadata = { title: "Edit calendar style" };

export default async function EditCalendarStylePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePermission("calendar.manage");

  const { id } = await params;
  const { saved } = await searchParams;

  await connectDB();
  const doc = await CalendarStyle.findById(id).lean<any>();
  if (!doc) notFound();

  const source = await loadStyleEditorSource();

  return (
    <CalendarStyleEditor
      style={normalizeCalendarStyle(doc)}
      styleId={String(doc._id)}
      slug={doc.slug ?? "preview"}
      layouts={source.layouts}
      eventLayouts={source.eventLayouts}
      lightboxLayouts={source.lightboxLayouts}
      events={source.events}
      todayKey={source.todayKey}
      fonts={source.fonts}
      saved={Boolean(saved)}
    />
  );
}
