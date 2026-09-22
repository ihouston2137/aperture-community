import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Presentation, Zine } from "@/lib/models";
import { normalizeDeck } from "@/lib/presentation";
import { presentationSources } from "@/lib/presentation-sources";
import { PresentationEditor } from "../../presentation-editor";

export default async function Edit({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission("publications.manage");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) notFound();
  await connectDB();
  const [record, identity] = await Promise.all([Presentation.findById(id).lean<any>(), Zine.findById(id).lean<any>()]);
  if (!identity) notFound();
  if (identity.deletedAt) redirect("/admin/presentations#bin");
  if (!record || record.active === false) redirect(`/admin/publications/${id}/edit?legacy=1`);
  const view = (await searchParams).view || record.defaultView;
  if (view && !Object.hasOwn(record.variants, view)) notFound();
  const deck = normalizeDeck(view ? record.variants[view] : record.deck);
  const published = view ? record.publishedVariants?.[view] : record.published;
  const { sources, shapes, fonts } = await presentationSources(deck);
  return <>
    {Object.keys(record.variants || {}).length > 1 && <nav aria-label="Presentation sizes">{Object.keys(record.variants).map(key =>
      <Link className="btn btn-sm" key={key} href={`/admin/presentations/${id}/edit?view=${encodeURIComponent(key)}`} aria-current={key === view ? "page" : undefined}>{key}</Link>)}</nav>}
    <PresentationEditor key={`${id}-${view}`} initial={deck} initialSlug={identity.slug} id={id} version={record.version}
      view={view} sources={sources} shapes={shapes} fonts={fonts} status={identity.status}
      published={published ? normalizeDeck(published) : null} />
  </>;
}
