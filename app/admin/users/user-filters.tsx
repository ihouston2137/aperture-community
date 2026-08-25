"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  MEMBERSHIP_STATUSES,
  membershipStatusLabels,
  type RoleKind,
} from "@/lib/permissions";
import { NO_ROLE, userQueryString, type UserQuery } from "@/lib/user-query-types";

export type FilterRoleOption = { _id: string; name: string; kind: RoleKind };

/**
 * Search and filters for the user list.
 *
 * Every control writes to the URL and lets the server re-query. That keeps the
 * filtering honest at any size — the page holds twenty-five accounts whether
 * the site has thirty or thirty thousand — and makes a filtered view something
 * that can be linked to.
 */
export function UserFilters({
  query,
  roles,
  total,
  overall,
}: {
  query: UserQuery;
  roles: FilterRoleOption[];
  total: number;
  overall: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search);

  // The typed value is local so the field stays responsive; the URL catches up
  // once typing pauses, rather than re-querying on every keystroke.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  function go(next: Partial<UserQuery>) {
    // Any change to what is being looked for starts again at the first page,
    // unless the change is the page itself.
    const merged = { ...query, page: 1, ...next };
    startTransition(() => router.push(`/admin/users${userQueryString(merged)}`));
  }

  function onSearch(value: string) {
    // Read from props here rather than inside the timeout, where it would be
    // whatever the closure captured rather than what the URL currently says.
    const current = query.search;
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (value !== current) go({ search: value });
    }, 300);
  }

  const communityRoles = roles.filter((role) => role.kind === "community");
  const managementRoles = roles.filter((role) => role.kind === "management");

  const filtered =
    Boolean(query.search) || Boolean(query.role) || Boolean(query.status) ||
    Boolean(query.account);

  return (
    <div className="user-toolbar" data-pending={pending ? "true" : "false"}>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="user-search">Search</label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(changeEvent) => onSearch(changeEvent.target.value)}
            placeholder="Name, email or phone"
          />
        </div>

        <div className="field">
          <label htmlFor="user-role">Holds</label>
          <select
            id="user-role"
            value={query.role}
            onChange={(changeEvent) => go({ role: changeEvent.target.value })}
          >
            <option value="">Any role</option>
            <option value={NO_ROLE}>No roles at all</option>
            {communityRoles.length > 0 ? (
              <optgroup label="Membership levels">
                {communityRoles.map((role) => (
                  <option key={role._id} value={role._id}>
                    {role.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {managementRoles.length > 0 ? (
              <optgroup label="Management roles">
                {managementRoles.map((role) => (
                  <option key={role._id} value={role._id}>
                    {role.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>

        <div className="field">
          <label htmlFor="user-status">Membership</label>
          <select
            id="user-status"
            value={query.status}
            onChange={(changeEvent) => go({ status: changeEvent.target.value })}
          >
            <option value="">Any membership</option>
            {MEMBERSHIP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {membershipStatusLabels[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="user-account">Account</label>
          <select
            id="user-account"
            value={query.account}
            onChange={(changeEvent) => go({ account: changeEvent.target.value })}
          >
            <option value="">Active or inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
      </div>

      <div className="user-toolbar-summary">
        <span className="help-text">
          {filtered
            ? `${total} of ${overall} account${overall === 1 ? "" : "s"} match`
            : `${overall} account${overall === 1 ? "" : "s"}`}
        </span>
        {filtered ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              // The field holds its own text, so clearing the URL has to clear
              // it too or the box would keep showing a filter that is gone.
              if (debounce.current) clearTimeout(debounce.current);
              setSearch("");
              startTransition(() => router.push("/admin/users"));
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Previous and next, with the page numbers a run of results can reach.
 *
 * Numbers rather than only arrows so a long list can be crossed in one jump,
 * windowed so a hundred pages do not become a hundred controls.
 */
export function UserPagination({
  query,
  page,
  pageCount,
}: {
  query: UserQuery;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (pageCount <= 1) return null;

  const go = (next: number) =>
    startTransition(() =>
      router.push(`/admin/users${userQueryString({ ...query, page: next })}`)
    );

  // A window of five around the current page, pinned inside the real range.
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  const last = Math.min(pageCount, first + 4);
  const numbers: number[] = [];
  for (let value = first; value <= last; value += 1) numbers.push(value);

  return (
    <nav className="user-pagination" aria-label="User list pages">
      <button
        type="button"
        className="btn btn-sm"
        disabled={page <= 1 || pending}
        onClick={() => go(page - 1)}
      >
        Previous
      </button>

      {first > 1 ? <span className="user-pagination-gap">…</span> : null}

      {numbers.map((value) => (
        <button
          key={value}
          type="button"
          className="btn btn-sm"
          aria-current={value === page ? "page" : undefined}
          data-current={value === page ? "true" : "false"}
          disabled={pending}
          onClick={() => go(value)}
        >
          {value}
        </button>
      ))}

      {last < pageCount ? <span className="user-pagination-gap">…</span> : null}

      <button
        type="button"
        className="btn btn-sm"
        disabled={page >= pageCount || pending}
        onClick={() => go(page + 1)}
      >
        Next
      </button>

      <span className="help-text user-pagination-count">
        Page {page} of {pageCount}
      </span>
    </nav>
  );
}
