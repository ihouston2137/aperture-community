import { redirect } from "next/navigation";

import { getAccessContext } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FontFamily } from "@/lib/models";
import { getAppearance, getSiteContent } from "@/lib/site-settings";

import { AppearanceEditor } from "./appearance-editor";

export const metadata = { title: "Appearance" };

export default async function AppearancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { can } = await getAccessContext();
  const canAppearance = can("appearance.manage");
  const canContent = can("siteContent.manage");

  // The screen edits two models; either permission is enough to open it.
  if (!canAppearance && !canContent) redirect("/admin?denied=appearance.manage");

  const { saved } = await searchParams;
  await connectDB();

  const [appearance, content, fonts] = await Promise.all([
    getAppearance(),
    getSiteContent(),
    FontFamily.find().select("family").sort({ family: 1 }).lean<any[]>(),
  ]);

  return (
    <AppearanceEditor
      initialAppearance={appearance}
      initialContent={content}
      fonts={fonts.map((font) => font.family as string)}
      canAppearance={canAppearance}
      canContent={canContent}
      saved={Boolean(saved)}
    />
  );
}
