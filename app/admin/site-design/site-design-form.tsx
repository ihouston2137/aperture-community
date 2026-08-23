"use client";

import { useState } from "react";

import {
  CheckField,
  NumField,
  RemField,
  SelectField,
} from "@/components/builder/settings-fields";
import { ASPECT_RATIOS, aspectRatioLabel } from "@/lib/aspect-ratio";
import {
  COLLECTION_LAYOUTS,
  defaultCollectionDisplay,
  defaultLightboxSettings,
  defaultOverlaySettings,
  META_FIELDS,
  META_PLACEMENTS,
  type CollectionDisplay,
  type MetadataDisplay,
} from "@/lib/display-templates";

import { saveSiteDesignAction } from "../settings-actions";

/**
 * Site-wide defaults every collection starts from. A collection's own values
 * are laid over these, so changing one here reaches every collection that has
 * not stated its own.
 */
export function SiteDesignForm({
  displayDefaults,
  templateDefaults,
}: {
  displayDefaults: CollectionDisplay;
  templateDefaults: {
    overlay: MetadataDisplay;
    lightbox: MetadataDisplay;
  };
}) {
  const [display, setDisplay] = useState<CollectionDisplay>(displayDefaults);
  const [overlay, setOverlay] = useState(templateDefaults.overlay);
  const [lightbox, setLightbox] = useState(templateDefaults.lightbox);

  function metadataPanel(
    title: string,
    value: MetadataDisplay,
    onChange: (next: MetadataDisplay) => void
  ) {
    return (
      <section className="panel">
        <h2 className="panel-title">{title}</h2>
        <CheckField
          label="Show metadata"
          value={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
        {value.enabled ? (
          <>
            <div className="field-grid" style={{ marginTop: "0.75rem" }}>
              <SelectField
                label="Placement"
                value={value.placement}
                options={META_PLACEMENTS.map((placement) => ({
                  value: placement,
                  label: placement.replace("-", " "),
                }))}
                onChange={(placement) => onChange({ ...value, placement })}
              />
            </div>
            <CheckField
              label="Always visible"
              value={value.alwaysVisible}
              onChange={(alwaysVisible) => onChange({ ...value, alwaysVisible })}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.5rem" }}>
              {META_FIELDS.map((field) => (
                <label key={field} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={value.fields.includes(field)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        fields: event.target.checked
                          ? [...value.fields, field]
                          : value.fields.filter((item) => item !== field),
                      })
                    }
                  />
                  {field}
                </label>
              ))}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <form action={saveSiteDesignAction}>
      <input
        type="hidden"
        name="collectionDisplayDefaults"
        value={JSON.stringify(display)}
      />
      <input
        type="hidden"
        name="collectionTemplateDefaults"
        value={JSON.stringify({ overlay, lightbox })}
      />
      <input type="hidden" name="collectionStyleOverrides" value={JSON.stringify({})} />

      <section className="panel">
        <h2 className="panel-title">Collection defaults</h2>
        <div className="field-grid">
          <SelectField
            label="Layout"
            value={display.layoutMode}
            options={COLLECTION_LAYOUTS.map((value) => ({
              value,
              label: value[0].toUpperCase() + value.slice(1),
            }))}
            onChange={(layoutMode) => setDisplay({ ...display, layoutMode })}
          />
          <SelectField
            label="Loading"
            value={display.displayMode}
            options={[
              { value: "all", label: "Show all" },
              { value: "lazy", label: "Lazy load" },
              { value: "pagination", label: "Pagination" },
            ]}
            onChange={(displayMode) => setDisplay({ ...display, displayMode })}
          />
          <NumField
            label="Page size"
            value={display.pageSize}
            min={1}
            onChange={(pageSize) => setDisplay({ ...display, pageSize })}
          />
          <SelectField
            label="Image ratio"
            value={display.imageAspect}
            options={ASPECT_RATIOS.map((value) => ({
              value,
              label: aspectRatioLabel(value),
            }))}
            onChange={(imageAspect) => setDisplay({ ...display, imageAspect })}
          />
          <SelectField
            label="Image fit"
            value={display.imageFit}
            options={[
              { value: "fill", label: "Fill (cropped)" },
              { value: "full", label: "Full" },
            ]}
            onChange={(imageFit) => setDisplay({ ...display, imageFit })}
          />
          <NumField
            label="Desktop columns"
            value={display.columnsDesktop}
            min={1}
            max={12}
            onChange={(columnsDesktop) => setDisplay({ ...display, columnsDesktop })}
          />
          <NumField
            label="Tablet columns"
            value={display.columnsTablet}
            min={1}
            max={12}
            onChange={(columnsTablet) => setDisplay({ ...display, columnsTablet })}
          />
          <NumField
            label="Mobile columns"
            value={display.columnsMobile}
            min={1}
            max={12}
            onChange={(columnsMobile) => setDisplay({ ...display, columnsMobile })}
          />
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <CheckField
            label="Share buttons"
            value={display.shareEnabled}
            onChange={(shareEnabled) => setDisplay({ ...display, shareEnabled })}
          />
          <RemField
            label="Share icon size"
            value={display.shareIconSize}
            onChange={(shareIconSize) => setDisplay({ ...display, shareIconSize })}
          />
          <RemField
            label="Opened image icon size"
            value={display.imageShareIconSize}
            onChange={(imageShareIconSize) =>
              setDisplay({ ...display, imageShareIconSize })
            }
          />
          <CheckField
            label="Allow downloads"
            value={display.allowDownload}
            onChange={(allowDownload) => setDisplay({ ...display, allowDownload })}
          />
          <CheckField
            label="Allow right-click / context menu"
            value={display.allowContextMenu}
            onChange={(allowContextMenu) => setDisplay({ ...display, allowContextMenu })}
          />
        </div>

        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: "0.75rem" }}
          onClick={() => {
            setDisplay({ ...defaultCollectionDisplay });
            setOverlay({ ...defaultOverlaySettings });
            setLightbox({ ...defaultLightboxSettings });
          }}
        >
          Reset everything to the built-in defaults
        </button>
      </section>

      {metadataPanel("Default grid overlay", overlay, setOverlay)}
      {metadataPanel("Default opened image", lightbox, setLightbox)}

      <button type="submit" className="btn btn-primary">
        Save site design
      </button>
    </form>
  );
}
