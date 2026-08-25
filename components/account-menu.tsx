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
  /** Shown only to someone who can actually manage something. */
  canManage: boolean;
  /** The membership level, shown under the name. Empty for a staff-only account. */
  level: string;
};

/**
 * The top-right corner of the site header.
 *
 * Signed out it is a sign-in link that opens the popup; signed in it is the
 * member's initials with a menu behind them. It sits outside `.site-nav` on
 * purpose, so it stays in the corner at mobile widths instead of collapsing
 * into the hamburger with the site links.
 */
export function AccountMenu({
  user,
  registration,
}: {
  /** Null when nobody is signed in. */
  user: AccountUser | null;
  registration: RegistrationOptions;
}) {
  const dialog = useAuthDialog();

  /**
   * The page to come back to after signing in or out. The path only: reading
   * the query string too would mean `useSearchParams`, which obliges every
   * page rendering this header to sit inside a Suspense boundary, and no page
   * here depends on its query to be worth returning to.
   */
  const here = usePathname();

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
          Sign in
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
        {user.canManage ? (
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
