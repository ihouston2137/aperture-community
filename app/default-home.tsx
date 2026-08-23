import Link from "next/link";

/**
 * Shown when no `SitePage` is flagged as the home page yet — a signpost into
 * the admin rather than a marketing placeholder.
 */
export function DefaultHome() {
  return (
    <div className="page-shell">
      <h1>Welcome to Aperture</h1>
      <p>
        No home page has been published yet. Sign in to the admin, build a page and
        mark it as the home page.
      </p>
      <p>
        <Link href="/admin" className="pb-button">
          Open the admin
        </Link>
      </p>
    </div>
  );
}
