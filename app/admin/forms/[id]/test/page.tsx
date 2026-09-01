import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getEmailSettings } from "@/lib/email";
import { normalizeFormSettings } from "@/lib/form-layout";
import { normalizeTestSettings } from "@/lib/form-test";
import { CustomStyle, FontFamily, FormDefinition } from "@/lib/models";

import { TestBuilder } from "../../test-builder";

export const metadata = { title: "Edit test" };

export default async function EditTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("forms.manage");
  const { id } = await params;

  await connectDB();

  /*
   * Whether the site can post anything at all, so the result-email settings
   * can say so rather than looking as though they work.
   */
  const { enabled, host, fromEmail } = await getEmailSettings();
  const emailReady = enabled && Boolean(host) && Boolean(fromEmail);

  const doc = await FormDefinition.findById(id).lean<any>();
  if (!doc) notFound();

  // An ordinary form has no answer key to edit; its own builder is the one to
  // be in, and sending it here would show an empty question list over a layout
  // that is still there.
  if (doc.kind !== "test") redirect(`/admin/forms/${id}/edit`);

  // Just the two the style folds need — the full builder sources are a page's
  // worth of queries for controls that set type and colour.
  const [fontDocs, styleDocs] = await Promise.all([
    FontFamily.find().select("family").sort({ family: 1 }).lean<any[]>(),
    CustomStyle.find().select("name slug style").sort({ name: 1 }).lean<any[]>(),
  ]);

  const fonts = fontDocs.map((font) => String(font.family ?? ""));
  const savedStyles = styleDocs.map((style) => ({
    _id: String(style._id),
    name: style.name ?? "",
    slug: style.slug ?? "",
    style: style.style ?? {},
  }));

  return (
    <TestBuilder
      test={{
        _id: String(doc._id),
        title: doc.title ?? "",
        slug: doc.slug ?? "",
        status: doc.status ?? "draft",
        settings: normalizeFormSettings(doc.settings),
        test: normalizeTestSettings(doc.test),
      }}
      fonts={fonts}
      savedStyles={savedStyles}
      emailReady={emailReady}
    />
  );
}
