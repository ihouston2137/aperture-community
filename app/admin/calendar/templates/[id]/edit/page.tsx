import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { normalizeCalendarTemplateKind } from "@/lib/calendar";
import { normalizeCalendarTemplateLayout } from "@/lib/calendar-slot-layout";
import { connectDB } from "@/lib/db";
import { CalendarTemplate } from "@/lib/models";

import { CalendarTemplateBuilder } from "../../calendar-template-builder";
import { loadTemplatePreviewSource } from "../../preview-source";

export const metadata = { title: "Edit calendar template" };

export default async function EditCalendarTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("calendar.manage");

  const { id } = await params;

  await connectDB();
  const doc = await CalendarTemplate.findById(id).lean<any>();
  if (!doc) notFound();

  const [sources, preview] = await Promise.all([
    loadBuilderSources(),
    loadTemplatePreviewSource(),
  ]);

  return (
    <CalendarTemplateBuilder
      template={{
        _id: String(doc._id),
        name: doc.name ?? "",
        kind: normalizeCalendarTemplateKind(doc.kind),
        layout: normalizeCalendarTemplateLayout(doc.layout),
      }}
      sources={sources}
      events={preview.events}
    />
  );
}
