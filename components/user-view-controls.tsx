"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { startUserViewAction, stopUserViewAction } from "@/app/admin/users/user-view-actions";

export function ViewAsUserButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div>
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => {
      setError("");
      startTransition(async () => {
        try {
          const result = await startUserViewAction(userId);
          if (result.error) setError(result.error);
          // Full navigation discards cached pages belonging to the administrator.
          else window.location.assign(result.location || "/");
        } catch { setError("Could not switch accounts. Please try again."); }
      });
    }}>{pending ? "Switching…" : "View as user"}</button>
    {error && <p role="alert" className="help-text">{error}</p>}
  </div>;
}

export function ReturnToAdministratorButton() {
  const container = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => {
    const banner = container.current?.closest<HTMLElement>(".user-view-banner");
    if (!banner) return;
    const measure = () => document.documentElement.style.setProperty("--user-view-height", `${banner.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--user-view-height"); };
  }, []);
  return <div ref={container}>
    <button type="button" disabled={pending} onClick={() => {
      setError("");
      startTransition(async () => {
        try { await stopUserViewAction(); window.location.assign("/admin/users"); }
        catch { setError("Could not return. Please try again."); }
      });
    }}>{pending ? "Returning…" : "Return to administrator"}</button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
