"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccessContext, requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { sendTestEmail, verifyEmailSettings } from "@/lib/email";
import { syncMediaUsage } from "@/lib/media-usage-sync";
import { Appearance, EmailSettings, SiteContent } from "@/lib/models";
import { sanitizeMediaPath } from "@/lib/protected-media-url";
import { unifyLegacyMedia } from "@/lib/unify-media";

import { APPEARANCE_PREFIX, CONTENT_PREFIX } from "./settings-field-names";

function revalidateSite() {
  // Appearance and site content are injected by the root layout.
  revalidatePath("/", "layout");
}

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
}

function menuChild(value: unknown): { label: string; href: string; newTab: boolean } {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    label: String(row.label ?? ""),
    href: String(row.href ?? ""),
    newTab: Boolean(row.newTab),
  };
}

/**
 * Shapes the header menu, dropping anything the editor did not put there and
 * bounding the child lists so a hand-edited payload cannot write an unlimited
 * array.
 */
function readMenuLinks(value: FormDataEntryValue | null) {
  return parseJson<unknown[]>(value, [])
    .slice(0, 50)
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const kind = row.kind === "label" ? "label" : "link";
      return {
        ...menuChild(row),
        kind,
        // Absent means yes, so a menu saved before the option existed keeps the
        // arrow it was already showing.
        showCaret: row.showCaret !== false,
        children:
          kind === "label"
            ? (Array.isArray(row.children) ? row.children : []).slice(0, 25).map(menuChild)
            : [],
      };
    });
}

/** Field lists shared by the individual and combined save actions. */
const APPEARANCE_TEXT_FIELDS = [
  "headerBackground",
  "headerText",
  "headerAccent",
  "headerBorderColor",
  "headerNavAlign",
  "headerWidth",
  "adminBackground",
  "adminPanel",
  "adminText",
  "adminAccent",
  "contentBackground",
  "contentText",
  "contentAccent",
  "footerBackground",
  "footerText",
  "footerBorderColor",
  "footerAlign",
  "footerWidth",
  "headingFont",
  "bodyFont",
];

const APPEARANCE_NUMBER_FIELDS = [
  "headerPaddingY",
  "headerNavSize",
  "headerNavGap",
  "headerBorderWidth",
  "footerPaddingY",
  "footerFontSize",
  "footerBorderWidth",
  "footerColumnGap",
  "footerRowGap",
];

const APPEARANCE_BOOLEAN_FIELDS = [
  "headerSticky",
  "headerBorderEnabled",
  "headerShadow",
  "footerBorderEnabled",
];

function readAppearance(formData: FormData): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const get = (field: string) => formData.get(`${APPEARANCE_PREFIX}${field}`);
  const has = (field: string) => formData.has(`${APPEARANCE_PREFIX}${field}`);

  for (const field of APPEARANCE_TEXT_FIELDS) {
    if (has(field)) update[field] = String(get(field) ?? "");
  }
  for (const field of APPEARANCE_NUMBER_FIELDS) {
    if (has(field)) {
      const parsed = Number(get(field));
      if (Number.isFinite(parsed)) update[field] = parsed;
    }
  }
  // Checkboxes only appear in the payload when ticked.
  for (const field of APPEARANCE_BOOLEAN_FIELDS) {
    update[field] = get(field) === "on";
  }

  update.faviconUrl = sanitizeMediaPath(String(get("faviconUrl") ?? ""));
  // Per-element text styling arrives as JSON from the style popup.
  update.textStyles = parseJson<Record<string, unknown>>(get("textStyles"), {});
  return update;
}

function readSiteContent(formData: FormData): Record<string, unknown> {
  const get = (field: string) => formData.get(`${CONTENT_PREFIX}${field}`);

  return {
    metaTitle: String(get("metaTitle") ?? ""),
    metaDescription: String(get("metaDescription") ?? ""),
    metaImageUrl: sanitizeMediaPath(String(get("metaImageUrl") ?? "")),

    headerBrandText: String(get("headerBrandText") ?? ""),
    headerBrandHref: String(get("headerBrandHref") ?? "/"),
    headerTagline: String(get("headerTagline") ?? ""),
    logoUrl: sanitizeMediaPath(String(get("logoUrl") ?? "")),
    logoMediaId: String(get("logoMediaId") ?? ""),
    logoHeight: Number(get("logoHeight") ?? 40) || 40,
    showLogo: get("showLogo") === "on",
    showBrandText: get("showBrandText") === "on",

    menuLinks: readMenuLinks(get("menuLinks")),
    socialLinks: parseJson<unknown[]>(get("socialLinks"), []).slice(0, 50),

    availabilityEnabled: get("availabilityEnabled") === "on",
    availabilityLabel: String(get("availabilityLabel") ?? ""),
    availabilityHref: String(get("availabilityHref") ?? ""),

    footerBrandText: String(get("footerBrandText") ?? ""),
    footerLogoUrl: sanitizeMediaPath(String(get("footerLogoUrl") ?? "")),
    footerLogoMediaId: String(get("footerLogoMediaId") ?? ""),
    footerLogoHeight: Number(get("footerLogoHeight") ?? 32) || 32,
    showFooterLogo: get("showFooterLogo") === "on",
    footerText: String(get("footerText") ?? ""),
    copyright: String(get("copyright") ?? ""),

    safeModeDefault: get("safeModeDefault") === "on",
  };
}

/**
 * Saves the appearance settings and the site content together, since the
 * Appearance screen edits both behind one Save button. Each model is only
 * written if the signed-in user holds the matching permission.
 */
export async function saveSiteAppearanceAction(formData: FormData) {
  const { can } = await getAccessContext();
  await connectDB();

  if (can("appearance.manage")) {
    await Appearance.findOneAndUpdate({}, { $set: readAppearance(formData) }, { upsert: true });
  }
  if (can("siteContent.manage")) {
    await SiteContent.findOneAndUpdate({}, { $set: readSiteContent(formData) }, { upsert: true });
    await syncMediaUsage("site-content", "Site content", [
      {
        kind: "site-logo",
        source: {
          logoUrl: sanitizeMediaPath(String(formData.get(`${CONTENT_PREFIX}logoUrl`) ?? "")),
          logoMediaId: String(formData.get(`${CONTENT_PREFIX}logoMediaId`) ?? ""),
          footerLogoUrl: sanitizeMediaPath(
            String(formData.get(`${CONTENT_PREFIX}footerLogoUrl`) ?? "")
          ),
          footerLogoMediaId: String(
            formData.get(`${CONTENT_PREFIX}footerLogoMediaId`) ?? ""
          ),
          metaImageUrl: sanitizeMediaPath(
            String(formData.get(`${CONTENT_PREFIX}metaImageUrl`) ?? "")
          ),
          faviconUrl: sanitizeMediaPath(
            String(formData.get(`${APPEARANCE_PREFIX}faviconUrl`) ?? "")
          ),
        },
      },
    ]);
  }

  revalidateSite();
  revalidatePath("/admin/styles");
  redirect("/admin/styles?saved=1");
}

export async function saveSiteDesignAction(formData: FormData) {
  await requirePermission("design.site");
  await connectDB();

  const update = {
    collectionDisplayDefaults: parseJson(formData.get("collectionDisplayDefaults"), {}),
    collectionTemplateDefaults: parseJson(formData.get("collectionTemplateDefaults"), {}),
    collectionStyleOverrides: parseJson(formData.get("collectionStyleOverrides"), {}),
  };

  await SiteContent.findOneAndUpdate({}, { $set: update }, { upsert: true });

  revalidateSite();
  revalidatePath("/admin/site-design");
}

export async function saveEmailSettingsAction(formData: FormData) {
  await requirePermission("email.manage");
  await connectDB();

  const update: Record<string, unknown> = {
    enabled: formData.get("enabled") === "on",
    host: String(formData.get("host") ?? "").trim(),
    port: Number(formData.get("port") ?? 587) || 587,
    secure: formData.get("secure") === "on",
    username: String(formData.get("username") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    fromEmail: String(formData.get("fromEmail") ?? ""),
    replyTo: String(formData.get("replyTo") ?? ""),
    notificationRecipients: String(formData.get("notificationRecipients") ?? "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean),
    notifyOnFormSubmission: formData.get("notifyOnFormSubmission") === "on",
  };

  // Leaving the password field blank keeps the stored password.
  const password = String(formData.get("password") ?? "");
  if (password) update.password = password;

  await EmailSettings.findOneAndUpdate({}, { $set: update }, { upsert: true });
  revalidatePath("/admin/email");
}

export async function verifyEmailAction() {
  await requirePermission("email.manage");
  const result = await verifyEmailSettings();
  revalidatePath("/admin/email");
  return result;
}

export async function sendTestEmailAction(to: string) {
  await requirePermission("email.manage");
  return sendTestEmail(to);
}

export async function unifyMediaAction() {
  await requirePermission("media.upload");
  const result = await unifyLegacyMedia();
  revalidatePath("/admin/media");
  return result;
}
