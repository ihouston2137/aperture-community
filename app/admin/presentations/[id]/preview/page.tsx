import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import { PresentationScreen } from "@/components/presentation-screen";
import { NOT_DELETED } from "@/lib/soft-delete";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  await requirePermission("publications.manage");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) notFound();
  await connectDB();
  if (!await Zine.exists({ _id: id, ...NOT_DELETED })) notFound();
  return <PresentationScreen id={id} preview view={(await searchParams).view} />;
}
