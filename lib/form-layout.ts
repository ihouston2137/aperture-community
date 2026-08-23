import {
  emptyStyleSlot,
  normalizeStyleSlot,
  type StyleSlot,
} from "./display-templates";
import { normalizeRichText } from "./rich-text";
import { sanitizeMediaPath } from "./protected-media-url";
import {
  FORM_BLOCK_TYPES,
  FORM_FIELD_BLOCK_TYPES,
  FORM_VISUAL_BLOCK_TYPES,
  isFieldBlock,
  type FormBlockType,
} from "./form-block-types";
import { CONTENT_WIDTHS, type ContentWidth } from "./site-values";
import { normalizeStyleValues, type StyleValues } from "./style-values";
import {
  createColumn,
  createRow,
  makeId,
  normalizePageLayout,
  type PageRow,
} from "./page-layout";

/**
 * The form builder reuses the page builder's row/column model so the two
 * previews and both public renderers behave identically. Only the block
 * vocabulary differs: five visual blocks shared with pages, plus field blocks.
 */

// The vocabulary itself lives in `form-block-types` so `page-layout` can read
// the field list without a cycle. Re-exported so callers keep one import site.
export {
  FORM_VISUAL_BLOCK_TYPES,
  FORM_FIELD_BLOCK_TYPES,
  FORM_BLOCK_TYPES,
  isFieldBlock,
};
export type { FormBlockType };

export const FILE_UPLOAD_KINDS = ["image", "video", "audio", "document", "any"] as const;
export type FileUploadKind = (typeof FILE_UPLOAD_KINDS)[number];

export type FormBlock = {
  id: string;
  type: FormBlockType;

  styleSlug?: string;
  textStyle?: StyleValues;

  // visual
  text?: string;
  html?: string;
  level?: number;
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  caption?: string;
  width?: number;
  radius?: number;
  controls?: boolean;

  // field
  name?: string;
  label?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
  min?: number;
  max?: number;
  step?: number;

  // file upload
  uploadKind?: FileUploadKind;
  maxSizeMb?: number;
  multiple?: boolean;

  // submit
  align?: "left" | "center" | "right";
};

export type FormSettings = {
  successMessage: string;
  submitLabel: string;
  notifyEmails: string[];
  redirectUrl: string;
  /** The same named scale rows, the header and collections use. */
  pageWidth: ContentWidth;
  /** Dresses the box around the whole form. */
  formStyle: StyleSlot;
  /**
   * Dresses the message shown once a form has been sent. It carries no styling
   * of its own, so an unset slot leaves plain text rather than an admin notice
   * borrowed from a different part of the app.
   */
  successStyle: StyleSlot;
  /**
   * Applied to every field's label and control. A block's own style is laid
   * over these, so one field can still depart from the form's look.
   */
  labelStyle: StyleSlot;
  fieldStyle: StyleSlot;
  /**
   * Placeholder text can only be reached through a `::placeholder` rule, so
   * this one is emitted as a scoped stylesheet rather than applied inline.
   */
  placeholderStyle: StyleSlot;
  helpStyle: StyleSlot;
};

export const defaultFormSettings: FormSettings = {
  successMessage: "Thanks — your submission has been received.",
  submitLabel: "Submit",
  notifyEmails: [],
  redirectUrl: "",
  pageWidth: "standard",
  formStyle: emptyStyleSlot,
  successStyle: emptyStyleSlot,
  labelStyle: emptyStyleSlot,
  fieldStyle: emptyStyleSlot,
  placeholderStyle: emptyStyleSlot,
  helpStyle: emptyStyleSlot,
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fieldName(label: string, id: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || id.replace(/[^a-z0-9]+/gi, "_");
}

export function createFormBlock(type: FormBlockType): FormBlock {
  const block: FormBlock = { id: makeId("fblock"), type };

  switch (type) {
    case "headline":
      block.text = "Headline";
      block.level = 2;
      break;
    case "plainText":
      block.text = "Text";
      break;
    case "richText":
      block.html = "<p>Rich text</p>";
      break;
    case "image":
    case "video":
      block.mediaUrl = "";
      block.width = 0;
      break;
    case "submit":
      block.label = "Submit";
      block.align = "left";
      break;
    case "select":
    case "radio":
      block.label = "Choose one";
      block.options = ["Option one", "Option two"];
      break;
    case "checkbox":
      block.label = "I agree";
      break;
    case "file":
      block.label = "Upload";
      block.uploadKind = "any";
      block.maxSizeMb = 25;
      block.multiple = false;
      break;
    case "hidden":
      block.label = "Hidden value";
      block.defaultValue = "";
      break;
    default:
      block.label = "Field";
      break;
  }

  if (isFieldBlock(type)) block.name = fieldName(block.label ?? "", block.id);
  return block;
}

export function normalizeFormBlock(input: unknown): FormBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as FormBlockType;
  if (!FORM_BLOCK_TYPES.includes(type)) return null;

  const block: FormBlock = { id: str(raw.id) || makeId("fblock"), type };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);

  switch (type) {
    case "headline":
      block.text = str(raw.text);
      block.level = Math.min(6, Math.max(1, num(raw.level, 2)));
      break;
    case "plainText":
      block.text = str(raw.text);
      break;
    case "richText":
      block.html = normalizeRichText(str(raw.html));
      break;
    case "image":
      block.mediaId = str(raw.mediaId);
      block.mediaUrl = sanitizeMediaPath(str(raw.mediaUrl));
      block.alt = str(raw.alt);
      block.caption = str(raw.caption);
      block.width = num(raw.width, 0);
      block.radius = num(raw.radius, 0);
      break;
    case "video":
      block.mediaId = str(raw.mediaId);
      block.mediaUrl = sanitizeMediaPath(str(raw.mediaUrl));
      block.caption = str(raw.caption);
      block.width = num(raw.width, 0);
      block.controls = raw.controls === undefined ? true : Boolean(raw.controls);
      break;
    case "submit":
      block.label = str(raw.label, "Submit");
      block.align = ["left", "center", "right"].includes(str(raw.align))
        ? (str(raw.align) as FormBlock["align"])
        : "left";
      break;
    default: {
      block.label = str(raw.label, "Field");
      block.name = str(raw.name) || fieldName(block.label, block.id);
      block.placeholder = str(raw.placeholder);
      block.helpText = str(raw.helpText);
      block.required = Boolean(raw.required);
      block.defaultValue = str(raw.defaultValue);

      if (type === "select" || type === "radio") {
        block.options = Array.isArray(raw.options)
          ? raw.options.map((option) => str(option)).filter(Boolean).slice(0, 100)
          : [];
      }
      if (type === "number") {
        block.min = num(raw.min, 0);
        block.max = num(raw.max, 0);
        block.step = num(raw.step, 1);
      }
      if (type === "file") {
        block.uploadKind = FILE_UPLOAD_KINDS.includes(raw.uploadKind as FileUploadKind)
          ? (raw.uploadKind as FileUploadKind)
          : "any";
        block.maxSizeMb = Math.min(100, Math.max(1, num(raw.maxSizeMb, 25)));
        block.multiple = Boolean(raw.multiple);
      }
      break;
    }
  }

  return block;
}

export function normalizeFormBlocks(input: unknown): FormBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 200)
    .map(normalizeFormBlock)
    .filter((block): block is FormBlock => block !== null);
}

export function normalizeFormLayout(input: unknown): PageRow[] {
  return normalizePageLayout(input, normalizeFormBlocks);
}

export function normalizeFormSettings(input: unknown): FormSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    successMessage: str(raw.successMessage, defaultFormSettings.successMessage),
    submitLabel: str(raw.submitLabel, defaultFormSettings.submitLabel),
    notifyEmails: Array.isArray(raw.notifyEmails)
      ? raw.notifyEmails.map((email) => str(email)).filter(Boolean)
      : [],
    redirectUrl: str(raw.redirectUrl),
    pageWidth: CONTENT_WIDTHS.includes(raw.pageWidth as ContentWidth)
      ? (raw.pageWidth as ContentWidth)
      : defaultFormSettings.pageWidth,
    formStyle: normalizeStyleSlot(raw.formStyle),
    successStyle: normalizeStyleSlot(raw.successStyle),
    labelStyle: normalizeStyleSlot(raw.labelStyle),
    fieldStyle: normalizeStyleSlot(raw.fieldStyle),
    placeholderStyle: normalizeStyleSlot(raw.placeholderStyle),
    helpStyle: normalizeStyleSlot(raw.helpStyle),
  };
}

export function createFormRow(columnCount = 1) {
  return createRow(columnCount);
}

export { createColumn as createFormColumn };

/** Flatten a layout into the ordered field list stored with each submission. */
export function collectFormFields(layout: PageRow[]): FormBlock[] {
  const fields: FormBlock[] = [];
  for (const row of layout) {
    for (const column of row.columns) {
      for (const block of column.blocks as FormBlock[]) {
        if (isFieldBlock(block.type) && block.type !== "submit") fields.push(block);
      }
    }
  }
  return fields;
}
