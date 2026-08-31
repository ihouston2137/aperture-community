"use client";

import { MediaField } from "@/app/admin/media/media-picker";
import { ColorPicker } from "@/components/color-field";
import { FIXED_ASPECT_RATIOS } from "@/lib/aspect-ratio";
import { CONTENT_WIDTHS, CONTENT_WIDTH_LABELS } from "@/lib/site-values";
import {
  BACKGROUND_FITS,
  BACKGROUND_FIT_HELP,
  BACKGROUND_FIT_LABELS,
  MEDIA_BACKGROUNDS,
} from "@/lib/page-layout";
import type {
  BackgroundSettings,
  BorderSettings,
  ColumnSettings,
  PageColumn,
  PageRow,
  RowSettings,
  SpacingSettings,
} from "@/lib/page-layout";
import {
  emptyColorOverrides,
  hasColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import {
  BORDER_SIDES,
  BORDER_SIDE_LABELS,
  type BorderSides,
} from "@/lib/style-values";
import {
  MENU_VISIBILITY_LABELS,
  MENU_VISIBILITY_MODES,
  type MenuVisibility,
  type MenuVisibilityMode,
} from "@/lib/menu-types";

/** A role as the visibility picker offers it. */
export type VisibilityRole = { _id: string; name: string; kind: string };

/**
 * Who a row or a column is for.
 *
 * The same three answers a menu item gives, and deliberately the same words:
 * a members-only strip of a page and a members-only link are one idea, and
 * naming them differently would make them read as two.
 *
 * Choosing "only these roles" and naming nobody would hide it from everybody,
 * which is never what was meant — the normalizer reads that back as public,
 * and the note here says so before it happens.
 */
export function VisibilityFields({
  visibility,
  roles,
  onChange,
}: {
  visibility: MenuVisibility;
  roles: VisibilityRole[];
  onChange: (visibility: MenuVisibility) => void;
}) {
  const community = roles.filter((role) => role.kind === "community");
  const management = roles.filter((role) => role.kind !== "community");

  const toggle = (roleId: string, on: boolean) =>
    onChange({
      mode: "roles",
      roleIds: on
        ? [...new Set([...visibility.roleIds, roleId])]
        : visibility.roleIds.filter((id) => id !== roleId),
    });

  const group = (label: string, list: VisibilityRole[]) =>
    list.length === 0 ? null : (
      <>
        <span className="field-label" style={{ marginTop: "0.5rem" }}>
          {label}
        </span>
        <div className="chip-picker">
          {list.map((role) => (
            <label key={role._id} className="chip-option">
              <input
                type="checkbox"
                checked={visibility.roleIds.includes(role._id)}
                onChange={(event) => toggle(role._id, event.target.checked)}
              />
              {role.name}
            </label>
          ))}
        </div>
      </>
    );

  return (
    <div className="field">
      <label>Visible to</label>
      <select
        value={visibility.mode}
        onChange={(event) =>
          onChange({
            mode: event.target.value as MenuVisibilityMode,
            roleIds: visibility.roleIds,
          })
        }
      >
        {MENU_VISIBILITY_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {MENU_VISIBILITY_LABELS[mode]}
          </option>
        ))}
      </select>

      {visibility.mode === "roles" ? (
        <>
          {group("Membership levels", community)}
          {group("Management roles", management)}
          {visibility.roleIds.length === 0 ? (
            <span className="help-text">
              Naming nobody would hide this from everyone, so it stays visible
              to all until a role is ticked.
            </span>
          ) : null}
        </>
      ) : null}

      <span className="help-text">
        Anything restricted is left out of the page before it is sent, not
        hidden once it arrives — so it is a rule, not a suggestion.
      </span>
    </div>
  );
}

/** Numeric input for a rem-valued setting — no pixel conversion. */
export function RemField({
  label,
  value,
  onChange,
  step = 0.125,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <div className="field">
      <label>
        {label} <span className="help-text">(rem)</span>
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Colour with transparency; re-exported so builders keep one import site. */
export function ColorField({
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

/**
 * Content colour overrides for a whole page or template. Leaving a field empty
 * keeps the site's Appearance setting, so a document only states what it changes.
 */
export function ColorOverrideFields({
  colors,
  onChange,
  scopeLabel,
}: {
  colors: ColorOverrides;
  onChange: (next: ColorOverrides) => void;
  /** e.g. "page" or "template", used in the help text. */
  scopeLabel: string;
}) {
  return (
    <div className="inspector-section">
      <h4 className="inspector-title">Colours</h4>
      <p className="help-text" style={{ marginTop: 0 }}>
        Inherited from the site Appearance settings. Set a colour to override it
        for this {scopeLabel}.
      </p>

      <ColorField
        label="Background"
        value={colors.background}
        onChange={(value) => onChange({ ...colors, background: value })}
      />
      <ColorField
        label="Text"
        value={colors.text}
        onChange={(value) => onChange({ ...colors, text: value })}
      />
      <ColorField
        label="Links and accents"
        value={colors.accent}
        onChange={(value) => onChange({ ...colors, accent: value })}
      />

      {hasColorOverrides(colors) ? (
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: "0.35rem" }}
          onClick={() => onChange(emptyColorOverrides)}
        >
          Reset to the site colours
        </button>
      ) : null}
    </div>
  );
}

export function CheckField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-row">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/* --------------------------------------------- Shared setting groups */

export function SpacingFields<T extends SpacingSettings>({
  settings,
  onChange,
}: {
  settings: T;
  onChange: (patch: Partial<SpacingSettings>) => void;
}) {
  return (
    <div className="inspector-grid">
      <RemField label="Padding top" value={settings.paddingTop} onChange={(v) => onChange({ paddingTop: v })} />
      <RemField label="Padding right" value={settings.paddingRight} onChange={(v) => onChange({ paddingRight: v })} />
      <RemField label="Padding bottom" value={settings.paddingBottom} onChange={(v) => onChange({ paddingBottom: v })} />
      <RemField label="Padding left" value={settings.paddingLeft} onChange={(v) => onChange({ paddingLeft: v })} />
      <RemField label="Margin top" value={settings.marginTop} onChange={(v) => onChange({ marginTop: v })} />
      <RemField label="Margin right" value={settings.marginRight} onChange={(v) => onChange({ marginRight: v })} />
      <RemField label="Margin bottom" value={settings.marginBottom} onChange={(v) => onChange({ marginBottom: v })} />
      <RemField label="Margin left" value={settings.marginLeft} onChange={(v) => onChange({ marginLeft: v })} />
    </div>
  );
}

export function BackgroundFields({
  settings,
  onChange,
  allowStoryFeature = false,
  allowCollectionFeature = false,
}: {
  settings: BackgroundSettings;
  onChange: (patch: Partial<BackgroundSettings>) => void;
  /** Only a bound container and its areas can borrow a feature image. */
  allowStoryFeature?: boolean;
  allowCollectionFeature?: boolean;
}) {
  const isMedia = MEDIA_BACKGROUNDS.includes(settings.backgroundType);

  return (
    <>
      <SelectField
        label="Background"
        value={settings.backgroundType}
        options={[
          // "None" is transparency; "Site colour" paints the content background
          // from Appearance — which is what a nested element needs when the
          // thing behind it is itself coloured.
          { value: "none", label: "None" },
          { value: "site", label: "Site colour" },
          { value: "color", label: "Custom colour" },
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
          ...(allowStoryFeature
            ? [{ value: "storyFeature" as const, label: "Story feature media" }]
            : []),
          ...(allowCollectionFeature
            ? [
                {
                  value: "collectionFeature" as const,
                  label: "Collection feature image",
                },
              ]
            : []),
        ]}
        onChange={(value) => onChange({ backgroundType: value })}
      />

      {settings.backgroundType === "none" ? (
        <p className="help-text" style={{ marginTop: "-0.35rem" }}>
          Transparent — whatever sits behind this shows through.
        </p>
      ) : null}

      {settings.backgroundType === "color" ? (
        // Transparency lives in the colour control itself.
        <ColorField
          label="Colour"
          value={settings.backgroundColor}
          onChange={(value) => onChange({ backgroundColor: value })}
        />
      ) : null}

      {settings.backgroundType === "image" || settings.backgroundType === "video" ? (
        <MediaField
          label="Background media"
          value={settings.backgroundMediaUrl}
          mediaType={settings.backgroundType === "video" ? "video" : "image"}
          onChange={(url) => onChange({ backgroundMediaUrl: url })}
        />
      ) : null}

      {settings.backgroundType === "storyFeature" ? (
        <p className="help-text" style={{ marginTop: "-0.35rem" }}>
          Uses the feature image or video of the story this container is bound to.
        </p>
      ) : null}

      {settings.backgroundType === "collectionFeature" ? (
        <p className="help-text" style={{ marginTop: "-0.35rem" }}>
          Uses the feature image of the collection this container is bound to —
          the one set on the collection, or its first image.
        </p>
      ) : null}

      {isMedia ? (
        <>
          <div className="inspector-grid">
            <SelectField
              label="Fit"
              value={settings.backgroundFit}
              options={BACKGROUND_FITS.map((value) => ({
                value,
                label: BACKGROUND_FIT_LABELS[value],
              }))}
              onChange={(value) => onChange({ backgroundFit: value })}
            />
            <SelectField
              label="Horizontal"
              value={settings.backgroundAlignX}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
              onChange={(value) => onChange({ backgroundAlignX: value })}
            />
            <SelectField
              label="Vertical"
              value={settings.backgroundAlignY}
              options={[
                { value: "top", label: "Top" },
                { value: "center", label: "Center" },
                { value: "bottom", label: "Bottom" },
              ]}
              onChange={(value) => onChange({ backgroundAlignY: value })}
            />
          </div>

          {settings.backgroundFit === "aspect" ? (
            <SelectField
              label="Aspect ratio"
              value={settings.backgroundAspect}
              // `actual` is absent on purpose: this fit exists to state a
              // frame, and "the media's own" is not one.
              options={FIXED_ASPECT_RATIOS.map((value) => ({ value, label: value }))}
              onChange={(value) => onChange({ backgroundAspect: value })}
            />
          ) : null}

          <p className="help-text" style={{ marginTop: "-0.35rem" }}>
            {BACKGROUND_FIT_HELP[settings.backgroundFit]}
          </p>

          <ColorField
            label="Overlay"
            value={settings.backgroundOverlay}
            onChange={(value) => onChange({ backgroundOverlay: value })}
          />
          <p className="help-text" style={{ marginTop: "-0.35rem" }}>
            Painted over the media. Drop its opacity to tint rather than cover.
            {settings.backgroundOverlay ? (
              <>
                {" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChange({ backgroundOverlay: "" })}
                >
                  Remove overlay
                </button>
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </>
  );
}

/** Border width, colour and rounding — shared by containers and their areas. */
export function BorderFields({
  settings,
  onChange,
}: {
  settings: BorderSettings;
  onChange: (patch: Partial<BorderSettings>) => void;
}) {
  return (
    <div className="inspector-grid">
      <RemField
        label="Width"
        value={settings.borderWidth}
        step={0.0625}
        onChange={(value) => onChange({ borderWidth: Math.max(0, value) })}
      />
      <RemField
        label="Rounding"
        value={settings.borderRadius}
        onChange={(value) => onChange({ borderRadius: Math.max(0, value) })}
      />
      <SelectField
        label="Sides"
        value={settings.borderSides ?? "all"}
        options={BORDER_SIDES.map((side) => ({
          value: side,
          label: BORDER_SIDE_LABELS[side],
        }))}
        onChange={(value) => onChange({ borderSides: value as BorderSides })}
      />
      <ColorField
        label="Colour"
        value={settings.borderColor}
        onChange={(value) => onChange({ borderColor: value })}
      />
    </div>
  );
}

export function RowSettingsFields({
  row,
  onChange,
  visibilityRoles,
}: {
  row: PageRow;
  onChange: (patch: Partial<RowSettings>) => void;
  /**
   * Offered only where it is honoured.
   *
   * Rows are shared with the form, document, story and calendar builders, and
   * only a page filters its layout by who is looking. A control in the others
   * would be a promise nothing keeps.
   */
  visibilityRoles?: VisibilityRole[];
}) {
  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Layout</h4>
        {/* Same named scale as the header and footer. */}
        <SelectField
          label="Content width"
          value={row.settings.width}
          options={CONTENT_WIDTHS.map((width) => ({
            value: width,
            label: CONTENT_WIDTH_LABELS[width],
          }))}
          onChange={(value) => onChange({ width: value })}
        />
        <div className="inspector-grid">
          {/* Where the columns sit when they do not fill the row — a row of
              one six-wide column is what this is for. */}
          <SelectField
            label="Alignment"
            value={row.settings.align}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
            onChange={(value) => onChange({ align: value })}
          />
          <SelectField
            label="Vertical"
            value={row.settings.verticalAlign}
            options={[
              { value: "top", label: "Top" },
              { value: "center", label: "Center" },
              { value: "bottom", label: "Bottom" },
            ]}
            onChange={(value) => onChange({ verticalAlign: value })}
          />
        </div>
      </div>

      {visibilityRoles ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Visibility</h4>
          <VisibilityFields
            visibility={row.settings.visibility}
            roles={visibilityRoles}
            onChange={(visibility) => onChange({ visibility })}
          />
        </div>
      ) : null}

      <div className="inspector-section">
        <h4 className="inspector-title">Background</h4>
        <BackgroundFields settings={row.settings} onChange={onChange} />
        {row.settings.backgroundType === "image" ? (
          <CheckField
            label="Parallax"
            value={row.settings.parallax}
            onChange={(value) => onChange({ parallax: value })}
          />
        ) : null}
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Border</h4>
        <BorderFields settings={row.settings} onChange={onChange} />
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Spacing</h4>
        <SpacingFields settings={row.settings} onChange={onChange} />
      </div>
    </>
  );
}

export function ColumnSettingsFields({
  column,
  onChange,
  onSpanChange,
  visibilityRoles,
}: {
  column: PageColumn;
  onChange: (patch: Partial<ColumnSettings>) => void;
  /** Omitted for container cells, whose size comes from their grid placement. */
  onSpanChange?: (span: number) => void;
  /**
   * Offered only where it is honoured.
   *
   * Rows and columns are shared with the form, document, story and calendar
   * builders, and only a page filters its layout by who is looking. A control
   * in the others would be a promise nothing keeps.
   */
  visibilityRoles?: VisibilityRole[];
}) {
  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Layout</h4>
        {onSpanChange ? (
          <NumField
            label="Width (of 12)"
            value={column.span}
            min={1}
            max={12}
            onChange={onSpanChange}
          />
        ) : null}
        <div className="inspector-grid">
          <SelectField
            label="Alignment"
            value={column.settings.align}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
            onChange={(value) => onChange({ align: value })}
          />
          <SelectField
            label="Vertical"
            value={column.settings.verticalAlign}
            options={[
              { value: "top", label: "Top" },
              { value: "center", label: "Center" },
              { value: "bottom", label: "Bottom" },
            ]}
            onChange={(value) => onChange({ verticalAlign: value })}
          />
        </div>
      </div>

      {visibilityRoles ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Visibility</h4>
          <VisibilityFields
            visibility={column.settings.visibility}
            roles={visibilityRoles}
            onChange={(visibility) => onChange({ visibility })}
          />
        </div>
      ) : null}

      <div className="inspector-section">
        <h4 className="inspector-title">Background</h4>
        <BackgroundFields settings={column.settings} onChange={onChange} />
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Border</h4>
        <BorderFields settings={column.settings} onChange={onChange} />
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Spacing</h4>
        <SpacingFields settings={column.settings} onChange={onChange} />
      </div>
    </>
  );
}
