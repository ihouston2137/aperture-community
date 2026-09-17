"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { ColorPicker } from "@/components/color-field";
import { CheckField, SelectField, TextField } from "@/components/builder/settings-fields";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  APPLE_STATUS_BAR_LABELS,
  APPLE_STATUS_BAR_STYLES,
  appleTouchIcon,
  iconSizesFor,
  iconTypeFor,
  missingIcons,
  PWA_DISPLAY_HELP,
  PWA_DISPLAY_LABELS,
  PWA_DISPLAY_MODES,
  PWA_ICON_PURPOSE_HELP,
  PWA_ICON_PURPOSE_LABELS,
  PWA_ICON_PURPOSES,
  PWA_ORIENTATION_LABELS,
  PWA_ORIENTATIONS,
  RECOMMENDED_ICONS,
  type PwaIcon,
  type PwaIconPurpose,
  type PwaValues,
} from "@/lib/pwa-types";

import { savePwaSettingsAction } from "./actions";

/**
 * The manifest, as a form.
 *
 * Saved whole through an action rather than posted field by field, because the
 * icons are a list and a list is easier to hold in one place than to unpick
 * from a form body — the same arrangement the metadata group editor uses.
 */
export function PwaForm({
  settings,
  siteName,
}: {
  settings: PwaValues;
  siteName: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PwaValues>(settings);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof PwaValues>(key: K) {
    return (value: PwaValues[K]) => {
      setValues((previous) => ({ ...previous, [key]: value }));
      setSaved(false);
    };
  }

  function setIcon(index: number, next: Partial<PwaIcon>) {
    setValues((previous) => ({
      ...previous,
      icons: previous.icons.map((icon, position) =>
        position === index ? { ...icon, ...next } : icon
      ),
    }));
    setSaved(false);
  }

  function addIcon(sizes = "", purpose: PwaIconPurpose = "any") {
    setValues((previous) => ({
      ...previous,
      icons: [
        ...previous.icons,
        { url: "", mediaId: "", sizes, type: "", purpose },
      ],
    }));
    setSaved(false);
  }

  function removeIcon(index: number) {
    setValues((previous) => ({
      ...previous,
      icons: previous.icons.filter((_, position) => position !== index),
    }));
    setSaved(false);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("settings", JSON.stringify(values));

      const result = await savePwaSettingsAction(formData);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error ?? "Could not save that.");
      }
    });
  }

  const usable = values.icons.filter((icon) => icon.url);
  const wanted = missingIcons(usable);
  const apple = appleTouchIcon(usable);

  return (
    <div>
      {error ? <div className="admin-notice is-error">{error}</div> : null}
      {saved ? <div className="admin-notice">Saved.</div> : null}

      <section className="panel">
        <h2 className="panel-title">Offering the site as an app</h2>
        <CheckField
          label="Let people install this site"
          value={values.isEnabled}
          onChange={set("isEnabled")}
        />
        <span className="help-text">
          Turned off, the manifest still answers — a browser asks for it either
          way — but it asks for nothing: an ordinary tab, and no icons to
          install with. Nobody is offered the app.
        </span>

        <div className="field-grid" style={{ marginTop: "0.75rem" }}>
          <TextField
            label="Name"
            value={values.name}
            placeholder={siteName}
            onChange={set("name")}
          />
          <TextField
            label="Short name"
            value={values.shortName}
            placeholder={(values.name || siteName).slice(0, 12)}
            onChange={set("shortName")}
          />
        </div>
        <span className="help-text">
          The name is what the install prompt says. The short name is what fits
          under the icon — about twelve characters, and the device truncates the
          rest without asking.
        </span>

        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="pwa-description">Description</label>
          <textarea
            id="pwa-description"
            rows={2}
            value={values.description}
            disabled={pending}
            onChange={(event) => set("description")(event.target.value)}
          />
          <span className="help-text">
            Shown by the browsers and app listings that ask for one.
          </span>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">How it opens</h2>
        <div className="field-grid">
          <TextField
            label="Opens at"
            value={values.startUrl}
            placeholder="/"
            onChange={(value) => set("startUrl")(value)}
          />
          <TextField
            label="Stays inside"
            value={values.scope}
            placeholder="/"
            onChange={(value) => set("scope")(value)}
          />
        </div>
        <span className="help-text">
          Both are paths on this site. A link outside what it stays inside opens
          in a browser instead of in the app window — set it to{" "}
          <code>/dashboard</code> to keep the app to the members&rsquo; area, or
          leave it at <code>/</code> for the whole site.
        </span>

        <div className="field-grid" style={{ marginTop: "0.75rem" }}>
          <SelectField
            label="Window"
            value={values.display}
            options={PWA_DISPLAY_MODES.map((mode) => ({
              value: mode,
              label: PWA_DISPLAY_LABELS[mode],
            }))}
            onChange={set("display")}
          />
          <SelectField
            label="Orientation"
            value={values.orientation}
            options={PWA_ORIENTATIONS.map((orientation) => ({
              value: orientation,
              label: PWA_ORIENTATION_LABELS[orientation],
            }))}
            onChange={set("orientation")}
          />
        </div>
        <span className="help-text">{PWA_DISPLAY_HELP[values.display]}</span>

        <div className="field-grid" style={{ marginTop: "0.75rem" }}>
          <ColorPicker
            label="Theme colour"
            value={values.themeColor}
            onChange={set("themeColor")}
            help="The window furniture: the title bar of an installed app."
          />
          <ColorPicker
            label="Splash background"
            value={values.backgroundColor}
            onChange={set("backgroundColor")}
            help="Painted while the first page is still loading."
          />
        </div>

        <div className="field-grid" style={{ marginTop: "0.75rem" }}>
          <TextField
            label="Language"
            value={values.lang}
            placeholder="en"
            onChange={set("lang")}
          />
          <TextField
            label="Categories"
            value={values.categories.join(", ")}
            placeholder="education, social"
            onChange={(value) =>
              set("categories")(
                value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>
        <span className="help-text">
          Categories are hints for the launchers and listings that read them,
          separated by commas. Nothing goes wrong without any.
        </span>

        <div className="field-grid" style={{ marginTop: "0.75rem" }}>
          <SelectField
            label="iPhone status bar"
            value={values.appleStatusBarStyle}
            options={APPLE_STATUS_BAR_STYLES.map((style) => ({
              value: style,
              label: APPLE_STATUS_BAR_LABELS[style],
            }))}
            onChange={set("appleStatusBarStyle")}
          />
        </div>
        <span className="help-text">
          iOS reads its own tags rather than the manifest, so this one setting
          is said separately.
        </span>
      </section>

      <section className="panel">
        <h2 className="panel-title">Icons</h2>
        <p className="help-text">
          Square PNGs, one row per size. Devices pick the nearest they can use,
          so a 512 alone will be scaled down for the home screen — give both,
          and a maskable one so Android does not crop the artwork.
        </p>

        {wanted.length > 0 ? (
          <div className="admin-notice" style={{ marginBottom: "0.75rem" }}>
            <strong>Still missing:</strong>
            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
              {wanted.map((icon) => (
                <li key={`${icon.sizes}-${icon.purpose}`}>
                  {icon.sizes}
                  {icon.purpose === "maskable" ? " maskable" : ""} — {icon.why}{" "}
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => addIcon(icon.sizes, icon.purpose)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {values.icons.length === 0 ? (
          <p className="member-note">
            No icons yet. A site with none can still be installed, but the
            device will use whatever it can find — usually the favicon, blown up.
          </p>
        ) : null}

        {values.icons.map((icon, index) => (
          <div
            key={index}
            className="panel"
            style={{ marginTop: "0.75rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}
          >
            <div style={{ width: "10rem" }}>
              <MediaField
                label={`Icon ${index + 1}`}
                value={icon.url}
                mediaType="image"
                onChange={(url, asset) =>
                  setIcon(index, {
                    url,
                    mediaId: asset?._id ?? "",
                    type: iconTypeFor(url),
                    // What was uploaded is what it measures, so the size is
                    // read off the picture rather than typed and mistyped.
                    sizes:
                      iconSizesFor(asset?.width, asset?.height) || icon.sizes,
                  })
                }
              />
            </div>

            <div style={{ flex: "1 1 14rem", minWidth: "12rem" }}>
              <div className="field-grid">
                <TextField
                  label="Size"
                  value={icon.sizes}
                  placeholder="512x512"
                  onChange={(value) => setIcon(index, { sizes: value })}
                />
                <SelectField
                  label="Used for"
                  value={icon.purpose}
                  options={PWA_ICON_PURPOSES.map((purpose) => ({
                    value: purpose,
                    label: PWA_ICON_PURPOSE_LABELS[purpose],
                  }))}
                  onChange={(purpose) => setIcon(index, { purpose })}
                />
              </div>
              <span className="help-text">
                {PWA_ICON_PURPOSE_HELP[icon.purpose]}
              </span>
              <div style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  onClick={() => removeIcon(index)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: "0.75rem" }}
          disabled={pending}
          onClick={() => addIcon()}
        >
          Add an icon
        </button>

        {apple ? (
          <p className="help-text" style={{ marginTop: "0.75rem" }}>
            iPhones and iPads will use the {apple.sizes} icon: they read a tag
            of their own, want 180 square, and do not understand a maskable one.
          </p>
        ) : null}
      </section>

      {usable.length > 0 ? (
        <section className="panel">
          <h2 className="panel-title">On a home screen</h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem",
              borderRadius: "0.75rem",
              background: values.backgroundColor,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={protectedMediaUrl((apple ?? usable[0]).url)}
              alt=""
              style={{
                width: "4rem",
                height: "4rem",
                objectFit: "cover",
                borderRadius: "0.9rem",
                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.3)",
              }}
            />
            <span
              style={{
                color: values.themeColor,
                fontWeight: 600,
                fontSize: "0.9375rem",
              }}
            >
              {values.shortName || values.name || siteName}
            </span>
          </div>
          <span className="help-text">
            Roughly: the icon, the short name, and the two colours. Every device
            rounds the corners its own way.
          </span>
        </section>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <a className="btn btn-sm" href="/manifest.webmanifest" target="_blank" rel="noreferrer">
          View the manifest
        </a>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ marginLeft: "auto" }}
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
