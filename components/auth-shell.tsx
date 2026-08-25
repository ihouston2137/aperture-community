import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame every account screen sits in — sign in, register, verify, recover.
 *
 * They share it so the whole join-and-return journey looks like one thing, and
 * so a screen added later inherits the layout instead of restating it.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  notice,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown above the card, for the message a redirect arrived with. */
  notice?: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        {notice}
        <div className="panel auth-panel">
          <h1 className="panel-title">{title}</h1>
          {subtitle ? <p className="help-text auth-subtitle">{subtitle}</p> : null}
          {children}
        </div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="auth-link">
      {children}
    </Link>
  );
}
