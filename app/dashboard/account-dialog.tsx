"use client";

import { useEffect } from "react";

import { ModalPortal } from "@/components/modal-portal";

/**
 * The popup the dashboard's account forms open in.
 *
 * It wears the same chrome as the sign-in popup in the site header — the admin
 * palette on a dimmed page — because these are the same kind of thing: a short
 * form over the page you were reading rather than a trip to another screen.
 */
export function AccountDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Callers pass a no-op while a save is in flight, as the admin dialogs do. */
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // The page behind must not scroll while a dialog is over it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <ModalPortal>
      <div className="auth-dialog-backdrop" onClick={onClose} role="presentation">
        <div
          className="auth-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="auth-dialog-header">
            <h2 className="panel-title" style={{ margin: 0 }}>
              {title}
            </h2>
            <button
              type="button"
              className="auth-dialog-close"
              aria-label="Close"
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="auth-dialog-body">
            {subtitle ? (
              <p className="help-text auth-subtitle">{subtitle}</p>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
