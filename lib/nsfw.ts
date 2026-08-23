/**
 * Whether this site deals in sensitive media at all.
 *
 * Off, the whole notion disappears: no safe-mode toggle in the footer, no
 * sensitive flag on a media asset, no site-wide default to set. Assets already
 * flagged keep their flag in the database — it simply has no effect and no
 * control — so turning the feature back on restores exactly what was there.
 *
 * `NEXT_PUBLIC_` because the controls are client components and the reading has
 * to be the same on both sides of the boundary. Read through a constant rather
 * than `process.env` at each site so the bundler can fold it, and so there is
 * one place to look.
 *
 * Unset means on. A site that already flags media would otherwise have that
 * media quietly unshielded by an upgrade, which is not a default to choose for
 * someone.
 */
export const NSFW_FEATURES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_NSFW !== "false";
