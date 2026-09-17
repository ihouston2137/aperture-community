import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { getPwaSettings } from "@/lib/pwa";
import { getSiteContent } from "@/lib/site-settings";

import { PwaForm } from "./pwa-form";

export const metadata = { title: "App & icons" };

/**
 * What this site is called, and how it behaves, once somebody has installed it.
 *
 * The settings here are the whole of `/manifest.webmanifest` plus the two tags
 * iOS reads instead of it. Nothing is generated at build time, so an icon
 * uploaded here is the icon the next person installs.
 */
export default async function PwaSettingsPage() {
  await requirePermission("design.pwa");

  const [settings, content] = await Promise.all([
    getPwaSettings(),
    getSiteContent(),
  ]);

  return (
    <>
      <AdminHeader
        title="App & icons"
        subtitle="How this site behaves when somebody puts it on a home screen."
      />
      <PwaForm settings={settings} siteName={content.metaTitle} />
    </>
  );
}
