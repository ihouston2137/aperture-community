"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { formatPhone } from "@/lib/member-types";

import {
  deleteSponsorContactAction,
  saveSponsorContactAction,
  saveSponsorReachAction,
} from "./actions";
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

/**
 * The sponsor's own address, phone, site and links.
 *
 * Beside the contact list rather than inside the record editor, because the
 * two are one job — keeping current how a sponsor is reached — and because the
 * record editor asks for a trust this does not need. Everything else about the
 * sponsor is left alone by the action behind it.
 */
export function SponsorReachButton({
  sponsor,
}: {
  sponsor: {
    _id: string;
    email: string;
    phone: string;
    address: string;
    website: string;
    links: { label: string; href: string }[];
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState(sponsor.email);
  const [phone, setPhone] = useState(sponsor.phone);
  const [address, setAddress] = useState(sponsor.address);
  const [website, setWebsite] = useState(sponsor.website);
  /*
   * Links as one box, a line each.
   *
   * `Label | https://…`, which is the shape somebody types without being told
   * — and a row of paired inputs for a list nobody fills in more than twice is
   * a form to fight rather than to fill in.
   */
  const [links, setLinks] = useState(
    sponsor.links.map((link) => `${link.label} | ${link.href}`).join("\n")
  );

  function save() {
    setError("");
    startTransition(async () => {
      const parsed = links
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const at = line.lastIndexOf("|");
          if (at < 0) return { label: "", href: line };
          return {
            label: line.slice(0, at).trim(),
            href: line.slice(at + 1).trim(),
          };
        });

      const formData = new FormData();
      formData.set("sponsorId", sponsor._id);
      formData.set("email", email);
      formData.set("phone", phone);
      formData.set("address", address);
      formData.set("website", website);
      formData.set("links", JSON.stringify(parsed));

      const result = await saveSponsorReachAction(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Could not save that.");
      }
    });
  }

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Edit details
      </button>

      {open ? (
        <Shell
          title="How to reach them"
          pending={pending}
          error={error}
          onClose={() => setOpen(false)}
          footer={
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
              disabled={pending}
              onClick={save}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          }
        >
          <div className="field">
            <label htmlFor="reach-email">Email</label>
            <input
              id="reach-email"
              type="email"
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="reach-phone">Phone</label>
            <input
              id="reach-phone"
              type="tel"
              value={phone}
              disabled={pending}
              onChange={(event) => setPhone(event.target.value)}
            />
            <span className="help-text">
              Stored as digits alone, and shown as (555) 555-5555.
            </span>
          </div>

          <div className="field">
            <label htmlFor="reach-website">Website</label>
            <input
              id="reach-website"
              type="url"
              value={website}
              disabled={pending}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="reach-address">Address</label>
            <textarea
              id="reach-address"
              rows={3}
              value={address}
              disabled={pending}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="reach-links">Links</label>
            <textarea
              id="reach-links"
              rows={3}
              value={links}
              disabled={pending}
              placeholder="Instagram | https://instagram.com/…"
              onChange={(event) => setLinks(event.target.value)}
            />
            <span className="help-text">
              One a line, as <code>Label | address</code>. A line with no bar is
              taken as an address with no label.
            </span>
          </div>
        </Shell>
      ) : null}
    </>
  );
}
