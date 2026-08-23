import { connectDB } from "./db";
import { Appearance, CustomStyle, FontFamily, SiteContent } from "./models";
import {
  defaultAppearance,
  defaultSiteContent,
  type AppearanceValues,
  type SiteContentValues,
} from "./site-values";

export * from "./site-values";

function merge<T extends object>(defaults: T, doc: unknown): T {
  if (!doc || typeof doc !== "object") return { ...defaults };
  const source = doc as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const value = source[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out as T;
}

export async function getAppearance(): Promise<AppearanceValues> {
  await connectDB();
  const doc = await Appearance.findOne().lean();
  return merge(defaultAppearance, doc);
}

export async function getSiteContent(): Promise<SiteContentValues> {
  await connectDB();
  const doc = await SiteContent.findOne().lean();
  return merge(defaultSiteContent, doc);
}

export async function getDesignAssets() {
  await connectDB();
  const [fonts, styles] = await Promise.all([
    FontFamily.find().sort({ family: 1 }).lean(),
    CustomStyle.find().sort({ name: 1 }).lean(),
  ]);
  return {
    fonts: JSON.parse(JSON.stringify(fonts)) as any[],
    styles: JSON.parse(JSON.stringify(styles)) as any[],
  };
}
