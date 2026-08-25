import Link from "next/link";

import { AdminHeader, Panel } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { listMenus } from "@/lib/menus";

import { NewMenuForm } from "./new-menu-form";

export const metadata = { title: "Menus" };

/**
 * Every menu on the site: the header, and any built to be placed on a page.
 *
 * Its own screen rather than a tab of Appearance, because a menu is now more
 * than a list of links — each item carries who may see it, and that answer also
 * decides who may reach the content behind it.
 */
export default async function MenusPage() {
  await requirePermission("siteContent.manage");
  const menus = await listMenus();

  return (
    <>
      <AdminHeader
        title="Menus"
        subtitle="Navigation for the site header, and named menus a page can place with a menu block."
      />

      <Panel title="Menus">
        <ul className="admin-list">
          {menus.map((menu) => {
            const groups = menu.items.filter((item) => item.kind === "label").length;
            const links = menu.items.length - groups;
            const restricted = menu.items.filter(
              (item) => item.visibility.mode !== "public"
            ).length;

            return (
              <li key={menu._id} className="admin-list-item">
                <div>
                  <h3>{menu.name}</h3>
                  <div className="admin-list-meta">
                    {links} link{links === 1 ? "" : "s"}
                    {groups > 0 ? ` · ${groups} group${groups === 1 ? "" : "s"}` : ""}
                    {restricted > 0 ? ` · ${restricted} restricted` : ""}
                    {menu.isSite ? "" : ` · slug: ${menu.slug}`}
                  </div>
                </div>

                {menu.isSite ? <span className="badge">site header</span> : null}

                <div className="admin-list-actions">
                  <Link href={`/admin/menus/${menu._id}`} className="btn btn-sm">
                    Edit
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="New menu">
        <p className="help-text" style={{ marginTop: "-0.35rem" }}>
          A menu you build here is placed on a page with the menu block, as a
          list or a dropdown.
        </p>
        <NewMenuForm />
      </Panel>
    </>
  );
}
