import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { StaticHtml } from "@/lib/static-html-model";
import { validStaticHtmlSlug } from "@/lib/static-html";

/** Keep the shared URL while choosing between the original file and site chrome. */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.get("raw") === "1") return NextResponse.next();
  const slug = request.nextUrl.pathname.split("/")[2] ?? "";
  if (!validStaticHtmlSlug(slug)) return NextResponse.next();
  await connectDB();
  const file = await StaticHtml.findById(slug).select("includeSiteHeader").lean();
  if (!file?.includeSiteHeader) return NextResponse.next();
  const destination = request.nextUrl.clone();
  destination.pathname = `/static-html-view/${slug}`;
  return NextResponse.rewrite(destination);
}

export const config = { matcher: ["/project/:slug", "/report/:slug", "/special/:slug"] };
