/**
 * Where an editor's way-back link goes.
 *
 * An editor used to be reachable from exactly one place — its own list in the
 * admin — so "back" could be a constant. The content dashboard is a second way
 * in, and leaving should return you to wherever you set off from rather than
 * to a list you were never on.
 *
 * The referring screen says where it was by putting a **token** on the address
 * (`?from=content`), and that token is looked up here. Deliberately not the
 * address itself: a `from` the browser could fill in with anything is an open
 * redirect wearing a convenience's clothes.
 *
 * Every editor saves by redirecting back to itself, which is why the token has
 * to survive that round trip as well — see `withExit`. Without it the way-back
 * link silently reverts to the admin's own list the first time you press Save.
 */
export type AdminExit = {
  href: string;
  label: string;
  /**
   * The token that produced this exit, or "" for an editor's own default.
   *
   * Carried so an editor can put it back on the address when its save
   * redirects, without having to know how the tokens map to places.
   */
  token: string;
};

/** Where an editor falls back to: its own list in the admin. */
export type ExitTarget = { href: string; label: string };

const EXITS: Record<string, ExitTarget> = {
  content: { href: "/manage/content", label: "Site content" },
};

/**
 * Whether the token names a real exit.
 *
 * `Object.hasOwn` rather than `in`, which walks the prototype chain — so
 * `?from=__proto__` (or `constructor`, or `toString`) would otherwise answer
 * yes and hand back `Object.prototype`, producing a link to `undefined`.
 */
function isExit(token: string): boolean {
  return Object.hasOwn(EXITS, token);
}

/**
 * The exit named by `from`, or the editor's own default.
 *
 * Anything unrecognised — a stale link, a typed URL, somebody trying it on —
 * falls through to the default, so the link is never broken and never anywhere
 * it should not be.
 */
export function adminExit(from: string | undefined, fallback: ExitTarget): AdminExit {
  const token = from && isExit(from) ? from : "";
  return { ...(token ? EXITS[token] : fallback), token };
}

/**
 * A path with the way-back token carried through, for a save that redirects.
 *
 * The token comes back off a form field, so it is checked against the same
 * closed list before it is put on an address — a value the browser supplied is
 * never echoed into a URL unread.
 */
export function withExit(path: string, from: unknown): string {
  const token = String(from ?? "");
  if (!token || !isExit(token)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}from=${encodeURIComponent(token)}`;
}
