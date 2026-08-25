"use client";

import { useEffect, useState } from "react";

import { ForgotPasswordForm } from "@/app/forgot-password/forgot-form";
import { LoginForm } from "@/app/login/login-form";
import {
  RegisterForm,
  type RegistrationRoleOption,
} from "@/app/register/register-form";

import { ModalPortal } from "./modal-portal";

/**
 * Sign in, register and password recovery in one popup, reachable from the
 * header of any page.
 *
 * The forms are the same components the full-page routes render — one
 * implementation, so a field added to registration appears in both places at
 * once. `/login`, `/register` and `/forgot-password` remain real pages: this is
 * a faster way to reach them, not a replacement, which is what keeps the flow
 * working for a reader who arrives at one of those URLs directly.
 */
export type AuthView = "signin" | "register" | "recover";

/** What the registration form needs, read once on the server. */
export type RegistrationOptions = {
  allowRegistration: boolean;
  roles: RegistrationRoleOption[];
  defaultRoleName: string;
  needsApproval: boolean;
  verifiesEmail: boolean;
};

const titles: Record<AuthView, { title: string; subtitle: string }> = {
  signin: { title: "Sign in", subtitle: "" },
  register: {
    title: "Create an account",
    subtitle: "Join the community. Every field is needed so members can be reached.",
  },
  recover: {
    title: "Reset your password",
    subtitle: "We will email you a six-digit code, then you can choose a new password.",
  },
};

export function AuthDialog({
  view,
  onView,
  onClose,
  registration,
  next,
}: {
  view: AuthView;
  onView: (view: AuthView) => void;
  onClose: () => void;
  registration: RegistrationOptions;
  /** The page this was opened from, returned to after signing in. */
  next: string;
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

  const copy = titles[view];

  return (
    <ModalPortal>
      <div className="auth-dialog-backdrop" onClick={onClose} role="presentation">
        <div
          className="auth-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="auth-dialog-header">
            <h2 className="panel-title" style={{ margin: 0 }}>
              {copy.title}
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
            {copy.subtitle ? (
              <p className="help-text auth-subtitle">{copy.subtitle}</p>
            ) : null}

            {/* The id prefix keeps these inputs distinct from a copy of the same
                form already on the page — `/login` renders one too. */}
            {view === "signin" ? (
              <LoginForm next={next} idPrefix="dlg-" />
            ) : view === "register" ? (
              <RegisterForm
                roles={registration.roles}
                defaultRoleName={registration.defaultRoleName}
                needsApproval={registration.needsApproval}
                verifiesEmail={registration.verifiesEmail}
                next={next}
                idPrefix="dlg-"
              />
            ) : (
              <ForgotPasswordForm idPrefix="dlg-" />
            )}
          </div>

          <div className="auth-dialog-footer">
            {view !== "signin" ? (
              <button type="button" className="auth-link" onClick={() => onView("signin")}>
                Back to sign in
              </button>
            ) : null}
            {view !== "recover" ? (
              <button
                type="button"
                className="auth-link"
                onClick={() => onView("recover")}
              >
                Forgot your password?
              </button>
            ) : null}
            {view !== "register" && registration.allowRegistration ? (
              <button
                type="button"
                className="auth-link"
                onClick={() => onView("register")}
              >
                Create an account
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Opens the dialog for anything on the page that asks — a header button, or a
 * link anywhere in the content marked `data-auth="signin" | "register" |
 * "recover"`.
 *
 * The delegated listener is what makes "accessible from any page" true for
 * content the page builder produced, which cannot import a React component.
 */
export function useAuthDialog() {
  const [view, setView] = useState<AuthView | null>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest("[data-auth]");
      if (!target) return;

      const requested = target.getAttribute("data-auth");
      if (requested !== "signin" && requested !== "register" && requested !== "recover") {
        return;
      }

      event.preventDefault();
      setView(requested);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return { view, open: setView, close: () => setView(null) };
}
