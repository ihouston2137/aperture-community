import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Zine, Presentation } from "@/lib/models";
import { guardContent } from "@/lib/content-guard";
import { NOT_DELETED } from "@/lib/soft-delete";
import { PresentationScreen } from "@/components/presentation-screen";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) notFound();
  await connectDB();
  const identity = await Zine.findOne({ _id: id, status: "published", ...NOT_DELETED }).lean<any>();
  if (!identity || !await Presentation.exists({ _id: id, active: { $ne: false }, published: { $ne: null } })) notFound();
  await guardContent("publication", id, `/presentations/${id}`);
  return <PresentationScreen id={id} view={(await searchParams).view} />;
}
