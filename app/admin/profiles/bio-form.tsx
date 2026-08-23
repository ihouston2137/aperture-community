"use client";

import { useState } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { BIO_TYPES, BIO_TYPE_LABELS, normalizeBioType } from "@/lib/bio-types";

import { saveBioAction } from "./actions";

export type BioRecord = {
  _id: string;
  name: string;
  slug: string;
  type: string;
  title: string;
  location: string;
  description: string;
  headshotMediaId: string;
  headshotUrl: string;
  isPrimary: boolean;
};

export function BioForm({ bio }: { bio?: BioRecord }) {
  const [headshotUrl, setHeadshotUrl] = useState(bio?.headshotUrl ?? "");
  const [headshotMediaId, setHeadshotMediaId] = useState(bio?.headshotMediaId ?? "");

  return (
    <form action={saveBioAction}>
      {bio ? <input type="hidden" name="id" value={bio._id} /> : null}
      <input type="hidden" name="headshotUrl" value={headshotUrl} />
      <input type="hidden" name="headshotMediaId" value={headshotMediaId} />

      <div className="field-grid">
        <div className="field">
          <label>Name</label>
          <input type="text" name="name" defaultValue={bio?.name ?? ""} required />
        </div>
        <div className="field">
          <label>Type</label>
          <select name="type" defaultValue={normalizeBioType(bio?.type)}>
            {BIO_TYPES.map((type) => (
              <option key={type} value={type}>
                {BIO_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <span className="help-text">
            Only a person can be credited as an author.
          </span>
        </div>
        <div className="field">
          <label>Title</label>
          <input type="text" name="title" defaultValue={bio?.title ?? ""} />
        </div>
        <div className="field">
          <label>Location</label>
          <input type="text" name="location" defaultValue={bio?.location ?? ""} />
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
        <label>Description</label>
        <textarea name="description" defaultValue={bio?.description ?? ""} rows={4} />
      </div>

      <label className="checkbox-row" style={{ marginTop: "0.75rem" }}>
        <input type="checkbox" name="isPrimary" defaultChecked={bio?.isPrimary ?? false} />
        Primary profile
      </label>

      <div style={{ marginTop: "0.75rem" }}>
        <button type="submit" className="btn btn-primary btn-sm">
          {bio ? "Save profile" : "Create profile"}
        </button>
      </div>
    </form>
  );
}
