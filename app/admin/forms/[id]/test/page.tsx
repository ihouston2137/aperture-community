import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeFormSettings } from "@/lib/form-layout";
import { normalizeTestSettings } from "@/lib/form-test";
import { FormDefinition } from "@/lib/models";

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
  const doc = await FormDefinition.findById(id).lean<any>();
  if (!doc) notFound();

  // An ordinary form has no answer key to edit; its own builder is the one to
  // be in, and sending it here would show an empty question list over a layout
  // that is still there.
  if (doc.kind !== "test") redirect(`/admin/forms/${id}/edit`);

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
    />
  );
}
