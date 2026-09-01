import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { CustomStyle, FontFamily } from "@/lib/models";
import { getEmailSettings } from "@/lib/email";
import { defaultFormSettings } from "@/lib/form-layout";
import { createTestQuestion, defaultTestSettings } from "@/lib/form-test";

import { TestBuilder } from "../test-builder";

export const metadata = { title: "New test" };

export default async function NewTestPage() {
  await requirePermission("forms.manage");
  await connectDB();

  /*
   * Whether the site can post anything at all, so the result-email settings
   * can say so rather than looking as though they work.
   */
  const { enabled, host, fromEmail } = await getEmailSettings();
  const emailReady = enabled && Boolean(host) && Boolean(fromEmail);

  // Just the two the style folds need — the full builder sources are a page's
  // worth of queries for controls that set type and colour.
  const [fontDocs, styleDocs] = await Promise.all([
    FontFamily.find().select("family").sort({ family: 1 }).lean<any[]>(),
    CustomStyle.find().select("name slug style").sort({ name: 1 }).lean<any[]>(),
  ]);

  const fonts = fontDocs.map((font) => String(font.family ?? ""));
  const savedStyles = styleDocs.map((style) => ({
    _id: String(style._id),
    name: style.name ?? "",
    slug: style.slug ?? "",
    style: style.style ?? {},
  }));


  return (
    <TestBuilder
      test={{
        title: "",
        slug: "",
        status: "draft",
        settings: defaultFormSettings,
        // One question to start, so the editor opens on something to fill in
        // rather than on an empty page and a row of buttons.
        test: { ...defaultTestSettings, questions: [createTestQuestion("radio")] },
      }}
      fonts={fonts}
      savedStyles={savedStyles}
      emailReady={emailReady}
    />
  );
}
