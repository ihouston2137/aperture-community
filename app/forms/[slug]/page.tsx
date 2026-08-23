import { notFound } from "next/navigation";

import { FormShell } from "@/components/form-shell";
import { SiteChrome } from "@/components/site-chrome";
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
