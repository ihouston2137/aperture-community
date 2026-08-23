"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Reports one page view per navigation.
 *
 * App Router navigations do not reload the document, so a view has to be sent
 * on every path change rather than once per page load. The referrer is read
 * from `document.referrer`, which the browser only sets on a real document
 * load — on a client navigation the previous path is the referrer, and that is
 * internal traffic the classifier discards anyway.
 *
 * Fire-and-forget: nothing here reads the response or surfaces an error, since
 * a failed count is not something a visitor should ever learn about.
 */
/** One fire-and-forget post. Never surfaces an error to the reader. */
function send(body: Record<string, unknown>) {
  if (typeof window === "undefined" || navigator.webdriver) return;
  fetch("/api/analytics/collect", {
    method: "POST",
    body: JSON.stringify(body),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {
    // Offline, blocked by an extension, or the route is down. All fine.
  });
}

/**
 * Reports a collection image opened full screen.
 *
 * Only ids are sent. The name it is reported under — `Collection - Image` — is
 * built on the server from the stored records, so nothing a page sends can put
 * an invented row into a report.
 */
export function reportImageView(collectionId: string, mediaId: string) {
  if (!collectionId || !mediaId) return;
  send({
    kind: "image",
    collectionId,
    mediaId,
    url: window.location.pathname + window.location.search,
  });
}

export function AnalyticsBeacon() {
  const pathname = usePathname();
  // Strict Mode mounts effects twice in development, which would double every
  // count. The last reported address is what makes the send idempotent.
  const lastSent = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = window.location.pathname + window.location.search;
    if (lastSent.current === url) return;
    lastSent.current = url;

    send({ kind: "page", url, referrer: document.referrer || "" });
  }, [pathname]);

  return null;
}
