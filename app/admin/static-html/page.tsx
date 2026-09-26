import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { StaticHtml } from "@/lib/static-html-model";
import { StaticHtmlManager } from "./static-html-manager";

export const metadata = { title: "Static HTML" };

export default async function StaticHtmlPage() {
  await requirePermission("staticHtml.manage");
  await connectDB();
  const files = await StaticHtml.find().sort({ createdAt: -1 }).lean();
  return <>
    <AdminHeader title="Static HTML" subtitle="Publish a self-contained HTML file and share it as a project, report or special." />
    <StaticHtmlManager files={files.map(file => ({ slug: file._id, originalName: file.originalName }))} />
  </>;
}
