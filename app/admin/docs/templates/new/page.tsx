import { requirePermission } from "@/lib/access";
import { emptyColorOverrides } from "@/lib/color-overrides";
import { defaultDocTemplateLayout } from "@/lib/doc-template-layout";

import { DocTemplateBuilder } from "../doc-template-builder";
import { loadDocTemplateSource } from "../template-source";

export const metadata = { title: "New doc template" };

export default async function NewDocTemplatePage() {
  await requirePermission("docs.manage");
  const source = await loadDocTemplateSource();

  return (
    <DocTemplateBuilder
      template={{
        name: "",
        slug: "",
        isDefault: false,
        // Start from the built-in layout so a new template is usable at once.
        layout: defaultDocTemplateLayout(),
        colors: emptyColorOverrides,
      }}
      sources={source.sources}
      docs={source.docs}
      initialDoc={source.initialDoc}
      tree={source.tree}
    />
  );
}
