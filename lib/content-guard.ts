import { notFound, redirect } from "next/navigation";

import { checkContentAccess, type MenuContentType } from "./menus";

/**
 * Enforces on the content what its menu item promises.
 *
 * A menu is how people find things, so restricting the way in has to restrict
 * what it leads to — otherwise a members-only link would be a suggestion, not a
 * rule, defeated by anyone who guessed the address.
 *
 * Two different refusals, on purpose. Somebody not signed in is sent to the
 * sign-in form and returned here afterwards, because they may well be allowed
 * once they are. Somebody signed in without the role gets a plain 404: telling
 * them the address exists but is not theirs leaks the shape of a private area
 * to no useful end.
 */
export async function guardContent(
  type: MenuContentType,
  id: string,
  /** Where to come back to after signing in. */
  path: string
): Promise<void> {
  const verdict = await checkContentAccess(type, id);
  if (verdict === "allowed") return;

  if (verdict === "signInRequired") {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  notFound();
}
