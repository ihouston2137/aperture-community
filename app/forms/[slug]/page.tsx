import { notFound } from "next/navigation";

import { FormShell } from "@/components/form-shell";
import { SiteChrome } from "@/components/site-chrome";
import { guardContent } from "@/lib/content-guard";
import { connectDB } from "@/lib/db";
import { normalizeFormLayout } from "@/lib/form-layout";
import { FormDefinition } from "@/lib/models";

async function findForm(slug: string) {
  await connectDB();
  return FormDefinition.findOne({ slug, status: "published" }).lean<any>();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await findForm(slug);
  return form ? { title: form.title } : {};
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await findForm(slug);
  if (!form) notFound();

  // A form can be linked in the navigation and can carry a rule of its own, so
  // it is guarded like every other kind of content — otherwise a members-only
  // form would be a members-only *link* to a public form.
  await guardContent("form", String(form._id), `/forms/${slug}`);

  return (
    <SiteChrome>
      <div className="page-shell">
        <FormShell
          form={{
            id: String(form._id),
            title: form.title ?? "",
            slug: form.slug ?? "",
            // Normalizing on read keeps rich text sanitized, rem-sized and
            // free of non-breaking spaces without waiting for a re-save.
            layout: normalizeFormLayout(form.layout),
            settings: (form.settings ?? {}) as Record<string, unknown>,
          }}
        />
      </div>
    </SiteChrome>
  );
}
