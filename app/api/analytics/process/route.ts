import type { NextRequest } from "next/server";

import { processAnalytics } from "@/lib/analytics/process";
import { getSession } from "@/lib/session";

/**
 * The processing job, on demand.
 *
 * The in-process timer covers a long-running server; this covers everything
 * else — a real cron, a serverless host where no timer survives between
 * requests, or an administrator who does not want to wait for the next tick.
 *
 * Two ways in: a bearer secret for machines, an admin session for people.
 * Without `ANALYTICS_CRON_SECRET` set, the machine door does not exist rather
 * than standing open.
 */
async function authorize(request: NextRequest): Promise<boolean> {
  const secret = process.env.ANALYTICS_CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    // Also accepted as a query parameter, which is all some cron services send.
    const query = request.nextUrl.searchParams.get("token") ?? "";
    if (token === secret || query === secret) return true;
  }

  return Boolean(await getSession());
}

async function run(request: NextRequest) {
  if (!(await authorize(request))) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }

  const result = await processAnalytics();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: NextRequest) {
  return run(request);
}

/** Cron services overwhelmingly issue a GET, so both verbs do the same thing. */
export async function GET(request: NextRequest) {
  return run(request);
}
