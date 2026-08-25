import { notFound } from "next/navigation";
import { guardContent } from "@/lib/content-guard";

import { PublicationScreen } from "@/components/publication-screen";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import {
  normalizePublicationPages,
  normalizeRepeatedBlocks,
} from "@/lib/publication-layout";

async function findPost(slug: string) {
  await connectDB();
  const doc = await Zine.findOne({ slug, kind: "post", status: "published" }).lean<any>();
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
  const post = await findPost(slug);
  return post ? { title: post.title } : {};
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `?view=story` picks one of the post's named view presets. */
  searchParams: Promise<{ view?: string }>;
}) {
  const { slug } = await params;
  const { view } = await searchParams;

  const post = await findPost(slug);
  if (!post) notFound();
  await guardContent("publication", String(post._id), `/post/${slug}`);

  // Controls appear only when there is more than one page, so a single-frame
  // post still reads as a clean image while a multi-page one can be paged
  // through — without them the later pages were unreachable.
  return <PublicationScreen doc={post} view={view} />;
}
