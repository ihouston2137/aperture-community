import { connectDB } from "./db";
import { AuthSettings } from "./models";
import { mergeSettings } from "./settings-merge";
import { TWO_FACTOR_MODES, type TwoFactorMode } from "./verification-types";

export type AuthSettingsValues = {
  allowRegistration: boolean;
  allowRoleRequest: boolean;
  defaultCommunityRoleId: string;
  autoApproveRegistrations: boolean;
  requireEmailVerification: boolean;
  twoFactorMode: TwoFactorMode;
  codeTtlMinutes: number;
  notifyOnRegistration: boolean;
  registrationRecipients: string[];
  registrationSubject: string;
  registrationIntro: string;
};

export const defaultAuthSettings: AuthSettingsValues = {
  allowRegistration: true,
  allowRoleRequest: true,
  defaultCommunityRoleId: "",
  autoApproveRegistrations: false,
  requireEmailVerification: true,
  twoFactorMode: "off",
  codeTtlMinutes: 15,
  notifyOnRegistration: false,
  registrationRecipients: [],
  registrationSubject: "",
  registrationIntro: "",
};

/** A code shorter-lived than two minutes cannot be typed in time; a day is not a code. */
const MIN_TTL_MINUTES = 2;
const MAX_TTL_MINUTES = 1440;

export function clampCodeTtl(value: unknown): number {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return defaultAuthSettings.codeTtlMinutes;
  return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, minutes));
}

export function readTwoFactorMode(value: unknown): TwoFactorMode {
  return TWO_FACTOR_MODES.includes(value as TwoFactorMode)
    ? (value as TwoFactorMode)
    : "off";
}

export async function getAuthSettings(): Promise<AuthSettingsValues> {
  await connectDB();
  const doc = await AuthSettings.findOne().lean<any>();
  const settings = mergeSettings(defaultAuthSettings, doc);

  return {
    ...settings,
    // Stored as an ObjectId, and these values are read straight into client
    // components — so it leaves here as a string.
    defaultCommunityRoleId: settings.defaultCommunityRoleId
      ? String(settings.defaultCommunityRoleId)
      : "",
    twoFactorMode: readTwoFactorMode(settings.twoFactorMode),
    codeTtlMinutes: clampCodeTtl(settings.codeTtlMinutes),
    registrationRecipients: Array.isArray(settings.registrationRecipients)
      ? settings.registrationRecipients.map(String).filter(Boolean)
      : [],
  };
}

export async function saveAuthSettings(values: Partial<AuthSettingsValues>) {
  await connectDB();
  const patch: Record<string, unknown> = { ...values };
  if ("defaultCommunityRoleId" in values) {
    // An empty picker means "no default chosen", which is a null reference and
    // not an empty string the ObjectId cast would reject.
    patch.defaultCommunityRoleId = values.defaultCommunityRoleId || null;
  }
  await AuthSettings.findOneAndUpdate({}, { $set: patch }, { upsert: true });
}
