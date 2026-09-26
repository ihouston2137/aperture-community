import { connectDB } from "./db";
import { StaticHtml } from "./static-html-model";
import { staticHtmlResponse, validStaticHtmlSlug } from "./static-html";

export async function serveStaticHtml(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!validStaticHtmlSlug(slug)) return new Response("Not found", { status: 404 });
  await connectDB();
  const file = await StaticHtml.findById(slug).select("+html").lean();
  if (!file) return new Response("Not found", { status: 404 });
  return staticHtmlResponse(file.html);
}
