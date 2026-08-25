import { connectDB } from "./db";
import { type RoleKind } from "./permissions";
import { Role, User } from "./models";
import { sortRoles, toRoleSummary, type RoleSummary } from "./member-types";

export * from "./member-types";

export async function getRoleSummaries(kind?: RoleKind): Promise<RoleSummary[]> {
  await connectDB();
  const roles = await Role.find().sort({ name: 1 }).lean<any[]>();
  const summaries = roles.map(toRoleSummary);
  return sortRoles(kind ? summaries.filter((role) => role.kind === kind) : summaries);
}

export async function countPendingMembers(): Promise<number> {
  await connectDB();
  return User.countDocuments({ membershipStatus: "pending" });
}
