import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { SiteHeaderOnly } from "@/components/site-chrome";
import { connectDB } from "@/lib/db";
import { StaticHtml } from "@/lib/static-html-model";
import { validStaticHtmlSlug } from "@/lib/static-html";
import { staticHtmlTitle } from "@/lib/static-html-title";

export const dynamic = "force-dynamic";

const loadFile = cache(async (slug: string) => {
  if (!validStaticHtmlSlug(slug)) notFound();
  await connectDB();
  const file = await StaticHtml.findById(slug).select("originalName includeSiteHeader +html").lean();
  if (!file?.includeSiteHeader) notFound();
  return file;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const file = await loadFile((await params).slug);
  return { title: { absolute: staticHtmlTitle(file.html, file.originalName) } };
}

export default async function StaticHtmlWithHeader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const file = await loadFile(slug);
  return <div className="site-shell static-html-shell">
    <SiteHeaderOnly />
    <main className="static-html-content">
      <iframe title={file.originalName} src={`/project/${slug}?raw=1`} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </main>
  </div>;
}
