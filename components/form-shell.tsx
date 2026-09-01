"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";

import { styleSlotProps } from "@/lib/display-templates";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { UPLOAD_KIND_PREFIXES } from "@/lib/upload-kinds";
import {
  collectFormFields,
  isFieldBlock,
  isTypedField,
  normalizeFormLayout,
  normalizeFormSettings,
  type FormBlock,
  type FormSettings,
} from "@/lib/form-layout";
import type { SittingRef, TestGrade } from "@/lib/form-test";
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
  /**
   * Which questions this sitting was served, for a test.
   *
   * Sent back with the answers so the marking knows which paper it was —
   * a test drawn from a pool, or varied per question, is not the same set of
   * questions twice. The key itself never comes to the browser.
   */
  sitting?: SittingRef[];
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
  chosen = [],
  error,
  disabled = false,
  onChange = () => {},
  onUpload = () => {},
  onToggle = () => {},
}: {
  block: FormBlock;
  settings: FormSettings;
  value?: string;
  files?: UploadedFile[];
  /** A checkbox group's ticked options. Empty for every other field. */
  chosen?: string[];
  error?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onUpload?: (fileList: FileList | null) => void;
  onToggle?: (option: string, ticked: boolean) => void;
}) {
  const inputId = `field-${block.id}`;

  if (block.type === "hidden") {
    return <input type="hidden" name={block.name} value={block.defaultValue ?? ""} />;
  }

  /*
   * The form's own label and field styles, with the block's laid over them —
   * so a form reads as one thing while a single field can still depart from it.
   */
  const own = blockTextProps(block);
  const labelStyled = styleSlotProps(settings.labelStyle);

  /*
   * Which of the two field styles dresses this control.
   *
   * A box somebody writes into is not the same kind of thing as a dropdown or
   * a row of choices: the first is a rectangle of their own words and wants
   * room and a line height, the second is furniture. One style over both made
   * every change to either a compromise, so they are set apart here.
   *
   * The line is drawn at "has a text box in it", not at the keyboard a phone
   * puts up: an email and a telephone number are the same object to dress as a
   * line of short text, and dressing them apart from it was never the point.
   */
  const fieldStyled = styleSlotProps(
    isTypedField(block.type) ? settings.textFieldStyle : settings.fieldStyle
  );

  const className = `${labelStyled.className} ${own.className}`.trim();
  const style = { ...labelStyled.style, ...own.style };

  /** Spread onto every control, so one setting dresses them all. */
  const fieldProps = {
    className: `input ${fieldStyled.className}`.trim(),
    style: fieldStyled.style,
  };

  /*
   * The words beside a checkbox or a radio button.
   *
   * The same field style, without the `input` class: a tick box is a tick box
   * and takes no dressing, so the field style has nowhere to land on one of
   * these unless it lands on the text — which is the only part of the control
   * that a font, a size or a colour can be seen on at all.
   */
  const optionTextProps = {
    className: fieldStyled.className || undefined,
    style: fieldStyled.style,
  };

  /*
   * What the browser groups these inputs by.
   *
   * The block's own `name` will not do. A radio's `name` is what makes a set of
   * them one choice, and a name is derived from the label — so every question
   * added from the palette starts out called "choose_one", and a page with
   * three of them had three questions sharing one group: answering the third
   * silently cleared the first two. On a test drawing a different few questions
   * each time, that reads as the answers not lining up with the questions.
   *
   * The block id instead, which is the one thing that is already unique. The
   * submission is built from state keyed by that id and never read out of the
   * form, so nothing downstream depends on what this says.
   */
  const groupName = `field-${block.id}`;

  /*
   * The question's own picture, between what was asked and where it is
   * answered.
   *
   * Below the words and above the control, because that is the order the
   * question is read in: "which of these is the aileron", the photograph, then
   * the choices. Put anywhere else it stops being part of the question.
   *
   * Dressed by nothing here. The label and field styles belong to words and to
   * boxes; a font size or a colour laid over a photograph does nothing, and a
   * border laid over one is the kind of surprise a shared style should never
   * spring. Its width is its own setting.
   */
  const picture = block.mediaUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={protectedMediaUrl(block.mediaUrl)}
      alt={block.alt ?? ""}
      className="form-question-image"
      style={block.width ? { width: `${block.width}rem` } : undefined}
    />
  ) : null;

  const label = (
    <>
      <label htmlFor={inputId} className={className || undefined} style={style}>
        {block.label}
        {block.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {picture}
    </>
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
          {picture}
          <div className={`checkbox-rows is-${block.optionLayout ?? "column"}`}>
            {(block.options ?? []).map((option) => (
              <label key={option} className="checkbox-row">
                <input
                  type="radio"
                  name={groupName}
                  value={option}
                  checked={value === option}
                  disabled={disabled}
                  onChange={() => onChange(option)}
                />
                <span {...optionTextProps}>{option}</span>
              </label>
            ))}
          </div>
          {help}
          {errorNode}
        </fieldset>
      );

    case "checkboxGroup":
      return (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={className || undefined} style={style}>
            {block.label}
            {block.required ? <span aria-hidden="true"> *</span> : null}
          </legend>
          {picture}
          <div className={`checkbox-rows is-${block.optionLayout ?? "column"}`}>
            {(block.options ?? []).map((option) => (
              <label key={option} className="checkbox-row">
                <input
                  type="checkbox"
                  name={groupName}
                  value={option}
                  checked={chosen.includes(option)}
                  disabled={disabled}
                  onChange={(event) => onToggle(option, event.target.checked)}
                />
                <span {...optionTextProps}>{option}</span>
              </label>
            ))}
          </div>
          {help}
          {errorNode}
        </fieldset>
      );

    case "checkbox":
      return (
        <div className="field">
          {/* Above the box rather than beside it: the words next to a tick box
              are the control, and a photograph does not belong inside one. */}
          {picture}
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
            {/* The words next to the box are the control, not a prompt above
                it, so they follow the field style like every other control. */}
            <span {...optionTextProps}>{block.label}</span>
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
  /*
   * A checkbox group's answer is several answers, so it is kept apart from the
   * one-value fields rather than squeezed into a delimited string — an option
   * reading "Cheese, crackers" would break any delimiter chosen for it.
   */
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [uploads, setUploads] = useState<Record<string, UploadedFile[]>>({});
  /** What the test came back as, when it was one and the result is shown. */
  const [grade, setGrade] = useState<TestGrade | null>(null);
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
          : field.type === "checkboxGroup"
            ? // In the order they are set out, not the order they were ticked:
              // a submission should read the way the form did.
              (field.options ?? []).filter((option) =>
                (chosen[field.id] ?? []).includes(option)
              )
            : values[field.id] ?? field.defaultValue ?? "";
      // Named, unless that name is taken — see the same rule on the server,
      // which is the one that decides what is stored.
      data[field.name && !(field.name in data) ? field.name : field.id] = value;
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
        body: JSON.stringify({
          formId: form.id,
          data,
          fields: ordered,
          sitting: form.sitting ?? [],
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("sent");
      setMessage(settings.successMessage);
      setGrade((result.grade as TestGrade | undefined) ?? null);
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
        chosen={chosen[block.id] ?? []}
        files={uploads[block.id] ?? []}
        error={errors[block.id]}
        disabled={disabled}
        onChange={(value) => setValues((current) => ({ ...current, [block.id]: value }))}
        onToggle={(option, ticked) =>
          setChosen((current) => {
            const now = current[block.id] ?? [];
            return {
              ...current,
              [block.id]: ticked
                ? [...now, option]
                : now.filter((entry) => entry !== option),
            };
          })
        }
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
      <>
        <div className={successStyled.className || undefined} style={successStyled.style}>
          {message}
        </div>
        {grade ? <TestResult grade={grade} /> : null}
      </>
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

/**
 * What a test came back as.
 *
 * The percentage leads because it is the answer to the question somebody just
 * asked by pressing send. The per-question review is only present when the
 * test is set to show it — it is built from what the server sent, so a test
 * that keeps its answers to itself sends nothing to keep.
 */
function TestResult({ grade }: { grade: TestGrade }) {
  return (
    <section className="test-result" aria-label="Your result">
      <p className="test-result-figure">
        <strong>{grade.percent}%</strong>
        <span>
          {grade.right} of {grade.marked} correct
        </span>

        {/* Said in a word as well as a colour: somebody who cannot tell the
            two apart still has to be told whether they passed. */}
        {grade.passed !== null ? (
          <span
            className="test-result-verdict"
            data-passed={grade.passed ? "true" : "false"}
          >
            {grade.passed ? "Passed" : "Not passed"}
            <span className="help-text">{grade.passMark}% needed</span>
          </span>
        ) : null}
      </p>

      {grade.questions.length > 0 ? (
        <ul className="test-result-list">
          {grade.questions.map((question) => (
            <li
              key={question.questionId}
              className={question.correct ? "is-right" : "is-wrong"}
            >
              <span className="test-result-mark" aria-hidden="true">
                {question.correct ? "\u2713" : "\u2717"}
              </span>
              <span className="test-result-question">
                <strong>{question.label}</strong>
                {/*
                  * Only where the answers came back.
                  *
                  * A test set to show which ones were missed and no more sends
                  * the marks without them, so there is nothing here to print —
                  * and a bare "Correct:" with nothing after it would read as
                  * something having gone wrong rather than as a decision.
                  */}
                {!question.correct && question.expected !== undefined ? (
                  <>
                    <span className="help-text">
                      You answered: {question.given || "nothing"}
                    </span>
                    <span className="help-text">Correct: {question.expected}</span>
                  </>
                ) : null}
              </span>
              <span className="visually-hidden">
                {question.correct ? "Correct" : "Wrong"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
