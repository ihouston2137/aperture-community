/**
 * The form builder's block vocabulary.
 *
 * Split out from `lib/form-layout.ts` so `lib/page-layout.ts` can read the
 * field list — a field always fills its column, and that rule lives with every
 * other width rule rather than being restated wherever a form is rendered.
 * Importing `form-layout` there would be a cycle, since it imports page-layout.
 */

export const FORM_VISUAL_BLOCK_TYPES = [
  "headline",
  "plainText",
  "richText",
  "image",
  "video",
] as const;

export const FORM_FIELD_BLOCK_TYPES = [
  "shortText",
  "email",
  "phone",
  "longText",
  "select",
  "checkbox",
  "checkboxGroup",
  "radio",
  "date",
  "number",
  "file",
  "hidden",
  "submit",
] as const;

export const FORM_BLOCK_TYPES = [
  ...FORM_VISUAL_BLOCK_TYPES,
  ...FORM_FIELD_BLOCK_TYPES,
] as const;

export type FormBlockType = (typeof FORM_BLOCK_TYPES)[number];

export function isFieldBlock(type: string): boolean {
  return (FORM_FIELD_BLOCK_TYPES as readonly string[]).includes(type);
}
