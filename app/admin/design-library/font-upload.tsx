"use client";

import { useState } from "react";

import {
  FONT_FILE_ACCEPT,
  FONT_STYLES,
  FONT_WEIGHTS,
  fontFormatForExtension,
} from "@/lib/site-fonts";

import { uploadFontFileAction } from "./actions";

/**
 * Add a font file to the design library.
 *
 * A family here is a name and one file per weight, and the form asks for both
 * rather than reading either out of the file: the name inside a TrueType file
 * is often not the one anybody wants in a picker, and no rule reads
 * "Whitney-Semibold.ttf" and "whitney_600_v2.ttf" as the same thing.
 *
 * Uploading to a family that already exists adds a weight to it, which is how
 * a family gets its bold and its italic — so the family field offers the ones
 * already here rather than only taking new names.
 */
export function FontUpload({ families }: { families: string[] }) {
  const [family, setFamily] = useState("");
  const [fileName, setFileName] = useState("");

  const format = fileName
    ? fontFormatForExtension(fileName.slice(fileName.lastIndexOf(".")))
    : "";

  return (
    <form action={uploadFontFileAction} className="font-upload">
      <div className="field">
        <label htmlFor="font-upload-family">Family name</label>
        <input
          id="font-upload-family"
          name="family"
          type="text"
          list="font-upload-families"
          value={family}
          placeholder="e.g. Whitney"
          onChange={(event) => setFamily(event.target.value)}
          required
        />
        <datalist id="font-upload-families">
          {families.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span className="help-text">
          This is the name that appears in every font picker on the site. Reuse
          a name to add another weight to that family.
        </span>
      </div>

      <div className="font-upload-row">
        <div className="field">
          <label htmlFor="font-upload-weight">Weight</label>
          <select id="font-upload-weight" name="weight" defaultValue="400">
            {FONT_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="font-upload-style">Style</label>
          <select id="font-upload-style" name="style" defaultValue="normal">
            {FONT_STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="font-upload-category">Category</label>
          <select id="font-upload-category" name="category" defaultValue="sans-serif">
            <option value="sans-serif">sans-serif</option>
            <option value="serif">serif</option>
            <option value="display">display</option>
            <option value="handwriting">handwriting</option>
            <option value="monospace">monospace</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="font-upload-file">Font file</label>
        <input
          id="font-upload-file"
          name="file"
          type="file"
          accept={FONT_FILE_ACCEPT}
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          required
        />
        <span className="help-text">
          TrueType (.ttf), OpenType (.otf), WOFF or WOFF2.
          {fileName && !format
            ? " That file is not one of those, so it will be refused."
            : ""}
        </span>
      </div>

      <button type="submit" className="btn btn-primary">
        Upload font
      </button>

      <p className="help-text" style={{ marginTop: "0.75rem" }}>
        Only upload a font you are licensed to serve from a website. A desktop
        licence often does not cover web use, and the file is readable by
        anyone who visits.
      </p>
    </form>
  );
}
