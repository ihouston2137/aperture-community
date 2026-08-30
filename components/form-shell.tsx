"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";

import { styleSlotProps } from "@/lib/display-templates";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { UPLOAD_KIND_PREFIXES } from "@/lib/upload-kinds";
import {
  collectFormFields,
  isFieldBlock,
  normalizeFormLayout,
  normalizeFormSettings,
  type FormBlock,
  type FormSettings,
} from "@/lib/form-layout";
import type { PageColumn, PageRow } from "@/lib/page-layout";
import { CONTENT_WIDTH_VALUES } from "@/lib/site-values";
import { styleValuesToDeclarations } from "@/lib/style-values";

import {
  BlockWrapper,
  ColumnShell,
  HeadlineBlock,
  ImageBlock,
  PlainTextBlock,
  RichTextBlock,
  RowShell,
  VideoBlock,
  blockTextProps,
} from "./block-primitives";

export type FormShellForm = {
  id: string;
  title: string;
  slug: string;
  layout: unknown[];
  settings: Record<string, unknown>;
};

type UploadedFile = {
  name: string;
  url: string;
  size: number;
  /** `image`, `video`, `audio` or `file` — decides whether it can be shown. */
  mediaType?: string;
};

/**
 * The one rule that cannot be applied inline.
 *
 * `::placeholder` is a pseudo-element, so it can only be reached from a
 * stylesheet — hence a scoped rule rather than a style attribute like every
 * other slot here. Rendered by the public form and the builder canvas alike,
 * each passing its own scope.
 */
export function FormPlaceholderStyle({
  scope,
  settings,
}: {
  scope: string;
  settings: FormSettings;
}) {
  const declarations = styleValuesToDeclarations(settings.placeholderStyle.style);
  if (!declarations.trim()) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `${scope} ::placeholder {\n${declarations}\n}`,
      }}
    />
  );
}

/**
 * A file field: a drop area rather than a bare file input.
 *
 * `accept` is built from the very prefixes the upload route validates against,
 * so the picker offers exactly what the server will take — a narrower or wider
 * list here would only produce rejections the reader cannot explain.
 */
function FileDropzone({
  block,
  files,
  disabled,
  inputId,
  fieldProps,
  onUpload,
}: {
  block: FormBlock;
  files: UploadedFile[];
  disabled: boolean;
  inputId: string;
  fieldProps: { className: string; style?: CSSProperties };
  onUpload: (fileList: FileList | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (UPLOAD_KIND_PREFIXES[block.uploadKind ?? "any"] ?? [])
    .map((prefix) => `${prefix}*`)
    .join(",");

  const limit = block.maxSizeMb ?? 25;
  const what = block.uploadKind && block.uploadKind !== "any" ? `${block.uploadKind} ` : "";

  return (
    <div
      className={`form-dropzone ${fieldProps.className}${dragging ? " is-dragging" : ""}`}
      style={fieldProps.style}
      data-disabled={disabled ? "true" : undefined}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) onUpload(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept || undefined}
        multiple={block.multiple}
        disabled={disabled}
        // The drop area is the control; this only exists to open the picker.
        style={{ display: "none" }}
        onChange={(event) => onUpload(event.target.files)}
      />

      <strong>
        Drop {block.multiple ? `${what}files` : `a ${what}file`} here, or click to
        choose
      </strong>
      <span className="help-text">Up to {limit} MB each.</span>

      {files.length > 0 ? (
        // Shown for what can be shown; everything else keeps its name, which is
        // all a document or an audio file has to identify it by.
        <ul className="form-dropzone-files">
          {files.map((file) => (
            <li key={file.url} title={file.name}>
              {file.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={protectedMediaUrl(file.url)} alt="" loading="lazy" />
              ) : file.mediaType === "video" ? (
                // `metadata` is enough for a first frame, and avoids pulling
                // the whole file down just to preview it.
                <video src={protectedMediaUrl(file.url)} preload="metadata" muted />
              ) : null}
              <span>{file.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One field, rendered the same way on the public form and in the builder's
 * canvas. Exported so the canvas cannot grow a second version of this — a
 * preview with its own markup is a preview that quietly stops matching.
 */
export function FormFieldView({
  block,
  settings,
  value = "",
  files = [],
  error,
  disabled = false,
  onChange = () => {},
  onUpload = () => {},
}: {
  block: FormBlock;
  settings: FormSettings;
  value?: string;
  files?: UploadedFile[];
  error?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onUpload?: (fileList: FileList | null) => void;
}) {
  const inputId = `field-${block.id}`;

  if (block.type === "hidden") {
    return <input type="hidden" name={block.name} value={block.defaultValue ?? ""} />;
  }

  /*
   * The form's own label and field styles, with the block's laid over them —
   * so a form reads as one thing while a single field can still depart from it.
   *
   * The label and the control are dressed from separate slots at both levels:
   * a small grey caption over a large bordered input is the ordinary case, and
   * one style applied to both cannot say it.
   */
  const ownLabel = styleSlotProps({
    styleSlug: block.labelStyleSlug ?? "",
    style: block.labelStyle ?? {},
  });
  const ownField = styleSlotProps({
    styleSlug: block.fieldStyleSlug ?? "",
    style: block.fieldStyle ?? {},
  });
  const labelStyled = styleSlotProps(settings.labelStyle);
  const fieldStyled = styleSlotProps(settings.fieldStyle);

  const className = `${labelStyled.className} ${ownLabel.className}`.trim();
  const style = { ...labelStyled.style, ...ownLabel.style };

  /** Spread onto every control, so one setting dresses them all. */
  const fieldProps = {
    className: `input ${fieldStyled.className} ${ownField.className}`.trim(),
    style: { ...fieldStyled.style, ...ownField.style },
  };

  const label = (
    <label htmlFor={inputId} className={className || undefined} style={style}>
      {block.label}
      {block.required ? <span aria-hidden="true"> *</span> : null}
    </label>
  );

  const helpStyled = styleSlotProps(settings.helpStyle);
  const help = block.helpText ? (
    <span className={`help-text ${helpStyled.className}`.trim()} style={helpStyled.style}>
      {block.helpText}
    </span>
  ) : null;
  const errorNode = error ? (
    <span className="help-text" style={{ color: "#f28b82" }}>
      {error}
    </span>
  ) : null;

  const common = {
    id: inputId,
    name: block.name,
    required: block.required,
    disabled,
    placeholder: block.placeholder || undefined,
  };

  switch (block.type) {
    case "longText":
      return (
        <div className="field">
          {label}
          <textarea
            {...common}
            {...fieldProps}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
          {errorNode}
        </div>
      );

    case "select":
      return (
        <div className="field">
          {label}
          <select
            {...common}
            {...fieldProps}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{block.placeholder || "Select…"}</option>
            {(block.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {help}
          {errorNode}
        </div>
      );

    case "radio":
      return (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={className || undefined} style={style}>
            {block.label}
            {block.required ? <span aria-hidden="true"> *</span> : null}
          </legend>
          {(block.options ?? []).map((option) => (
            <label key={option} className="checkbox-row">
              <input
                type="radio"
                name={block.name}
                value={option}
                checked={value === option}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
          {help}
          {errorNode}
        </fieldset>
      );

    case "checkbox":
      return (
        <div className="field">
          <label className="checkbox-row">
            <input
              id={inputId}
              name={block.name}
              type="checkbox"
              checked={value === "yes"}
              disabled={disabled}
              required={block.required}
              onChange={(event) => onChange(event.target.checked ? "yes" : "")}
            />
            <span className={className || undefined} style={style}>
              {block.label}
            </span>
          </label>
          {help}
          {errorNode}
        </div>
      );

    case "file":
      return (
        <div className="field">
          {label}
          <FileDropzone
            block={block}
            files={files}
            disabled={disabled}
            inputId={inputId}
            fieldProps={fieldProps}
            onUpload={onUpload}
          />
          {help}
          {errorNode}
        </div>
      );

    case "number":
      return (
        <div className="field">
          {label}
          <input
            {...common}
            type="number"
            {...fieldProps}
            min={block.min || undefined}
            max={block.max || undefined}
            step={block.step || undefined}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
          {errorNode}
        </div>
      );

    default: {
      const inputType =
        block.type === "email"
          ? "email"
          : block.type === "phone"
            ? "tel"
            : block.type === "date"
              ? "date"
              : "text";
      return (
        <div className="field">
          {label}
          <input
            {...common}
            type={inputType}
            {...fieldProps}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
          {errorNode}
        </div>
      );
    }
  }
}

export function FormShell({
  form,
  interactive = true,
}: {
  form: FormShellForm;
  interactive?: boolean;
}) {
  const layout = useMemo(() => normalizeFormLayout(form.layout), [form.layout]);
  const settings = useMemo(() => normalizeFormSettings(form.settings), [form.settings]);
  const fields = useMemo(() => collectFormFields(layout), [layout]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Record<string, UploadedFile[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const disabled = !interactive || status === "sending" || status === "sent";

  async function handleUpload(block: FormBlock, fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !interactive) return;

    const body = new FormData();
    for (const file of Array.from(fileList)) body.append("files", file);
    body.append("kind", block.uploadKind ?? "any");
    body.append("maxSizeMb", String(block.maxSizeMb ?? 25));
    body.append("multiple", String(Boolean(block.multiple)));

    setErrors((current) => ({ ...current, [block.id]: "" }));

    try {
      const response = await fetch("/api/forms/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) {
        setErrors((current) => ({ ...current, [block.id]: result.error ?? "Upload failed." }));
        return;
      }
      // A field that takes several files accumulates them: with a drop area,
      // adding a second batch is ordinary, and replacing the first would throw
      // away files the visitor believes they attached.
      setUploads((current) => ({
        ...current,
        [block.id]: block.multiple
          ? [...(current[block.id] ?? []), ...(result.files as UploadedFile[])]
          : (result.files as UploadedFile[]),
      }));
    } catch {
      setErrors((current) => ({ ...current, [block.id]: "Upload failed." }));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive) return;

    setStatus("sending");
    setMessage("");

    // Submissions are stored twice: keyed data for lookups, and an ordered
    // field list so the admin can render them in builder order.
    const data: Record<string, unknown> = {};
    const ordered = fields.map((field) => {
      const value =
        field.type === "file"
          ? (uploads[field.id] ?? []).map((file) => file.url)
          : values[field.id] ?? field.defaultValue ?? "";
      data[field.name ?? field.id] = value;
      return {
        id: field.id,
        name: field.name,
        label: field.label,
        type: field.type,
        value,
      };
    });

    try {
      const response = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: form.id, data, fields: ordered }),
      });
      const result = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("sent");
      setMessage(settings.successMessage);
      if (settings.redirectUrl) window.location.href = settings.redirectUrl;
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  function renderBlock(block: FormBlock) {
    if (!isFieldBlock(block.type)) {
      switch (block.type) {
        case "headline":
          return <HeadlineBlock block={block} />;
        case "plainText":
          return <PlainTextBlock block={block} />;
        case "richText":
          return <RichTextBlock block={block} />;
        case "image":
          return <ImageBlock block={block} />;
        case "video":
          return <VideoBlock block={block} />;
        default:
          return null;
      }
    }

    if (block.type === "submit") {
      const { className, style } = blockTextProps(block);
      return (
        <div
          style={{
            display: "flex",
            justifyContent:
              block.align === "center"
                ? "center"
                : block.align === "right"
                  ? "flex-end"
                  : "flex-start",
          }}
        >
          <button
            type="submit"
            className={`pb-button ${className}`.trim()}
            style={style}
            disabled={disabled}
          >
            {status === "sending" ? "Sending…" : block.label || settings.submitLabel}
          </button>
        </div>
      );
    }

    return (
      <FormFieldView
        block={block}
        settings={settings}
        value={values[block.id] ?? block.defaultValue ?? ""}
        files={uploads[block.id] ?? []}
        error={errors[block.id]}
        disabled={disabled}
        onChange={(value) => setValues((current) => ({ ...current, [block.id]: value }))}
        onUpload={(fileList) => handleUpload(block, fileList)}
      />
    );
  }

  if (status === "sent" && !settings.redirectUrl) {
    // No styling of its own: whatever the form's success slot says, and nothing
    // otherwise. It used to borrow the admin's notice styling, which has no
    // business on a public page.
    const successStyled = styleSlotProps(settings.successStyle);
    return (
      <div className={successStyled.className || undefined} style={successStyled.style}>
        {message}
      </div>
    );
  }

  const formStyled = styleSlotProps(settings.formStyle);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate={!interactive}
      data-form={form.id}
      className={`form-shell ${formStyled.className}`.trim()}
      style={{
        maxWidth: CONTENT_WIDTH_VALUES[settings.pageWidth],
        ...formStyled.style,
      }}
    >
      {/* Scoped to this form, so two forms on one page keep their own. */}
      <FormPlaceholderStyle scope={`[data-form="${form.id}"]`} settings={settings} />

      {status === "error" && message ? (
        <div className="admin-notice is-error">{message}</div>
      ) : null}

      {layout.map((row: PageRow) => (
        <RowShell key={row.id} row={row}>
          {row.columns.map((column: PageColumn) => (
            <ColumnShell key={column.id} column={column}>
              {/* The same wrapper pages use, so a field fills its column for
                  exactly the reason an image does. */}
              {(column.blocks as FormBlock[]).map((block) => (
                <BlockWrapper key={block.id} block={block}>
                  {renderBlock(block)}
                </BlockWrapper>
              ))}
            </ColumnShell>
          ))}
        </RowShell>
      ))}
    </form>
  );
}
