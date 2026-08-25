import { notFound } from "next/navigation";
import { guardContent } from "@/lib/content-guard";

import { PublicationScreen } from "@/components/publication-screen";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import {
  normalizePublicationPages,
  normalizeRepeatedBlocks,
} from "@/lib/publication-layout";

async function findZine(slug: string) {
  await connectDB();
  const doc = await Zine.findOne({ slug, kind: "zine", status: "published" }).lean<any>();
  if (!doc) return null;
  // The admin editor normalizes on load; the public route has to as well,
  // otherwise saved rich text keeps whatever Quill wrote, non-breaking
  // spaces included.
  return {
    ...doc,
    pages: normalizePublicationPages(doc.pages),
    repeatedBlocks: normalizeRepeatedBlocks(doc.repeatedBlocks),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const zine = await findZine(slug);
  return zine ? { title: zine.title, description: zine.description || undefined } : {};
}

export default async function ZinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const zine = await findZine(slug);
  if (!zine) notFound();
  await guardContent("publication", String(zine._id), `/zines/${slug}`);

  return <PublicationScreen doc={zine} />;
}
