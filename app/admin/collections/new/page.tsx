import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { loadCollectionPresets } from "@/lib/collections";
import {
  defaultCollectionDisplay,
  defaultCollectionHeader,
  defaultLightboxSettings,
  defaultOverlaySettings,
  emptyStyleSlot,
} from "@/lib/display-templates";
import { getAppearance, getSiteContent } from "@/lib/site-settings";

import { CollectionEditor } from "../collection-editor";

export const metadata = { title: "New collection" };

export default async function NewCollectionPage() {
  await requirePermission("collections.manage");
  const [sources, appearance, content, presets] = await Promise.all([
    loadBuilderSources(),
    getAppearance(),
    getSiteContent(),
    // A new collection can start out looking like one that already exists.
    loadCollectionPresets(),
  ]);

  return (
    <CollectionEditor
      collection={{
        name: "",
        slug: "",
        description: "",
        category: "",
        isPublic: false,
        imageIds: [],
        images: [],
        sortMode: "createdAt",
        sortDirection: "desc",
        customOrder: [],
        display: defaultCollectionDisplay,
        overlay: defaultOverlaySettings,
        lightbox: defaultLightboxSettings,
        mosaicSpans: {},
        header: defaultCollectionHeader,
        share: emptyStyleSlot,
        imageShare: emptyStyleSlot,
        pageStyle: emptyStyleSlot,
        imageStyle: emptyStyleSlot,
        imageExitStyle: emptyStyleSlot,
        imageContentStyle: emptyStyleSlot,
        featureImageId: "",
      }}
      presets={presets}
      styles={sources.styles}
      fonts={sources.fonts}
      chrome={{ appearance, content }}
    />
  );
}
