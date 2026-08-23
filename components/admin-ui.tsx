import Link from "next/link";
import type { ReactNode } from "react";

export function AdminHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-topbar">
      <div>
        <h1 className="admin-title">{title}</h1>
        {subtitle ? <p className="admin-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="admin-actions">{actions}</div> : null}
    </div>
  );
}

export function Notice({
  children,
  variant = "info",
}: {
  children: ReactNode;
  variant?: "info" | "error";
}) {
  return (
    <div className={`admin-notice${variant === "error" ? " is-error" : ""}`}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {title ? <h2 className="panel-title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function EmptyState({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="panel" style={{ textAlign: "center" }}>
      <p className="admin-subtitle" style={{ marginBottom: actionHref ? "1rem" : 0 }}>
        {message}
      </p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="btn btn-primary">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status === "published" ? "published" : "draft"}`}>
      {status}
    </span>
  );
}
