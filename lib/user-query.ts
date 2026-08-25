import { connectDB } from "./db";
import { getRoleSummaries, toMemberSummary, type MemberSummary } from "./members";
import { User } from "./models";
import { NO_ROLE, USERS_PER_PAGE, type UserQuery } from "./user-query-types";

export * from "./user-query-types";

/**
 * Reading one page of the user list: the filters applied in the database rather
 * than in the browser. A community portal is meant to grow, and the alternative
 * — ship every account and filter there — stops working at exactly the size
 * where these controls start to matter.
 */

/** So a typed `.` or `+` is a character to find, not a pattern to run. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(query: UserQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (query.search) {
    // One term against every way somebody might be looked up. Anchored nowhere,
    // so "smith" finds "Smithson" and a partial phone number finds its owner.
    const term = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { firstName: term },
      { lastName: term },
      { name: term },
      { email: term },
      { phone: term },
    ];
  }

  if (query.role === NO_ROLE) filter.roleIds = { $size: 0 };
  else if (query.role) filter.roleIds = query.role;

  if (query.status) filter.membershipStatus = query.status;

  // Accounts predating the flag are active, so "inactive" is an explicit false
  // rather than "not true".
  if (query.account === "active") filter.isActive = { $ne: false };
  if (query.account === "inactive") filter.isActive = false;

  return filter;
}

export type UserPage = {
  users: MemberSummary[];
  /** Matching the filters, not the page. */
  total: number;
  /** How many accounts exist at all, so an empty result can explain itself. */
  overall: number;
  page: number;
  pageCount: number;
};

export async function loadUserPage(query: UserQuery): Promise<UserPage> {
  await connectDB();

  const filter = buildFilter(query);
  const [roles, total, overall] = await Promise.all([
    getRoleSummaries(),
    User.countDocuments(filter),
    User.countDocuments({}),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
  // A filter change can leave the page number past the end of the new result.
  const page = Math.min(Math.max(1, query.page), pageCount);

  const docs = await User.find(filter)
    // Sorted the way the list reads, and ending on `_id` so the order is total —
    // two people with the same name must not swap places between pages.
    .sort({ lastName: 1, firstName: 1, email: 1, _id: 1 })
    .skip((page - 1) * USERS_PER_PAGE)
    .limit(USERS_PER_PAGE)
    .lean<any[]>();

  return {
    users: docs.map((doc) => toMemberSummary(doc, roles)),
    total,
    overall,
    page,
    pageCount,
  };
}
