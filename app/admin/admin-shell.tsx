"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Builders and full-screen previews take over the whole window, so the admin
 * sidebar is hidden on those routes. Each builder provides its own exit link
 * back to the matching library.
 */
const FULL_SCREEN_ROUTES = [
  /^\/admin\/pages\/(new|[^/]+\/edit)$/,
  /^\/admin\/forms\/(new|[^/]+\/edit)$/,
  /^\/admin\/story-templates\/(new|[^/]+\/edit)$/,
  /^\/admin\/collections\/(new|[^/]+\/edit)$/,
  /^\/admin\/publications\/[^/]+\/(edit|preview)$/,
];

export function isFullScreenRoute(pathname: string): boolean {
  return FULL_SCREEN_ROUTES.some((pattern) => pattern.test(pathname));
}

export function AdminShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const fullScreen = isFullScreenRoute(usePathname());

  return (
    <div className={`admin-shell${fullScreen ? " is-fullscreen" : ""}`}>
      {sidebar}
      <main className="admin-main">{children}</main>
    </div>
  );
}
