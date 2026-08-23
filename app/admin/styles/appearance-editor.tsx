"use client";

import { useState } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { AdminHeader } from "@/components/admin-ui";
import { CheckField, NumField, SelectField } from "@/components/builder/settings-fields";
import { ColorPicker } from "@/components/color-field";
import { StyleEditor } from "@/components/style-editor";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import {
  CONTENT_WIDTHS,
  CONTENT_WIDTH_LABELS,
  SITE_TEXT_ELEMENTS,
  type AppearanceValues,
  type ContentWidth,
  type SiteContentValues,
  type SiteMenuLink,
  type SiteTextElementKey,
} from "@/lib/site-values";

import { saveSiteAppearanceAction } from "../settings-actions";
import { APPEARANCE_PREFIX, CONTENT_PREFIX } from "../settings-field-names";
import { SitePreview } from "./site-preview";

type Tab = "appearance" | "content" | "links";

type MenuLink = { label: string; href: string; newTab?: boolean };
type SocialLink = { platform: string; label: string; href: string };

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <ColorPicker label={label} value={value} onChange={onChange} />;
}

function WidthField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ContentWidth;
  onChange: (value: ContentWidth) => void;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      options={CONTENT_WIDTHS.map((width) => ({
        value: width,
        label: CONTENT_WIDTH_LABELS[width],
      }))}
      onChange={onChange}
    />
  );
}

/** Repeating rows of links, shared by the menu and social lists. */
function LinkRows<T extends Record<string, any>>({
  rows,
  columns,
  blank,
  onChange,
}: {
  rows: T[];
  columns: { key: keyof T & string; label: string; type?: "text" | "checkbox" }[];
  blank: T;
  onChange: (rows: T[]) => void;
}) {
  return (
    <>
      {rows.map((row, index) => (
        <div
          key={index}
          style={{
            border: "1px solid var(--admin-border)",
            borderRadius: "var(--radius)",
            padding: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          {columns.map((column) =>
            column.type === "checkbox" ? (
              <CheckField
                key={column.key}
                label={column.label}
                value={Boolean(row[column.key])}
                onChange={(checked) =>
                  onChange(
                    rows.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, [column.key]: checked } : item
                    )
                  )
                }
              />
            ) : (
              <div key={column.key} className="field">
                <label>{column.label}</label>
                <input
                  type="text"
                  value={String(row[column.key] ?? "")}
                  onChange={(event) =>
                    onChange(
                      rows.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, [column.key]: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </div>
            )
          )}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onChange([...rows, { ...blank }])}
      >
        Add
      </button>
    </>
  );
}

/**
 * The header menu: a flat list of items, each either a link or a label with its
 * own nested list of child links.
 */
function MenuRows({
  rows,
  onChange,
}: {
  rows: SiteMenuLink[];
  onChange: (rows: SiteMenuLink[]) => void;
}) {
  const patch = (index: number, changes: Partial<SiteMenuLink>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  return (
    <>
      {rows.map((row, index) => {
        const isLabel = row.kind === "label";
        const children = row.children ?? [];

        return (
          <div key={index} className="menu-row">
            <SelectField
              label="Type"
              value={isLabel ? "label" : "link"}
              options={[
                { value: "link", label: "Link" },
                { value: "label", label: "Label with dropdown" },
              ]}
              onChange={(value) =>
                patch(index, { kind: value as SiteMenuLink["kind"] })
              }
            />

            <div className="field">
              <label>Label</label>
              <input
                type="text"
                value={row.label ?? ""}
                onChange={(event) => patch(index, { label: event.target.value })}
              />
            </div>

            {isLabel ? (
              <div className="menu-children">
                <CheckField
                  label="Show dropdown arrow"
                  value={row.showCaret !== false}
                  onChange={(checked) => patch(index, { showCaret: checked })}
                />
                <p className="help-text">Dropdown links</p>
                <LinkRows
                  rows={children as MenuLink[]}
                  columns={[
                    { key: "label", label: "Label" },
                    { key: "href", label: "Link" },
                    { key: "newTab", label: "Open in a new tab", type: "checkbox" },
                  ]}
                  blank={{ label: "", href: "", newTab: false }}
                  onChange={(childRows) => patch(index, { children: childRows })}
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Link</label>
                  <input
                    type="text"
                    value={row.href ?? ""}
                    onChange={(event) => patch(index, { href: event.target.value })}
                  />
                </div>
                <CheckField
                  label="Open in a new tab"
                  value={Boolean(row.newTab)}
                  onChange={(checked) => patch(index, { newTab: checked })}
                />
              </>
            )}

            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onChange([...rows, { label: "", href: "", newTab: false, kind: "link" }])
        }
      >
        Add
      </button>
    </>
  );
}

export function AppearanceEditor({
  initialAppearance,
  initialContent,
  fonts,
  canAppearance,
  canContent,
  saved,
}: {
  initialAppearance: AppearanceValues;
  initialContent: SiteContentValues;
  fonts: string[];
  canAppearance: boolean;
  canContent: boolean;
  saved: boolean;
}) {
  const [appearance, setAppearance] = useState(initialAppearance);
  const [content, setContent] = useState(initialContent);
  const [tab, setTab] = useState<Tab>(canAppearance ? "appearance" : "content");
  // Which text element the style popup is currently editing.
  const [styleTarget, setStyleTarget] = useState<SiteTextElementKey | null>(null);

  const setA =
    <K extends keyof AppearanceValues>(key: K) =>
    (value: AppearanceValues[K]) =>
      setAppearance((current) => ({ ...current, [key]: value }));

  const setC =
    <K extends keyof SiteContentValues>(key: K) =>
    (value: SiteContentValues[K]) =>
      setContent((current) => ({ ...current, [key]: value }));

  const fontOptions = ["system-ui", ...fonts].map((font) => ({ value: font, label: font }));

  const textStyles = appearance.textStyles ?? {};
  const activeStyle = styleTarget ? textStyles[styleTarget] : undefined;

  /** Groups of styleable text elements, in the order they appear on a page. */
  const styleGroups = ["Header", "Page", "Footer"] as const;

  return (
    <form action={saveSiteAppearanceAction}>
      <AdminHeader
        title="Appearance"
        subtitle="Colours, typography, header and footer layout, and site content — with a live preview."
        actions={
          <>
            {saved ? <span className="save-status">Settings saved.</span> : null}
            <button type="submit" className="btn btn-primary">
              Save settings
            </button>
          </>
        }
      />

      {/* Every value is posted as a hidden field so one Save covers both tabs,
          including settings on the tab that is not currently visible. */}
      {/* Field names are namespaced because both models use some of the same
          keys — `footerText` is a colour here and a sentence in site content. */}
      {canAppearance
        ? Object.entries(appearance).map(([key, value]) => {
            const name = `${APPEARANCE_PREFIX}${key}`;
            if (typeof value === "boolean") {
              return value ? <input key={key} type="hidden" name={name} value="on" /> : null;
            }
            // The per-element text styles travel as JSON.
            if (value && typeof value === "object") {
              return (
                <input key={key} type="hidden" name={name} value={JSON.stringify(value)} />
              );
            }
            return <input key={key} type="hidden" name={name} value={String(value)} />;
          })
        : null}

      {canContent ? (
        <>
          {(
            [
              "metaTitle",
              "metaDescription",
              "metaImageUrl",
              "headerBrandText",
              "headerBrandHref",
              "headerTagline",
              "logoUrl",
              "logoMediaId",
              "logoHeight",
              "availabilityLabel",
              "availabilityHref",
              "footerBrandText",
              "footerLogoUrl",
              "footerLogoMediaId",
              "footerLogoHeight",
              "footerText",
              "copyright",
            ] as const
          ).map((key) => (
            <input
              key={key}
              type="hidden"
              name={`${CONTENT_PREFIX}${key}`}
              value={String(content[key] ?? "")}
            />
          ))}
          {content.showLogo ? (
            <input type="hidden" name={`${CONTENT_PREFIX}showLogo`} value="on" />
          ) : null}
          {content.showBrandText ? (
            <input type="hidden" name={`${CONTENT_PREFIX}showBrandText`} value="on" />
          ) : null}
          {content.showFooterLogo ? (
            <input type="hidden" name={`${CONTENT_PREFIX}showFooterLogo`} value="on" />
          ) : null}
          {content.availabilityEnabled ? (
            <input type="hidden" name={`${CONTENT_PREFIX}availabilityEnabled`} value="on" />
          ) : null}
          {content.safeModeDefault ? (
            <input type="hidden" name={`${CONTENT_PREFIX}safeModeDefault`} value="on" />
          ) : null}
          <input
            type="hidden"
            name={`${CONTENT_PREFIX}menuLinks`}
            value={JSON.stringify(content.menuLinks)}
          />
          <input
            type="hidden"
            name={`${CONTENT_PREFIX}socialLinks`}
            value={JSON.stringify(content.socialLinks)}
          />
        </>
      ) : null}

      <div className="appearance-workspace">
        <aside className="appearance-settings panel">
        <div className="builder-tabs">
          {canAppearance ? (
            <button
              type="button"
              className={`builder-tab${tab === "appearance" ? " is-active" : ""}`}
              onClick={() => setTab("appearance")}
            >
              Appearance
            </button>
          ) : null}
          {canContent ? (
            <button
              type="button"
              className={`builder-tab${tab === "content" ? " is-active" : ""}`}
              onClick={() => setTab("content")}
            >
              Site content
            </button>
          ) : null}
          {canContent ? (
            <button
              type="button"
              className={`builder-tab${tab === "links" ? " is-active" : ""}`}
              onClick={() => setTab("links")}
            >
              Menu &amp; social
            </button>
          ) : null}
        </div>

        {tab === "appearance" ? (
          <>
            <div className="inspector-section">
              <h3 className="inspector-title">Header colours</h3>
              <ColorRow
                label="Background"
                value={appearance.headerBackground}
                onChange={setA("headerBackground")}
              />
              <ColorRow
                label="Text"
                value={appearance.headerText}
                onChange={setA("headerText")}
              />
              <ColorRow
                label="Accent"
                value={appearance.headerAccent}
                onChange={setA("headerAccent")}
              />
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Header layout</h3>
              <WidthField
                label="Content width"
                value={appearance.headerWidth}
                onChange={setA("headerWidth")}
              />
              <NumField
                label="Vertical padding (rem)"
                value={appearance.headerPaddingY}
                step={0.125}
                min={0}
                onChange={setA("headerPaddingY")}
              />
              <SelectField
                label="Navigation alignment"
                value={appearance.headerNavAlign}
                options={[
                  { value: "left", label: "Beside the brand" },
                  { value: "center", label: "Centred" },
                  { value: "right", label: "Far right" },
                ]}
                onChange={setA("headerNavAlign")}
              />
              <div className="inspector-grid">
                <NumField
                  label="Nav size (rem)"
                  value={appearance.headerNavSize}
                  step={0.0625}
                  min={0.5}
                  onChange={setA("headerNavSize")}
                />
                <NumField
                  label="Nav gap (rem)"
                  value={appearance.headerNavGap}
                  step={0.125}
                  min={0}
                  onChange={setA("headerNavGap")}
                />
              </div>
              <CheckField
                label="Stick to the top when scrolling"
                value={appearance.headerSticky}
                onChange={setA("headerSticky")}
              />
              <CheckField
                label="Drop shadow"
                value={appearance.headerShadow}
                onChange={setA("headerShadow")}
              />
              <CheckField
                label="Bottom border"
                value={appearance.headerBorderEnabled}
                onChange={setA("headerBorderEnabled")}
              />
              {appearance.headerBorderEnabled ? (
                <>
                  <NumField
                    label="Border width (rem)"
                    value={appearance.headerBorderWidth}
                    step={0.0625}
                    min={0}
                    onChange={setA("headerBorderWidth")}
                  />
                  <ColorRow
                    label="Border colour"
                    value={appearance.headerBorderColor}
                    onChange={setA("headerBorderColor")}
                  />
                </>
              ) : null}
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Content colours</h3>
              <ColorRow
                label="Background"
                value={appearance.contentBackground}
                onChange={setA("contentBackground")}
              />
              <ColorRow
                label="Text"
                value={appearance.contentText}
                onChange={setA("contentText")}
              />
              <ColorRow
                label="Accent"
                value={appearance.contentAccent}
                onChange={setA("contentAccent")}
              />
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Footer</h3>
              <ColorRow
                label="Background"
                value={appearance.footerBackground}
                onChange={setA("footerBackground")}
              />
              <ColorRow
                label="Text"
                value={appearance.footerText}
                onChange={setA("footerText")}
              />
              <WidthField
                label="Content width"
                value={appearance.footerWidth}
                onChange={setA("footerWidth")}
              />
              <div className="inspector-grid">
                <NumField
                  label="Vertical padding (rem)"
                  value={appearance.footerPaddingY}
                  step={0.125}
                  min={0}
                  onChange={setA("footerPaddingY")}
                />
                <NumField
                  label="Font size (rem)"
                  value={appearance.footerFontSize}
                  step={0.0625}
                  min={0.5}
                  onChange={setA("footerFontSize")}
                />
              </div>
              <div className="inspector-grid">
                <NumField
                  label="Column gap (rem)"
                  value={appearance.footerColumnGap}
                  step={0.125}
                  min={0}
                  onChange={setA("footerColumnGap")}
                />
                <NumField
                  label="Row gap (rem)"
                  value={appearance.footerRowGap}
                  step={0.125}
                  min={0}
                  onChange={setA("footerRowGap")}
                />
              </div>
              <SelectField
                label="Alignment"
                value={appearance.footerAlign}
                options={[
                  { value: "between", label: "Spread apart" },
                  { value: "left", label: "Left" },
                  { value: "center", label: "Centred" },
                ]}
                onChange={setA("footerAlign")}
              />
              <CheckField
                label="Top border"
                value={appearance.footerBorderEnabled}
                onChange={setA("footerBorderEnabled")}
              />
              {appearance.footerBorderEnabled ? (
                <>
                  <NumField
                    label="Border width (rem)"
                    value={appearance.footerBorderWidth}
                    step={0.0625}
                    min={0}
                    onChange={setA("footerBorderWidth")}
                  />
                  <ColorRow
                    label="Border colour"
                    value={appearance.footerBorderColor}
                    onChange={setA("footerBorderColor")}
                  />
                </>
              ) : null}
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Typography</h3>
              <SelectField
                label="Heading font"
                value={appearance.headingFont}
                options={fontOptions}
                onChange={setA("headingFont")}
              />
              <SelectField
                label="Body font"
                value={appearance.bodyFont}
                options={fontOptions}
                onChange={setA("bodyFont")}
              />
              <p className="help-text">
                Fonts come from the design library. Use Text styles below for
                weight, capitalisation and per-element sizing.
              </p>
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Text styles</h3>
              <p className="help-text">
                Style individual text elements of the public pages. Changes show in
                the preview straight away.
              </p>

              {styleGroups.map((group) => (
                <div key={group} style={{ marginTop: "0.75rem" }}>
                  <div className="admin-nav-group" style={{ padding: 0 }}>
                    {group}
                  </div>
                  {SITE_TEXT_ELEMENTS.filter((element) => element.group === group).map(
                    (element) => {
                      const configured = Boolean(textStyles[element.key]);
                      return (
                        <div
                          key={element.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginTop: "0.3rem",
                          }}
                        >
                          <span style={{ flex: 1, fontSize: "0.875rem" }}>
                            {element.label}
                          </span>
                          {configured ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              title="Remove the styling for this element"
                              onClick={() => {
                                const next = { ...textStyles };
                                delete next[element.key];
                                setA("textStyles")(next);
                              }}
                            >
                              Reset
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`btn btn-sm${configured ? " btn-primary" : ""}`}
                            onClick={() => setStyleTarget(element.key)}
                          >
                            {configured ? "Edit" : "Style"}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>
              ))}
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Admin theme</h3>
              <ColorRow
                label="Background"
                value={appearance.adminBackground}
                onChange={setA("adminBackground")}
              />
              <ColorRow
                label="Panel"
                value={appearance.adminPanel}
                onChange={setA("adminPanel")}
              />
              <ColorRow
                label="Text"
                value={appearance.adminText}
                onChange={setA("adminText")}
              />
              <ColorRow
                label="Accent"
                value={appearance.adminAccent}
                onChange={setA("adminAccent")}
              />
            </div>
          </>
        ) : null}

        {tab === "links" ? (
          <>
            <div className="inspector-section">
              <h3 className="inspector-title">Site menu</h3>
              <p className="help-text">
                Items shown in the header navigation. A label is not a link
                itself — it opens a dropdown of the links beneath it.
              </p>
              <div style={{ marginTop: "0.6rem" }}>
                <MenuRows
                  rows={content.menuLinks as SiteMenuLink[]}
                  onChange={(rows) => setC("menuLinks")(rows)}
                />
              </div>
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Social links</h3>
              <p className="help-text">Shown in the footer.</p>
              <div style={{ marginTop: "0.6rem" }}>
                <LinkRows
                  rows={content.socialLinks as SocialLink[]}
                  columns={[
                    { key: "platform", label: "Platform" },
                    { key: "label", label: "Label" },
                    { key: "href", label: "Link" },
                  ]}
                  blank={{ platform: "", label: "", href: "" }}
                  onChange={(rows) => setC("socialLinks")(rows)}
                />
              </div>
            </div>
          </>
        ) : null}

        {tab === "content" ? (
          <>
            <div className="inspector-section">
              <h3 className="inspector-title">Metadata</h3>
              <div className="field">
                <label>Site title</label>
                <input
                  type="text"
                  value={content.metaTitle}
                  onChange={(event) => setC("metaTitle")(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Description</label>
                <input
                  type="text"
                  value={content.metaDescription}
                  onChange={(event) => setC("metaDescription")(event.target.value)}
                />
              </div>
              <MediaField
                label="Social share image"
                value={content.metaImageUrl}
                mediaType="image"
                onChange={(url) => setC("metaImageUrl")(url)}
              />
              <MediaField
                label="Favicon"
                value={appearance.faviconUrl}
                mediaType="image"
                onChange={(url) => setA("faviconUrl")(url)}
              />
              <p className="help-text">
                A square PNG, SVG or ICO works best for the favicon.
              </p>
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Header content</h3>
              <div className="field">
                <label>Brand text</label>
                <input
                  type="text"
                  value={content.headerBrandText}
                  onChange={(event) => setC("headerBrandText")(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Brand link</label>
                <input
                  type="text"
                  value={content.headerBrandHref}
                  onChange={(event) => setC("headerBrandHref")(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Tagline</label>
                <input
                  type="text"
                  value={content.headerTagline}
                  onChange={(event) => setC("headerTagline")(event.target.value)}
                />
              </div>
              <MediaField
                label="Logo"
                value={content.logoUrl}
                mediaType="image"
                onChange={(url, asset) => {
                  setC("logoUrl")(url);
                  setC("logoMediaId")(asset?._id ?? "");
                }}
              />
              <NumField
                label="Logo height (px)"
                value={content.logoHeight}
                min={8}
                onChange={setC("logoHeight")}
              />
              <CheckField
                label="Show logo"
                value={content.showLogo}
                onChange={setC("showLogo")}
              />
              <CheckField
                label="Show brand text"
                value={content.showBrandText}
                onChange={setC("showBrandText")}
              />
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Availability call to action</h3>
              <CheckField
                label="Show in the header"
                value={content.availabilityEnabled}
                onChange={setC("availabilityEnabled")}
              />
              <div className="field">
                <label>Label</label>
                <input
                  type="text"
                  value={content.availabilityLabel}
                  onChange={(event) => setC("availabilityLabel")(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Link</label>
                <input
                  type="text"
                  value={content.availabilityHref}
                  onChange={(event) => setC("availabilityHref")(event.target.value)}
                />
              </div>
            </div>

            <div className="inspector-section">
              <h3 className="inspector-title">Footer content</h3>
              <div className="field">
                <label>Brand text</label>
                <input
                  type="text"
                  value={content.footerBrandText}
                  onChange={(event) => setC("footerBrandText")(event.target.value)}
                />
              </div>
              <MediaField
                label="Footer logo"
                value={content.footerLogoUrl}
                mediaType="image"
                onChange={(url, asset) => {
                  setC("footerLogoUrl")(url);
                  setC("footerLogoMediaId")(asset?._id ?? "");
                }}
              />
              <NumField
                label="Footer logo height (px)"
                value={content.footerLogoHeight}
                min={8}
                onChange={setC("footerLogoHeight")}
              />
              <CheckField
                label="Show footer logo"
                value={content.showFooterLogo}
                onChange={setC("showFooterLogo")}
              />
              <div className="field">
                <label>Footer text</label>
                <input
                  type="text"
                  value={content.footerText}
                  onChange={(event) => setC("footerText")(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Copyright</label>
                <input
                  type="text"
                  value={content.copyright}
                  onChange={(event) => setC("copyright")(event.target.value)}
                />
              </div>
              {/* Only the control is hidden — the hidden input above still
                  round-trips the stored value, so the setting comes back
                  untouched if the feature is switched on again. */}
              {NSFW_FEATURES_ENABLED ? (
                <CheckField
                  label="Safe mode on by default for new visitors"
                  value={content.safeModeDefault}
                  onChange={setC("safeModeDefault")}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </aside>

        <section className="appearance-preview-pane panel">
          <h2 className="panel-title">Live preview</h2>
          <SitePreview appearance={appearance} content={content} />
        </section>
      </div>

      <StyleEditor
        open={Boolean(styleTarget)}
        title={`Style: ${
          SITE_TEXT_ELEMENTS.find((element) => element.key === styleTarget)?.label ?? ""
        }`}
        fonts={fonts}
        // Named styles work by adding a class to a block; these rules target
        // fixed chrome selectors, so only local values apply here.
        savedStyles={[]}
        initial={{
          values: activeStyle?.style,
          hoverEnabled: activeStyle?.hoverEnabled,
          hoverValues: activeStyle?.hoverStyle,
          transitionDuration: activeStyle?.transitionDuration,
        }}
        onClose={() => setStyleTarget(null)}
        onApply={(result) => {
          if (styleTarget) {
            setA("textStyles")({
              ...textStyles,
              [styleTarget]: {
                style: result.values,
                hoverEnabled: result.hoverEnabled,
                hoverStyle: result.hoverValues,
                transitionDuration: result.transitionDuration,
              },
            });
          }
          setStyleTarget(null);
        }}
      />
    </form>
  );
}
