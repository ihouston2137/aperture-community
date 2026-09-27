import { notFound } from "next/navigation";
import { SiteHeaderOnly } from "@/components/site-chrome";
import { connectDB } from "@/lib/db";
import { StaticHtml } from "@/lib/static-html-model";
import { validStaticHtmlSlug } from "@/lib/static-html";

export const dynamic = "force-dynamic";

export default async function StaticHtmlWithHeader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validStaticHtmlSlug(slug)) notFound();
  await connectDB();
  const file = await StaticHtml.findById(slug).select("originalName includeSiteHeader").lean();
  if (!file?.includeSiteHeader) notFound();
  return <div className="site-shell static-html-shell">
    <SiteHeaderOnly />
    <main className="static-html-content">
      <iframe title={file.originalName} src={`/project/${slug}?raw=1`} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </main>
  </div>;
}
