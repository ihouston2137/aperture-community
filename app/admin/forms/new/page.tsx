import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { createFormBlock, defaultFormSettings } from "@/lib/form-layout";
import { createRow, NEW_CONTAINER_PADDING } from "@/lib/page-layout";

import { FormBuilder } from "../form-builder";

export const metadata = { title: "New form" };

export default async function NewFormPage() {
  await requirePermission("forms.manage");
  const sources = await loadBuilderSources();

  // A new form starts with one row holding a submit button so it is valid.
  const row = createRow(1, NEW_CONTAINER_PADDING);
  row.columns[0].blocks = [createFormBlock("submit") as never];

  return (
    <FormBuilder
      form={{
        title: "",
        slug: "",
        status: "draft",
        layout: [row],
        settings: defaultFormSettings,
      }}
      sources={sources}
    />
  );
}
