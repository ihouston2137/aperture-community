"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminNavGroups } from "./admin-nav";

export function AdminNavClient({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();

  return (
    <>
      {adminNavGroups.map((group) => {
        const items = group.items.filter((item) => {
          if (item.permission && !permissions.includes(item.permission)) return false;
          if (item.anyPermission) {
            return item.anyPermission.some((permission) => permissions.includes(permission));
          }
          return true;
        });
        if (items.length === 0) return null;

        return (
          <div key={group.label}>
            <div className="admin-nav-group">{group.label}</div>
            {items.map((item) => {
              // `/admin` should not stay highlighted on every child route.
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-link${active ? " is-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
