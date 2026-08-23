"use client";

import {
  colorOverrideStyle,
  emptyColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import type { PageLayout } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-sources";

import { LayoutView } from "./page-blocks";

/** Public renderer for page-builder layouts. */
export function PageRenderer({
  layout,
  sources,
  colors = emptyColorOverrides,
}: {
  layout: PageLayout;
  sources: PageSources;
  /** Redeclares the `--content-*` variables for this page only. */
  colors?: ColorOverrides;
}) {
  return (
    <LayoutView
      layout={layout}
      sources={sources}
      className="page-render"
      style={colorOverrideStyle(colors)}
    />
  );
}
