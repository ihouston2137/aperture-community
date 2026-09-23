import type { NextRequest } from "next/server";
import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { testResults } from "@/lib/test-results";
import { testResultsCsv } from "@/lib/test-results-csv";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "tests.results"))) return Response.json({ error: "Unauthorized" }, { status: 403 });
  const testId = request.nextUrl.searchParams.get("testId");
  if (testId !== null && !/^[a-f\d]{24}$/i.test(testId)) return Response.json({ error: "Invalid test" }, { status: 400 });
  await connectDB();
  const results = await testResults(testId ? { formId: testId } : {});
  return new Response(testResultsCsv(results), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="test-submissions${testId ? `-${testId}` : ""}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
