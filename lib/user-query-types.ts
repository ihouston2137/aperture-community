import { MEMBERSHIP_STATUSES, type MembershipStatus } from "./permissions";

/**
 * The shape of the user list query, and the pure helpers that read and write it.
 *
 * Split from `lib/user-query.ts` because the filter controls are a client
 * component and import from here; that module reaches the database, and
 * importing it from the browser bundle would drag Mongoose in with it.
 */

export const USERS_PER_PAGE = 25;

/** No roles at all, which is its own thing worth filtering for. */
export const NO_ROLE = "none";

export type UserQuery = {
  search: string;
  /** A role id, `none`, or "" for any. */
  role: string;
  /** A membership status, or "" for any. */
  status: string;
  /** `active` | `inactive`, or "" for either. */
  account: string;
  page: number;
};

export const emptyUserQuery: UserQuery = {
  search: "",
  role: "",
  status: "",
  account: "",
  page: 1,
};

/** Reads the query off a URL, dropping anything that is not a value we offer. */
export function readUserQuery(
  params: Record<string, string | string[] | undefined>
): UserQuery {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  const status = one("status");
  const account = one("account");
  const page = Math.floor(Number(one("page")));

  return {
    search: one("q").trim().slice(0, 100),
    role: one("role"),
    status: MEMBERSHIP_STATUSES.includes(status as MembershipStatus) ? status : "",
    account: account === "active" || account === "inactive" ? account : "",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Turns a query back into a search string, leaving out everything at default. */
export function userQueryString(query: Partial<UserQuery>): string {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.role) params.set("role", query.role);
  if (query.status) params.set("status", query.status);
  if (query.account) params.set("account", query.account);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}
