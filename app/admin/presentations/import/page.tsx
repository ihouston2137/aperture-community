import { requirePermission } from "@/lib/access";
import { AdminHeader } from "@/components/admin-ui";
import { PdfImportForm } from "./pdf-import-form";
export default async function Page() {
  await requirePermission("publications.manage");
  return <><AdminHeader title="Import PDF" subtitle="Create a presentation from a PDF document." /><PdfImportForm /></>;
}
