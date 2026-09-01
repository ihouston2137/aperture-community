import { notFound, redirect } from "next/navigation";

import { FormShell } from "@/components/form-shell";
import { SiteChrome } from "@/components/site-chrome";
import { guardContent } from "@/lib/content-guard";
import { connectDB } from "@/lib/db";
import { normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import { buildSitting, normalizeTestSettings, sittingLayout } from "@/lib/form-test";
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
  // A test has its own address, its own heading and its own rules about who
  // may sit it. Sending it here would render one thing under the other's name.
  if (form.kind === "test") redirect(`/test/${slug}`);

  await guardContent("form", String(form._id), `/forms/${slug}`);

  /*
   * A test is drawn rather than laid out.
   *
   * Its questions live in `test`, not in `layout`, and which of them get asked
   * is decided here — per request, so two people opening the same link are not
   * handed the same paper. The answer key stays on the server; only the
   * questions and which variants were drawn go to the browser.
   */
  const isTest = form.kind === "test";
  const test = isTest ? normalizeTestSettings(form.test) : null;
  const served = test ? buildSitting(test) : [];
  const settings = normalizeFormSettings(form.settings);

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
            layout: isTest
              ? sittingLayout(served, settings.submitLabel)
              : normalizeFormLayout(form.layout),
            settings: (form.settings ?? {}) as Record<string, unknown>,
            sitting: served.map(({ questionId, variantId }) => ({
              questionId,
              variantId,
            })),
          }}
        />
      </div>
    </SiteChrome>
  );
}
