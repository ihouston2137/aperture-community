import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import {
  defaultLightboxSettings,
  defaultOverlaySettings,
  normalizeMetadataDisplay,
  resolveCollectionDisplay,
} from "@/lib/display-templates";
import { getSiteContent } from "@/lib/site-settings";

import { SiteDesignForm } from "./site-design-form";

export const metadata = { title: "Other settings" };

export default async function SiteDesignPage() {
  await requirePermission("design.site");
  const content = await getSiteContent();

  const templates = content.collectionTemplateDefaults as Record<string, unknown>;

  return (
    <>
      <AdminHeader
        title="Other settings"
        subtitle="Defaults that every collection inherits unless it overrides them."
      />
      <SiteDesignForm
        displayDefaults={resolveCollectionDisplay({}, content.collectionDisplayDefaults)}
        templateDefaults={{
          overlay: normalizeMetadataDisplay(templates.overlay, defaultOverlaySettings),
          lightbox: normalizeMetadataDisplay(templates.lightbox, defaultLightboxSettings),
        }}
      />
    </>
  );
}
