import { connectDB } from "./db";
import { toGroupSummary, type MemberGroupSummary } from "./member-group-types";
import { MemberGroup } from "./models";

/**
 * Loading groups from the database.
 *
 * The shapes and the pure helpers live in `./member-group-types`, which carries
 * no database import and so is safe for client components; they are re-exported
 * here so a server module has one place to reach for.
 */
export * from "./member-group-types";

export async function getMemberGroups(): Promise<MemberGroupSummary[]> {
  await connectDB();
  const records = await MemberGroup.find().sort({ name: 1 }).lean<any[]>();
  return records.map(toGroupSummary);
}
