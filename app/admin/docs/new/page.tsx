import { requirePermission } from "@/lib/access";
import { AdminHeader } from "@/components/admin-ui";
import { connectDB } from "@/lib/db";
import { DocTemplate } from "@/lib/models";

import { DocSetForm } from "../doc-set-form";

export const metadata = { title: "New documentation" };

export default async function NewDocSetPage() {
  await requirePermission("docs.manage");
  await connectDB();

  const templates = await DocTemplate.find().select("name").sort({ name: 1 }).lean<any[]>();

  return (
    <>
      <AdminHeader
        title="New documentation"
        subtitle="A grouping of documents in an order."
      />
      <DocSetForm
        templates={templates.map((doc) => ({
          _id: String(doc._id),
          name: doc.name ?? "",
        }))}
      />
    </>
  );
}
