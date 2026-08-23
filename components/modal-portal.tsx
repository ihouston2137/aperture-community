"use client";

import { createPortal } from "react-dom";

/**
 * Renders modal content into `document.body`.
 *
 * Admin panels such as the appearance settings and the media inspector are
 * `position: sticky`, which creates a stacking context. A `position: fixed`
 * dialog nested inside one is confined to it, so a sibling column painted later
 * covers the dialog no matter how high its z-index is. Portalling to the body
 * takes the dialog out of every such context.
 *
 * Callers render nothing until the dialog is opened, so this never runs during
 * server rendering; the guard is a safety net rather than a hydration fix.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
