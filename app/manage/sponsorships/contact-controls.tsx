"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { formatPhone } from "@/lib/member-types";

import { deleteSponsorContactAction, saveSponsorContactAction } from "./actions";
import { IconButton, TrashIcon } from "./sponsor-controls";

export type Contact = {
  name: string;
  title: string;
  email: string;
  phone: string;
};

/**
 * The people to ask for at a sponsor.
 *
 * Added and corrected from the sponsor's own page, because that is where
 * somebody is standing when they find out the marketing lead has changed — not
 * in the whole-sponsor editor two screens away.
 *
 * A contact is addressed by where it sits in the list and by the name that was
 * there when the page was drawn. Two people tidying the same sponsor at once
 * would otherwise shift the list under each other and edit the wrong row; the
 * server checks both and refuses rather than guessing.
 */
function Shell({
  title,
  pending,
  error,
  onClose,
  children,
  footer,
}: {
  title: string;
  pending: boolean;
  error: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="style-modal-form">
            <div className="style-modal-header">
              <strong>{title}</strong>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="style-modal-body">
              {error ? <div className="admin-notice is-error">{error}</div> : null}
              {children}
            </div>

            <div className="style-modal-footer">{footer}</div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Add a contact, or correct one already there. */
export function ContactButton({
  sponsorId,
  contact,
  index,
}: {
  sponsorId: string;
  /** Absent when adding, which is also what decides the button's shape. */
  contact?: Contact;
  index?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Contact>(
    contact
      ? { ...contact, phone: formatPhone(contact.phone) }
      : { name: "", title: "", email: "", phone: "" }
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
    setDraft(
      contact
        ? { ...contact, phone: formatPhone(contact.phone) }
        : { name: "", title: "", email: "", phone: "" }
    );
  }

  function save() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sponsorId", sponsorId);
      formData.set("name", draft.name);
      formData.set("title", draft.title);
      formData.set("email", draft.email);
      formData.set("phone", draft.phone);

      if (contact && index !== undefined) {
        formData.set("index", String(index));
        formData.set("expectedName", contact.name);
      }

      const result = await saveSponsorContactAction(formData);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error ?? "Could not save that contact.");
      }
    });
  }

  const field = (
    key: keyof Contact,
    label: string,
    type: string,
    placeholder = ""
  ) => (
    <div className="field">
      <label htmlFor={`contact-${key}`}>{label}</label>
      <input
        id={`contact-${key}`}
        type={type}
        value={draft[key]}
        placeholder={placeholder}
        disabled={pending}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.value }))
        }
      />
    </div>
  );

  return (
    <>
      {contact ? (
        <IconButton
          label={`Edit ${contact.name || "contact"}`}
          onClick={() => setOpen(true)}
        />
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setOpen(true)}
        >
          Add contact
        </button>
      )}

      {open ? (
        <Shell
          title={contact ? "Edit contact" : "Add contact"}
          pending={pending}
          error={error}
          onClose={close}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginLeft: "auto" }}
              disabled={
                pending ||
                (!draft.name.trim() && !draft.email.trim() && !draft.phone.trim())
              }
              onClick={save}
            >
              {pending ? "Saving…" : contact ? "Save contact" : "Add contact"}
            </button>
          }
        >
          <div className="field-grid">
            {field("name", "Name", "text")}
            {field("title", "Title", "text", "Marketing lead")}
            {field("email", "Email", "email")}
            {field("phone", "Phone", "tel")}
          </div>

          <span className="help-text">
            A name, an email or a phone number — whichever of them is known.
          </span>
        </Shell>
      ) : null}
    </>
  );
}

/** Removes one contact, behind a confirm. */
export function DeleteContactButton({
  sponsorId,
  contact,
  index,
}: {
  sponsorId: string;
  contact: Contact;
  index: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sponsorId", sponsorId);
      formData.set("index", String(index));
      formData.set("expectedName", contact.name);

      const result = await deleteSponsorContactAction(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Could not remove that contact.");
      }
    });
  }

  return (
    <>
      <IconButton
        label={`Remove ${contact.name || "contact"}`}
        danger
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
      </IconButton>

      {open ? (
        <Shell
          title="Remove contact"
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={remove}
              >
                {pending ? "Removing…" : "Yes, remove"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Keep
              </button>
            </>
          }
        >
          <p className="help-text">
            Remove {contact.name || "this contact"} from this sponsor? Nothing
            else about the sponsor changes.
          </p>
        </Shell>
      ) : null}
    </>
  );
}
