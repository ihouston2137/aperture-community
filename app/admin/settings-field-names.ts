/**
 * The Appearance screen posts two models from one form, and they share some
 * field names (`footerText` is a colour on Appearance and a sentence on
 * SiteContent). Namespacing the inputs keeps `formData.get` from returning the
 * wrong model's value.
 *
 * These live outside `settings-actions.ts` because a `"use server"` module may
 * only export async functions.
 */
export const APPEARANCE_PREFIX = "appearance_";
export const CONTENT_PREFIX = "content_";
