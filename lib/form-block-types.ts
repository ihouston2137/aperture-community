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

/**
 * The fields that are a box somebody types into.
 *
 * Everything rendered as an `input` or a `textarea` the person writes in — a
 * phone number and an email address are the same object to dress as a line of
 * short text, whatever the keyboard a telephone puts up for them. What is left
 * out is what has no text box in it at all: a dropdown, a set of choices, a
 * tick box, a dropzone, a hidden value.
 *
 * Kept here with the vocabulary rather than in the renderer, so the form's
 * style settings and the control they land on are reading one list.
 */
export const TYPED_FIELD_BLOCK_TYPES = [
  "shortText",
  "longText",
  "email",
  "phone",
  "number",
  "date",
] as const;

export function isTypedField(type: string): boolean {
  return (TYPED_FIELD_BLOCK_TYPES as readonly string[]).includes(type);
}
