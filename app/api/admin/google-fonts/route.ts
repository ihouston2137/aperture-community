import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { searchGoogleFonts } from "@/lib/google-fonts";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "design.library"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const { fonts, total, complete } = await searchGoogleFonts(query);

  return Response.json({ fonts, total, complete });
}
