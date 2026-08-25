import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { getRoleSummaries } from "@/lib/members";
import { getMenuById, loadMenuTargets } from "@/lib/menus";

import { MenuEditor } from "../menu-editor";

export const metadata = { title: "Edit menu" };

export default async function EditMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("siteContent.manage");

  const { id } = await params;
  const [menu, targets, roles] = await Promise.all([
    getMenuById(id),
    loadMenuTargets(),
    getRoleSummaries(),
  ]);
  if (!menu) notFound();

  return (
    <>
      <AdminHeader
        title={menu.isSite ? "Site header menu" : menu.name}
        subtitle="What each item points at, and who is allowed to see it."
        actions={
          <Link href="/admin/menus" className="btn btn-sm">
            All menus
          </Link>
        }
      />

      <MenuEditor
        menu={menu}
        targets={targets}
        roles={roles.map((role) => ({
          _id: role._id,
          name: role.name,
          kind: role.kind,
        }))}
      />
    </>
  );
}
