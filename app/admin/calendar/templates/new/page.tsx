import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { normalizeCalendarTemplateKind } from "@/lib/calendar";
import {
  defaultEventTemplateLayout,
  defaultLightboxTemplateLayout,
} from "@/lib/calendar-slot-layout";

import { CalendarTemplateBuilder } from "../calendar-template-builder";
import { loadTemplatePreviewSource } from "../preview-source";

export const metadata = { title: "New calendar template" };

export default async function NewCalendarTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requirePermission("calendar.manage");

  const { kind: kindParam } = await searchParams;
  const kind = normalizeCalendarTemplateKind(kindParam);

  const [sources, preview] = await Promise.all([
    loadBuilderSources(),
    loadTemplatePreviewSource(),
  ]);

  return (
    <CalendarTemplateBuilder
      template={{
        name: "",
        kind,
        // Start from a usable arrangement rather than an empty canvas.
        layout:
          kind === "lightbox"
            ? defaultLightboxTemplateLayout()
            : defaultEventTemplateLayout(),
      }}
      sources={sources}
      events={preview.events}
    />
  );
}
