"use client";

import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import type { LucideProps } from "lucide-react";

/**
 * Any icon in the Lucide library, chosen at runtime.
 *
 * `DynamicIcon` imports the one icon that is asked for rather than pulling all
 * ~1,760 into the bundle, which matters because publication blocks render on
 * public pages. The curated set in `components/icons.tsx` stays as it is: it
 * serves the admin's own chrome, where a fixed handful is the right thing.
 */

const NAMES = new Set<string>(iconNames);

/**
 * Lucide's runtime names are kebab-case (`arrow-down`), but blocks saved before
 * this used the component names (`ArrowDown`). Both resolve, so nothing that
 * already picked an icon loses it.
 */
export function toIconName(value: string | undefined): IconName | null {
  if (!value) return null;
  if (NAMES.has(value)) return value as IconName;

  const kebab = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
  return NAMES.has(kebab) ? (kebab as IconName) : null;
}

export { iconNames };
export type { IconName };

export function LucideIconView({
  name,
  ...props
}: { name?: string } & Omit<LucideProps, "ref">) {
  const resolved = toIconName(name) ?? "star";
  // Keyed so switching icons swaps the component rather than reusing the
  // previous one while its module loads.
  return <DynamicIcon key={resolved} name={resolved} {...props} />;
}
