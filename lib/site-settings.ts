import { connectDB } from "./db";
import { Appearance, CustomStyle, FontFamily, SiteContent } from "./models";
import {
  defaultAppearance,
  defaultSiteContent,
  type AppearanceValues,
  type SiteContentValues,
} from "./site-values";
import { mergeSettings } from "./settings-merge";

export * from "./site-values";

export async function getAppearance(): Promise<AppearanceValues> {
  await connectDB();
  const doc = await Appearance.findOne().lean();
  return mergeSettings(defaultAppearance, doc);
}

export async function getSiteContent(): Promise<SiteContentValues> {
  await connectDB();
  const doc = await SiteContent.findOne().lean();
  return mergeSettings(defaultSiteContent, doc);
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
