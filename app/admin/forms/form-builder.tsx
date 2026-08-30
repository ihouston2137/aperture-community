"use client";

import { useState } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { LayoutBuilder, type PaletteItem } from "@/components/builder/layout-builder";
import {
  CheckField,
  NumField,
  RemField,
  SelectField,
  TextField,
} from "@/components/builder/settings-fields";
import {
  HeadlineBlock,
  ImageBlock,
  PlainTextBlock,
  RichTextBlock,
  VideoBlock,
} from "@/components/block-primitives";
import { FormFieldView, FormPlaceholderStyle } from "@/components/form-shell";
import { RichTextEditor } from "@/components/rich-text-editor";
import { InlineStyleEditor, StyleEditor } from "@/components/style-editor";
import type { AdminExit } from "@/lib/admin-exit";
import type { BuilderSources } from "@/lib/builder-sources";
import { styleSlotProps } from "@/lib/display-templates";
import {
  createFormBlock,
  FILE_UPLOAD_KINDS,
  FORM_BLOCK_TYPES,
  isFieldBlock,
  type FormBlock,
  type FormBlockType,
  type FormSettings,
  type OptionLayout,
} from "@/lib/form-layout";
import { NEW_CONTAINER_PADDING, type PageBlock, type PageRow } from "@/lib/page-layout";
import type { StyleValues } from "@/lib/style-values";
import {
  CONTENT_WIDTHS,
  CONTENT_WIDTH_LABELS,
  CONTENT_WIDTH_VALUES,
} from "@/lib/site-values";

import { saveFormAction } from "./actions";

const LABELS: Record<string, string> = {
  headline: "Headline",
  plainText: "Plain text",
  richText: "Rich text",
  image: "Image",
  video: "Video",
  shortText: "Short text",
  email: "Email",
  phone: "Phone",
  longText: "Long text",
  select: "Dropdown",
  checkbox: "Checkbox",
  checkboxGroup: "Checkbox group",
  radio: "Radio group",
  date: "Date",
  number: "Number",
  file: "File upload",
  hidden: "Hidden field",
  submit: "Submit button",
};

const BLOCK_ICONS: Record<string, string> = {
  headline: "Heading",
  plainText: "Type",
  richText: "Pilcrow",
  image: "Image",
  video: "Video",
  shortText: "TextCursorInput",
  email: "Mail",
  phone: "Phone",
  longText: "AlignLeft",
  select: "ListChecks",
  checkbox: "SquareCheck",
  checkboxGroup: "ListTodo",
  radio: "CircleDot",
  date: "Calendar",
  number: "Hash",
  file: "Upload",
  hidden: "EyeOff",
  submit: "Send",
};

/**
 * Page blocks first, then the fields. The two are different things — one
 * arranges the form, the other collects an answer — and the palette says so.
 */
const PALETTE: PaletteItem[] = FORM_BLOCK_TYPES.map((type) => ({
  type,
  label: LABELS[type] ?? type,
  icon: BLOCK_ICONS[type],
  group: isFieldBlock(type) ? "Form fields" : "Page blocks",
}));

/** The form-wide style slots, all edited in the settings column. */
type GlobalStyleKey =
  | "formStyle"
  | "successStyle"
  | "labelStyle"
  | "fieldStyle"
  | "placeholderStyle"
  | "helpStyle";

const GLOBAL_STYLE_TITLES: Record<GlobalStyleKey, string> = {
  formStyle: "Form container",
  successStyle: "Thank-you message",
  labelStyle: "Labels",
  fieldStyle: "Fields",
  placeholderStyle: "Placeholder text",
  helpStyle: "Help text",
};

/**
 * One folded set of style controls.
 *
 * A full panel of controls per slot, and six slots, so they fold — all six
 * open would be several screens deep and the canvas would be off the bottom of
 * the page, which is the one thing these settings need to be read against.
 * `details` folds without state.
 */
function StyleFold({
  title,
  summary,
  children,
}: {
  title: string;
  /** What the slot is set to now, so a fold says something while closed. */
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="inspector-fold is-top">
      <summary>
        {title}
        <span className="help-text">{summary}</span>
      </summary>
      <div className="inspector-fold-body">{children}</div>
    </details>
  );
}

export type FormRecord = {
  _id?: string;
  title: string;
  slug: string;
  status: string;
  layout: PageRow[];
  settings: FormSettings;
};

/**
 * A field on the canvas: the public renderer, made inert.
 *
 * Not a second implementation — that is how the canvas stopped showing the
 * form's own label and field styles in the first place. Clicks are swallowed so
 * the tile stays a selection surface.
 */
function FieldPreview({
  block,
  settings,
}: {
  block: FormBlock;
  settings: FormSettings;
}) {
  if (block.type === "hidden") {
    return <div className="help-text">Hidden: {block.name}</div>;
  }

  if (block.type === "submit") {
    return <span className="pb-button">{block.label}</span>;
  }

  return (
    <div style={{ pointerEvents: "none" }}>
      <FormFieldView block={block} settings={settings} disabled />
    </div>
  );
}

export function FormBuilder({
  form,
  sources,
  exit = { href: "/admin/forms", label: "Forms", token: "" },
}: {
  form: FormRecord;
  sources: BuilderSources;
  /**
   * Where the way-back link goes. Defaulted to this editor's own list, so only
   * a caller arriving from somewhere else has to say anything.
   */
  exit?: AdminExit;
}) {
  const [layout, setLayout] = useState<PageRow[]>(form.layout);
  const [title, setTitle] = useState(form.title);
  const [slug, setSlug] = useState(form.slug);
  const [status, setStatus] = useState(form.status);
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [styleTarget, setStyleTarget] = useState<FormBlock | null>(null);
  const [applyStyle, setApplyStyle] = useState<((patch: Partial<PageBlock>) => void) | null>(
    null
  );

  const formStyled = styleSlotProps(settings.formStyle);

  /**
   * One of the form's own style slots, edited in the settings column.
   *
   * In the column rather than a popup because these dress the whole form at
   * once: a label colour is a decision about every label on the canvas, and
   * judging it means seeing them all change as the value does. A popup covers
   * the thing being judged.
   */
  const globalStyle = (target: GlobalStyleKey) => {
    const slot = settings[target];
    const write = (styleSlug: string, style: StyleValues) =>
      setSettings((current) => ({
        ...current,
        [target]: { styleSlug, style: styleSlug ? {} : style },
      }));

    return (
      <StyleFold
        key={target}
        title={GLOBAL_STYLE_TITLES[target]}
        summary={
          slot.styleSlug
            ? slot.styleSlug
            : Object.keys(slot.style ?? {}).length > 0
              ? "set"
              : "unset"
        }
      >
        <InlineStyleEditor
          values={slot.style}
          styleSlug={slot.styleSlug}
          fonts={sources.fonts}
          savedStyles={sources.styles}
          // Placeholder text is reached through a `::placeholder` rule, which
          // a saved style's class cannot cross into — so that one slot offers
          // its values only, rather than a choice that would do nothing.
          showSavedStyles={target !== "placeholderStyle"}
          onChange={({ values, styleSlug }) => write(styleSlug, values)}
        />
      </StyleFold>
    );
  };

  return (
    <>
      <form action={saveFormAction} id="form-form">
        {/* The way-back token, carried through the save's own redirect —
            without it, pressing Save silently sends you back to the admin
            list instead of wherever you came from. */}
        <input type="hidden" name="from" value={exit.token} />
        {form._id ? <input type="hidden" name="id" value={form._id} /> : null}
        <input type="hidden" name="layout" value={JSON.stringify(layout)} />
        <input type="hidden" name="settings" value={JSON.stringify(settings)} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="status" value={status} />
      </form>

      <LayoutBuilder
        layout={layout}
        onChange={setLayout}
        palette={PALETTE}
        documentSettings={
          <div className="inspector-section">
            <h4 className="inspector-title">Page</h4>
            <SelectField
              label="Form width"
              value={settings.pageWidth}
              options={CONTENT_WIDTHS.map((width) => ({
                value: width,
                label: CONTENT_WIDTH_LABELS[width],
              }))}
              onChange={(pageWidth) => setSettings((current) => ({ ...current, pageWidth }))}
            />
            {globalStyle("formStyle")}

            <h4 className="inspector-title">After sending</h4>
            <div className="field">
              <label>Thank-you message</label>
              <textarea
                rows={3}
                value={settings.successMessage}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    successMessage: event.target.value,
                  }))
                }
              />
            </div>
            {globalStyle("successStyle")}
            <p className="help-text" style={{ marginTop: 0 }}>
              Shown in place of the form once it has been sent. Ignored when a
              redirect is set.
            </p>

            <h4 className="inspector-title">Field styles</h4>
            <p className="help-text" style={{ marginTop: 0 }}>
              Applied to every field. A block&rsquo;s own style is laid over
              these, so one field can still depart from the rest.
            </p>
            {globalStyle("labelStyle")}
            {globalStyle("fieldStyle")}
            {globalStyle("placeholderStyle")}
            {globalStyle("helpStyle")}
            <p className="help-text">
              Every change here shows on the canvas as you make it, across all
              the fields at once.
            </p>
          </div>
        }
        canvasContentClassName={`form-shell ${formStyled.className}`.trim()}
        canvasContentStyle={{
          maxWidth: CONTENT_WIDTH_VALUES[settings.pageWidth],
          ...formStyled.style,
        }}
        canvasHeader={
          // The one rule the canvas cannot get from a style attribute.
          <FormPlaceholderStyle scope=".builder-canvas" settings={settings} />
        }
        createBlock={(type) => createFormBlock(type as FormBlockType) as unknown as PageBlock}
        blockLabel={(block) => LABELS[block.type] ?? block.type}
        renderPreview={(block) => {
          const formBlock = block as unknown as FormBlock;
          if (!isFieldBlock(formBlock.type)) {
            switch (formBlock.type) {
              case "headline":
                return <HeadlineBlock block={formBlock} />;
              case "plainText":
                return <PlainTextBlock block={formBlock} />;
              case "richText":
                return <RichTextBlock block={formBlock} />;
              case "image":
                return <ImageBlock block={formBlock} />;
              case "video":
                return <VideoBlock block={formBlock} />;
              default:
                return null;
            }
          }
          return <FieldPreview block={formBlock} settings={settings} />;
        }}
        renderInspector={(block, update) => {
          const formBlock = block as unknown as FormBlock;
          const patch = update as (patch: Partial<FormBlock>) => void;

          return (
            <>
              <div className="inspector-section">
                <h4 className="inspector-title">Style</h4>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setStyleTarget(formBlock);
                    setApplyStyle(() => update);
                  }}
                >
                  Edit style…
                </button>
              </div>

              <div className="inspector-section">
                <h4 className="inspector-title">Settings</h4>

                {formBlock.type === "headline" ? (
                  <>
                    <TextField
                      label="Text"
                      value={formBlock.text ?? ""}
                      onChange={(value) => patch({ text: value })}
                    />
                    <NumField
                      label="Heading level"
                      value={formBlock.level ?? 2}
                      min={1}
                      max={6}
                      onChange={(value) => patch({ level: value })}
                    />
                  </>
                ) : null}

                {formBlock.type === "plainText" ? (
                  <div className="field">
                    <label>Text</label>
                    <textarea
                      rows={4}
                      value={formBlock.text ?? ""}
                      onChange={(event) => patch({ text: event.target.value })}
                    />
                  </div>
                ) : null}

                {formBlock.type === "richText" ? (
                  <RichTextEditor
                    value={formBlock.html ?? ""}
                    onChange={(html) => patch({ html })}
                    fonts={sources.fonts}
                    minHeight={10}
                  />
                ) : null}

                {formBlock.type === "image" || formBlock.type === "video" ? (
                  <>
                    <MediaField
                      label={formBlock.type === "image" ? "Image" : "Video"}
                      value={formBlock.mediaUrl ?? ""}
                      mediaType={formBlock.type}
                      onChange={(url, asset) =>
                        patch({ mediaUrl: url, mediaId: asset?._id ?? "" })
                      }
                    />
                    <TextField
                      label="Caption"
                      value={formBlock.caption ?? ""}
                      onChange={(value) => patch({ caption: value })}
                    />
                    <RemField
                      label="Width (0 = full)"
                      value={formBlock.width ?? 0}
                      onChange={(value) => patch({ width: value })}
                    />
                  </>
                ) : null}

                {formBlock.type === "submit" ? (
                  <>
                    <TextField
                      label="Label"
                      value={formBlock.label ?? ""}
                      onChange={(value) => patch({ label: value })}
                    />
                    <SelectField
                      label="Alignment"
                      value={formBlock.align ?? "left"}
                      options={[
                        { value: "left", label: "Left" },
                        { value: "center", label: "Center" },
                        { value: "right", label: "Right" },
                      ]}
                      onChange={(value) => patch({ align: value })}
                    />
                  </>
                ) : null}

                {isFieldBlock(formBlock.type) && formBlock.type !== "submit" ? (
                  <>
                    <TextField
                      label="Label"
                      value={formBlock.label ?? ""}
                      onChange={(value) => patch({ label: value })}
                    />
                    <TextField
                      label="Field name"
                      value={formBlock.name ?? ""}
                      onChange={(value) => patch({ name: value })}
                    />
                    <TextField
                      label="Placeholder"
                      value={formBlock.placeholder ?? ""}
                      onChange={(value) => patch({ placeholder: value })}
                    />
                    <TextField
                      label="Help text"
                      value={formBlock.helpText ?? ""}
                      onChange={(value) => patch({ helpText: value })}
                    />
                    <CheckField
                      label="Required"
                      value={Boolean(formBlock.required)}
                      onChange={(value) => patch({ required: value })}
                    />

                    {formBlock.type === "radio" ||
                    formBlock.type === "checkboxGroup" ? (
                      <SelectField
                        label="Options laid out"
                        value={formBlock.optionLayout ?? "column"}
                        options={[
                          { value: "column", label: "Down the page" },
                          { value: "row", label: "Along the line" },
                        ]}
                        onChange={(value) =>
                          patch({ optionLayout: value as OptionLayout })
                        }
                      />
                    ) : null}

                    {formBlock.type === "select" ||
                    formBlock.type === "radio" ||
                    formBlock.type === "checkboxGroup" ? (
                      <div className="field">
                        <label>Options (one per line)</label>
                        <textarea
                          rows={4}
                          value={(formBlock.options ?? []).join("\n")}
                          onChange={(event) =>
                            patch({
                              options: event.target.value
                                .split("\n")
                                .map((option) => option.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                    ) : null}

                    {formBlock.type === "number" ? (
                      <div className="inspector-grid">
                        <NumField label="Min" value={formBlock.min ?? 0} onChange={(v) => patch({ min: v })} />
                        <NumField label="Max" value={formBlock.max ?? 0} onChange={(v) => patch({ max: v })} />
                        <NumField label="Step" value={formBlock.step ?? 1} onChange={(v) => patch({ step: v })} />
                      </div>
                    ) : null}

                    {formBlock.type === "file" ? (
                      <>
                        <SelectField
                          label="Accepted files"
                          value={formBlock.uploadKind ?? "any"}
                          options={FILE_UPLOAD_KINDS.map((kind) => ({ value: kind, label: kind }))}
                          onChange={(value) => patch({ uploadKind: value })}
                        />
                        <NumField
                          label="Max size (MB)"
                          value={formBlock.maxSizeMb ?? 25}
                          min={1}
                          max={100}
                          onChange={(value) => patch({ maxSizeMb: value })}
                        />
                        <CheckField
                          label="Allow multiple files"
                          value={Boolean(formBlock.multiple)}
                          onChange={(value) => patch({ multiple: value })}
                        />
                      </>
                    ) : null}

                    {formBlock.type === "hidden" ? (
                      <TextField
                        label="Value"
                        value={formBlock.defaultValue ?? ""}
                        onChange={(value) => patch({ defaultValue: value })}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          );
        }}
        newContainerPadding={NEW_CONTAINER_PADDING}
        exitHref={exit.href}
        exitLabel={exit.label}
        topbar={
          <>
            <input
              className="input"
              style={{ maxWidth: "14rem" }}
              value={title}
              placeholder="Form title"
              onChange={(event) => setTitle(event.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: "10rem" }}
              value={slug}
              placeholder="slug"
              onChange={(event) => setSlug(event.target.value)}
            />
            <select
              className="input"
              style={{ maxWidth: "8rem" }}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <input
              className="input"
              style={{ maxWidth: "16rem" }}
              value={settings.notifyEmails.join(", ")}
              placeholder="Notify emails (comma separated)"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  notifyEmails: event.target.value
                    .split(",")
                    .map((email) => email.trim())
                    .filter(Boolean),
                }))
              }
            />
            <button type="submit" form="form-form" className="btn btn-primary btn-sm">
              Save
            </button>
          </>
        }
      />

      <StyleEditor
        open={Boolean(styleTarget)}
        title="Block style"
        fonts={sources.fonts}
        savedStyles={sources.styles}
        initial={{ values: styleTarget?.textStyle, styleSlug: styleTarget?.styleSlug }}
        onClose={() => setStyleTarget(null)}
        onApply={(result) => {
          applyStyle?.({
            styleSlug: result.styleSlug,
            textStyle: result.styleSlug ? undefined : result.values,
          });
          setStyleTarget(null);
        }}
      />
    </>
  );
}
