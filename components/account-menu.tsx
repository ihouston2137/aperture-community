"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { logoutAction } from "@/app/actions";

import { AuthDialog, useAuthDialog, type RegistrationOptions } from "./auth-dialog";

/**
 * Deliberately without the email address.
 *
 * The menu does not show one, and a prop reaches the browser in the page source
 * whether it is rendered or not — so the label and the initials are worked out
 * on the server, and the address never leaves it.
 */
export type AccountUser = {
  /** Display name, already resolved; never an email address. */
  label: string;
  /** One or two letters for the avatar. */
  initials: string;
  /**
   * The site admin is offered to Administrators and to nobody else.
   *
   * Holding a management permission is not the same as running the site:
   * somebody given the donations to enter has a section of their own to work
   * in, and pointing them at the whole admin would only be pointing them at
   * screens they cannot use.
   */
  isAdministrator: boolean;
  /**
   * The sections this account has been given — the sponsorships dashboard
   * and whatever follows it. Kept as a list so a section added later needs
   * no change here.
   */
  sections: { label: string; href: string }[];
  /** The membership level, shown under the name. Empty for a staff-only account. */
  level: string;
};

/**
 * The top-right corner of the site header.
 *
 * Signed out it is a sign-in link that opens the popup, and that link can be
 * turned off or moved to the footer. Signed in it is the member's initials with
 * a menu behind them, and that is deliberately not configurable: the way back
 * to your own account should be in the same place on every site built with
 * this.
 *
 * It sits outside `.site-nav` on purpose, so it stays in the corner at mobile
 * widths instead of collapsing into the hamburger with the site links.
 */
export function AccountMenu({
  user,
  registration,
  showSignIn = true,
  signInLabel = "Sign in",
}: {
  /** Null when nobody is signed in. */
  user: AccountUser | null;
  registration: RegistrationOptions;
  /** Whether the signed-out link belongs here. Never affects the menu above. */
  showSignIn?: boolean;
  signInLabel?: string;
}) {
  const dialog = useAuthDialog();

  /**
   * The page to come back to after signing in or out. The path only: reading
   * the query string too would mean `useSearchParams`, which obliges every
   * page rendering this header to sit inside a Suspense boundary, and no page
   * here depends on its query to be worth returning to.
   */
  const here = usePathname();

  // Nothing to hold the corner: no menu to show, and the link put elsewhere.
  if (!user && !showSignIn) return null;

  return (
    <div className="site-account">
      {user ? (
        <SignedIn user={user} here={here} />
      ) : (
        <button
          type="button"
          className="site-account-signin"
          onClick={() => dialog.open("signin")}
        >
          {signInLabel}
        </button>
      )}

      {dialog.view ? (
        <AuthDialog
          view={dialog.view}
          onView={dialog.open}
          onClose={dialog.close}
          registration={registration}
          next={here}
        />
      ) : null}
    </div>
  );
}

function SignedIn({ user, here }: { user: AccountUser; here: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="site-account-menu" ref={root} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="site-account-button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="site-account-avatar" aria-hidden="true">
          {user.initials}
        </span>
        <span className="site-nav-caret" aria-hidden="true" />
      </button>

      <div className="site-account-panel" hidden={!open} role="menu">
        {/* The name and the level, not the address — a menu that hangs open in
            a shared or projected window should not put an email on screen. */}
        <div className="site-account-identity">
          <strong>{user.label}</strong>
          {user.level ? <span className="site-account-level">{user.level}</span> : null}
        </div>

        <Link href="/dashboard" role="menuitem" onClick={() => setOpen(false)}>
          Dashboard
        </Link>

        {user.sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {section.label}
          </Link>
        ))}

        {user.isAdministrator ? (
          <Link href="/admin" role="menuitem" onClick={() => setOpen(false)}>
            Site admin
          </Link>
        ) : null}

        {/* Signing out returns to this page rather than to a sign-in form. */}
        <form action={logoutAction}>
          <input type="hidden" name="next" value={here} />
          <button type="submit" className="site-account-signout" role="menuitem">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * The same sign-in link, for wherever it has been placed outside the header.
 *
 * It opens the same popup rather than sending somebody to `/login`, so the
 * page they were reading is still behind them when they have signed in.
 */
export function SignInLink({
  registration,
  label,
  className = "site-footer-signin",
}: {
  registration: RegistrationOptions;
  label: string;
  className?: string;
}) {
  const dialog = useAuthDialog();
  const here = usePathname();

  return (
    <>
      <button type="button" className={className} onClick={() => dialog.open("signin")}>
        {label}
      </button>

      {dialog.view ? (
        <AuthDialog
          view={dialog.view}
          onView={dialog.open}
          onClose={dialog.close}
          registration={registration}
          next={here}
        />
      ) : null}
    </>
  );
}
