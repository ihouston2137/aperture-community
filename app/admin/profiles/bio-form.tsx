"use client";

import { useState } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { BIO_TYPES, BIO_TYPE_LABELS, normalizeBioType } from "@/lib/bio-types";

export type BioRecord = {
  _id: string;
  name: string;
  slug: string;
  type: string;
  /** The levels a member holds. Written from the account, never typed. */
  membership: string;
  title: string;
  location: string;
  description: string;
  headshotMediaId: string;
  headshotUrl: string;
  isPrimary: boolean;
  /** Set when this profile belongs to an account on the site. */
  userId: string;
  /** The address of that account, for telling two people of a name apart. */
  accountEmail: string;
};

/**
 * Every field of one profile.
 *
 * The `<form>` around this belongs to whatever opened it — the dialog owns the
 * header and the footer buttons — so this is only the fields.
 */
export function BioFields({ bio }: { bio?: BioRecord }) {
  const [headshotUrl, setHeadshotUrl] = useState(bio?.headshotUrl ?? "");
  const [headshotMediaId, setHeadshotMediaId] = useState(bio?.headshotMediaId ?? "");

  // A member's profile takes its name and membership from the account behind
  // it, so anything typed into those holds only until it next changes.
  const derived = Boolean(bio?.userId);

  // `Member` is what an account's own profile is, not something to be made by
  // hand: one with no account behind it is an orphan, and the cleanup deletes
  // it. So it is only offered on a profile that already belongs to somebody.
  const types = BIO_TYPES.filter((type) => type !== "Member" || derived);

  return (
    <>
      {bio ? <input type="hidden" name="id" value={bio._id} /> : null}
      <input type="hidden" name="headshotUrl" value={headshotUrl} />
      <input type="hidden" name="headshotMediaId" value={headshotMediaId} />

      <div className="field-grid">
        <div className="field">
          <label htmlFor="bio-name">Name</label>
          <input
            id="bio-name"
            type="text"
            name="name"
            defaultValue={bio?.name ?? ""}
            required
          />
          {derived ? (
            <span className="help-text">
              Rewritten from the account as first name and last initial whenever
              that account changes.
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="bio-type">Type</label>
          <select id="bio-type" name="type" defaultValue={normalizeBioType(bio?.type)}>
            {types.map((type) => (
              <option key={type} value={type}>
                {BIO_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <span className="help-text">
            {derived
              ? "A subject cannot be credited as an author; a person or a member can."
              : "A subject cannot be credited as an author. Member profiles are created from the account, not here."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="bio-title">Title</label>
          <input
            id="bio-title"
            type="text"
            name="title"
            defaultValue={bio?.title ?? ""}
            placeholder="Photographer, Treasurer, Year 12…"
          />
          <span className="help-text">
            What they call themselves. Theirs to change, and yours.
          </span>
        </div>
        {derived ? (
          <div className="field">
            <label htmlFor="bio-membership">Membership</label>
            <input
              id="bio-membership"
              type="text"
              value={bio?.membership || "No level yet"}
              readOnly
              disabled
            />
            <span className="help-text">
              The levels this member holds. Rewritten from the account
              whenever they change — set it under Members.
            </span>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="bio-location">Location</label>
          <input
            id="bio-location"
            type="text"
            name="location"
            defaultValue={bio?.location ?? ""}
          />
        </div>
        <MediaField
          label="Headshot"
          value={headshotUrl}
          mediaType="image"
          onChange={(url, asset) => {
            setHeadshotUrl(url);
            setHeadshotMediaId(asset?._id ?? "");
          }}
        />
      </div>

      <div className="field" style={{ marginTop: "0.75rem" }}>
        <label htmlFor="bio-description">Description</label>
        <textarea
          id="bio-description"
          name="description"
          defaultValue={bio?.description ?? ""}
          rows={4}
        />
      </div>

      <label className="checkbox-row" style={{ marginTop: "0.75rem" }}>
        <input type="checkbox" name="isPrimary" defaultChecked={bio?.isPrimary ?? false} />
        Primary profile
      </label>
    </>
  );
}
