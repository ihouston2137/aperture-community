"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import { formatPhone } from "@/lib/member-types";
import {
  SPONSOR_INDUSTRIES,
  SPONSOR_SIZES,
  SPONSOR_SIZE_LABELS,
  SPONSOR_TYPES,
  SPONSOR_TYPE_LABELS,
  formatDollars,
  primaryLogo,
  sponsorLogoSrc,
  type RecognitionLevelSummary,
  type SponsorCategorySummary,
  type SponsorContact,
  type SponsorLink,
  type SponsorLogo,
  type SponsorSummary,
} from "@/lib/sponsorship-types";

import { deleteSponsorAction, saveSponsorAction } from "./actions";

/** What each sponsor has given, worked out once on the server. */
export type SponsorTotals = Record<string, { totalCents: number; count: number }>;

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; sponsor: SponsorSummary }
  | null;

/**
 * Everybody who gives to a campaign, and everything known about how to reach
 * them.
 *
 * Only the name is required. A sponsor is usually entered the day somebody
 * first speaks to them, long before anyone knows their industry or who to ask
 * for, and a form that insisted otherwise would go unfilled.
 */
export function SponsorManager({
  sponsors,
  levels,
  categories,
  totals,
  canManage,
}: {
  sponsors: SponsorSummary[];
  levels: RecognitionLevelSummary[];
  categories: SponsorCategorySummary[];
  totals: SponsorTotals;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [levelId, setLevelId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const levelName = (id: string) =>
    levels.find((level) => level._id === id)?.name ?? "";

  // Marked in the list too, so nobody publishes a sponsor who asked not to be
  // named without noticing.
  const isAnonymousLevel = (id: string) =>
    Boolean(levels.find((level) => level._id === id)?.isAnonymous);

  const categoryName = (id: string) =>
    categories.find((category) => category._id === id)?.name ?? "";

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sponsors.filter((sponsor) => {
      if (type && sponsor.type !== type) return false;
      if (levelId && sponsor.recognitionLevelId !== levelId) return false;
      if (categoryId && !sponsor.categoryIds.includes(categoryId)) return false;
      if (!needle) return true;
      return [
        sponsor.name,
        sponsor.industry,
        sponsor.email,
        sponsor.website,
        ...sponsor.contacts.map((contact) => `${contact.name} ${contact.email}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [sponsors, query, type, levelId, categoryId]);

  return (
    <Panel title={`Sponsors (${sponsors.length})`}>
      {canManage ? (
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            Add sponsor
          </button>
        </div>
      ) : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="sponsor-search">Search</label>
          <input
            id="sponsor-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, industry, contact or address"
          />
        </div>
        <div className="field">
          <label htmlFor="sponsor-type">Type</label>
          <select
            id="sponsor-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Every type</option>
            {SPONSOR_TYPES.map((kind) => (
              <option key={kind} value={kind}>
                {SPONSOR_TYPE_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        {categories.length > 0 ? (
          <div className="field">
            <label htmlFor="sponsor-category-filter">Category</label>
            <select
              id="sponsor-category-filter"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Every category</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {levels.length > 0 ? (
          <div className="field">
            <label htmlFor="sponsor-level-filter">Recognition</label>
            <select
              id="sponsor-level-filter"
              value={levelId}
              onChange={(event) => setLevelId(event.target.value)}
            >
              <option value="">Every level</option>
              {levels.map((level) => (
                <option key={level._id} value={level._id}>
                  {level.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          {sponsors.length === 0
            ? "No sponsors yet."
            : "No sponsors match that."}
        </p>
      ) : (
        <ul className="admin-list" style={{ marginTop: "1rem" }}>
          {shown.map((sponsor) => {
            const given = totals[sponsor._id];
            const logoSrc = sponsorLogoSrc(primaryLogo(sponsor.logos));

            return (
              <li key={sponsor._id} className="admin-list-item">
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="" className="sponsor-row-logo" />
                ) : (
                  <div className="sponsor-row-logo is-empty" aria-hidden="true" />
                )}

                <div style={{ minWidth: 0 }}>
                  <h3>{sponsor.name}</h3>
                  <div className="admin-list-meta">
                    {SPONSOR_TYPE_LABELS[sponsor.type]}
                    {sponsor.industry ? ` · ${sponsor.industry}` : ""}
                    {sponsor.size ? ` · ${SPONSOR_SIZE_LABELS[sponsor.size]}` : ""}
                    {levelName(sponsor.recognitionLevelId)
                      ? ` · ${levelName(sponsor.recognitionLevelId)}${
                          isAnonymousLevel(sponsor.recognitionLevelId)
                            ? " (anonymous)"
                            : ""
                        }`
                      : ""}
                  </div>
                  <div className="admin-list-meta">
                    {sponsor.email || "no email"}
                    {sponsor.phone ? ` · ${formatPhone(sponsor.phone)}` : ""}
                    {sponsor.contacts.length > 0
                      ? ` · ${sponsor.contacts.length} contact${
                          sponsor.contacts.length === 1 ? "" : "s"
                        }`
                      : ""}
                    {sponsor.isUnassignable ? " · nobody assigned" : ""}
                    {sponsor.logos.length > 0
                      ? ` · ${sponsor.logos.length} logo${
                          sponsor.logos.length === 1 ? "" : "s"
                        }`
                      : ""}
                  </div>
                  {sponsor.categoryIds.length > 0 ? (
                    <div className="admin-list-meta">
                      {sponsor.categoryIds
                        .map(categoryName)
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  ) : null}
                </div>

                <span className={`badge${given ? " badge-published" : ""}`}>
                  {given ? formatDollars(given.totalCents) : "nothing yet"}
                </span>

                {canManage ? (
                  <div className="admin-list-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setDialog({ mode: "edit", sponsor })}
                    >
                      Edit
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dialog ? (
        <SponsorDialog
          sponsor={dialog.mode === "edit" ? dialog.sponsor : undefined}
          levels={levels}
          categories={categories}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </Panel>
  );
}

/** Add, edit or delete one sponsor. */
function SponsorDialog({
  sponsor,
  levels,
  categories,
  onClose,
  onSaved,
}: {
  sponsor?: SponsorSummary;
  levels: RecognitionLevelSummary[];
  categories: SponsorCategorySummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [logos, setLogos] = useState<SponsorLogo[]>(sponsor?.logos ?? []);
  const [contacts, setContacts] = useState<SponsorContact[]>(
    (sponsor?.contacts ?? []).map((contact) => ({
      ...contact,
      phone: formatPhone(contact.phone),
    }))
  );

  // A value recorded before the list existed stays on the list, so opening an
  // old sponsor and saving it does not quietly clear what somebody entered.
  const industries = useMemo(() => {
    const stored = sponsor?.industry ?? "";
    const known: string[] = [...SPONSOR_INDUSTRIES];
    return stored && !known.includes(stored) ? [...known, stored] : known;
  }, [sponsor?.industry]);
  const [links, setLinks] = useState<SponsorLink[]>(sponsor?.links ?? []);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function save(formData: FormData) {
    setError("");
    formData.set("logos", JSON.stringify(logos));
    formData.set("contacts", JSON.stringify(contacts));
    formData.set("links", JSON.stringify(links));

    startTransition(async () => {
      const result = await saveSponsorAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that sponsor.");
    });
  }

  function remove() {
    if (!sponsor) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", sponsor._id);
      const result = await deleteSponsorAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that sponsor.");
    });
  }

  const title = sponsor ? "Edit sponsor" : "Add sponsor";

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
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
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
              {sponsor ? <input type="hidden" name="id" value={sponsor._id} /> : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="sponsor-name">Name</label>
                  <input
                    id="sponsor-name"
                    name="name"
                    type="text"
                    defaultValue={sponsor?.name ?? ""}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="sponsor-kind">Type</label>
                  <select
                    id="sponsor-kind"
                    name="type"
                    defaultValue={sponsor?.type ?? "business"}
                  >
                    {SPONSOR_TYPES.map((kind) => (
                      <option key={kind} value={kind}>
                        {SPONSOR_TYPE_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sponsor-industry">Industry</label>
                  <select
                    id="sponsor-industry"
                    name="industry"
                    defaultValue={sponsor?.industry ?? ""}
                  >
                    <option value="">Not recorded</option>
                    {industries.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sponsor-size">Size</label>
                  <select
                    id="sponsor-size"
                    name="size"
                    defaultValue={sponsor?.size ?? ""}
                  >
                    {SPONSOR_SIZES.map((size) => (
                      <option key={size || "unset"} value={size}>
                        {SPONSOR_SIZE_LABELS[size]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sponsor-recognition">Recognition level</label>
                  <select
                    id="sponsor-recognition"
                    name="recognitionLevelId"
                    defaultValue={sponsor?.recognitionLevelId ?? ""}
                    disabled={levels.length === 0}
                  >
                    <option value="">Not recognised</option>
                    {levels.map((level) => (
                      <option key={level._id} value={level._id}>
                        {level.name}
                        {level.thresholdCents > 0
                          ? ` — from ${formatDollars(level.thresholdCents)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    {levels.length === 0
                      ? "No levels defined yet — they are set up under Levels."
                      : "What this sponsor is currently recognised at."}
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="sponsor-description">Description</label>
                <textarea
                  id="sponsor-description"
                  name="description"
                  rows={4}
                  defaultValue={sponsor?.description ?? ""}
                  placeholder="Who they are, in a few sentences."
                />
                <span className="help-text">
                  Written for readers rather than for the record — this is the
                  blurb that goes beside their logo. Notes further down stay
                  internal.
                </span>
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <span className="field-label">Categories</span>
                {categories.length === 0 ? (
                  <span className="help-text">
                    None defined yet — the panel under the list is where they
                    are added.
                  </span>
                ) : (
                  <div className="chip-picker">
                    {categories.map((category) => (
                      <label key={category._id} className="chip-option">
                        <input
                          type="checkbox"
                          name="categoryIds"
                          value={category._id}
                          defaultChecked={
                            sponsor?.categoryIds.includes(category._id) ?? false
                          }
                        />
                        {category.name}
                      </label>
                    ))}
                  </div>
                )}
                <span className="help-text">
                  As many as apply — a sponsor is often more than one thing.
                </span>
              </div>

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                How to reach them
              </h4>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="sponsor-email">Primary email</label>
                  <input
                    id="sponsor-email"
                    name="email"
                    type="email"
                    defaultValue={sponsor?.email ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sponsor-phone">Phone</label>
                  <input
                    id="sponsor-phone"
                    name="phone"
                    type="tel"
                    defaultValue={formatPhone(sponsor?.phone ?? "")}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sponsor-website">Website</label>
                  <input
                    id="sponsor-website"
                    name="website"
                    type="text"
                    defaultValue={sponsor?.website ?? ""}
                    placeholder="https://"
                  />
                </div>
                <div className="field">
                  <label htmlFor="sponsor-address">Address</label>
                  <textarea
                    id="sponsor-address"
                    name="address"
                    rows={2}
                    defaultValue={sponsor?.address ?? ""}
                  />
                </div>
              </div>

              <RowEditor
                title="Other links"
                hint="Social accounts, a giving page, anywhere else they are found."
                addLabel="Add a link"
                rows={links}
                pending={pending}
                onChange={setLinks}
                blank={{ label: "", href: "" }}
                fields={[
                  { key: "label", label: "Label", placeholder: "Instagram" },
                  { key: "href", label: "Address", placeholder: "https://" },
                ]}
              />

              <RowEditor
                title="Contacts"
                hint="The people to ask for, and how to reach each of them."
                addLabel="Add a contact"
                rows={contacts}
                pending={pending}
                onChange={setContacts}
                blank={{ name: "", title: "", email: "", phone: "" }}
                fields={[
                  { key: "name", label: "Name", placeholder: "" },
                  { key: "title", label: "Title", placeholder: "Marketing lead" },
                  { key: "email", label: "Email", placeholder: "" },
                  { key: "phone", label: "Phone", placeholder: "" },
                ]}
              />

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                Approved logos
              </h4>
              <p className="help-text">
                Artwork cleared for use, so nobody has to ask again before
                printing one. Whichever is marked primary is the one the site
                shows.
              </p>

              {logos.map((logo, index) => (
                <div key={index} className="sponsor-logo-row">
                  <MediaField
                    label={`Logo ${index + 1}`}
                    value={logo.url}
                    mediaType="image"
                    onChange={(url, asset) =>
                      setLogos((current) =>
                        current.map((entry, position) =>
                          position === index
                            ? { ...entry, url, mediaId: asset?._id ?? "" }
                            : entry
                        )
                      )
                    }
                  />
                  <div className="field">
                    <label>Label</label>
                    <input
                      type="text"
                      value={logo.label}
                      placeholder="Full colour, on dark…"
                      disabled={pending}
                      onChange={(event) =>
                        setLogos((current) =>
                          current.map((entry, position) =>
                            position === index
                              ? { ...entry, label: event.target.value }
                              : entry
                          )
                        )
                      }
                    />
                  </div>
                  <label className="checkbox-row" style={{ flex: "0 0 auto" }}>
                    <input
                      type="radio"
                      name="primaryLogo"
                      checked={logo.isPrimary}
                      disabled={pending}
                      onChange={() =>
                        setLogos((current) =>
                          current.map((entry, position) => ({
                            ...entry,
                            isPrimary: position === index,
                          }))
                        )
                      }
                    />
                    Primary
                  </label>

                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() =>
                      setLogos((current) => {
                        const kept = current.filter(
                          (_, position) => position !== index
                        );
                        // Removing the primary one would leave the site with
                        // nothing to show, so the first that remains takes over.
                        return kept.some((entry) => entry.isPrimary)
                          ? kept
                          : kept.map((entry, position) => ({
                              ...entry,
                              isPrimary: position === 0,
                            }));
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: "0.5rem" }}
                disabled={pending}
                onClick={() =>
                  setLogos((current) => [
                    ...current,
                    {
                      label: "",
                      url: "",
                      mediaId: "",
                      // The first added is what the site shows until somebody
                      // says otherwise.
                      isPrimary: current.length === 0,
                    },
                  ])
                }
              >
                Add a logo
              </button>

              <label className="checkbox-row" style={{ marginTop: "1.25rem" }}>
                <input
                  type="checkbox"
                  name="isUnassignable"
                  defaultChecked={sponsor?.isUnassignable ?? false}
                />
                Nobody looks after this sponsor
              </label>
              <span className="help-text">
                No member can be assigned to them on any campaign. For sponsors
                handled by the committee as a whole, or under an arrangement
                that predates everyone on it — where naming somebody would be
                wrong rather than merely missing.
              </span>

              <div className="field" style={{ marginTop: "1.25rem" }}>
                <label htmlFor="sponsor-notes">Notes</label>
                <textarea
                  id="sponsor-notes"
                  name="notes"
                  rows={3}
                  defaultValue={sponsor?.notes ?? ""}
                />
              </div>
            </div>

            <div className="style-modal-footer">
              {sponsor ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this sponsor?</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={remove}
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete sponsor
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : sponsor ? "Save sponsor" : "Create sponsor"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * A list of the same small record, added to and removed from.
 *
 * Contacts and links are the same shape of problem, so they are the same
 * control rather than two that drift.
 */
function RowEditor<T extends Record<string, string>>({
  title,
  hint,
  addLabel,
  rows,
  fields,
  blank,
  pending,
  onChange,
}: {
  title: string;
  hint: string;
  addLabel: string;
  rows: T[];
  fields: { key: keyof T & string; label: string; placeholder: string }[];
  blank: T;
  pending: boolean;
  onChange: (rows: T[]) => void;
}) {
  return (
    <>
      <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
        {title}
      </h4>
      <p className="help-text">{hint}</p>

      {rows.map((row, index) => (
        <div key={index} className="sponsor-row">
          {fields.map((field) => (
            <div key={field.key} className="field">
              <label>{field.label}</label>
              <input
                type="text"
                value={row[field.key] ?? ""}
                placeholder={field.placeholder}
                disabled={pending}
                onChange={(event) =>
                  onChange(
                    rows.map((entry, position) =>
                      position === index
                        ? { ...entry, [field.key]: event.target.value }
                        : entry
                    )
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={pending}
            onClick={() => onChange(rows.filter((_, position) => position !== index))}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        style={{ marginTop: "0.5rem" }}
        disabled={pending}
        onClick={() => onChange([...rows, { ...blank }])}
      >
        {addLabel}
      </button>
    </>
  );
}
