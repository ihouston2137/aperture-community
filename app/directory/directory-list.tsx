"use client";

import { useMemo, useState } from "react";

import { formatPhone, telHref } from "@/lib/member-types";
import type { MemberLink } from "@/lib/relationships";
import { protectedMediaUrl } from "@/lib/protected-media-url";

export type DirectoryLevel = { _id: string; name: string };

/**
 * Two readings of the same people.
 *
 * Cards are for meeting the membership — a face, a few words, room for what
 * somebody wrote about themselves. The list is for finding one person among
 * two hundred, where every line of prose is a line between you and the name
 * you came for. Neither is the right default for both jobs, so both are here.
 */
export type DirectoryView = "cards" | "list";

export type DirectoryEntry = {
  _id: string;
  name: string;
  /** What they call themselves, from their profile. Often empty. */
  title: string;
  levelIds: string[];
  levels: string[];
  location: string;
  description: string;
  headshotUrl: string;
  /** Empty unless the reader's level opens contact details. */
  email: string;
  phone: string;
  links: MemberLink[];
  isSelf: boolean;
};

/**
 * The directory itself: one card each, searched in the browser.
 *
 * Everything shown here was already sent to the page, so filtering is a matter
 * of hiding cards rather than asking the server again — and what a level is not
 * allowed to see was never sent in the first place.
 */
export function DirectoryList({
  entries,
  levels,
  showContact,
}: {
  entries: DirectoryEntry[];
  levels: DirectoryLevel[];
  showContact: boolean;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [view, setView] = useState<DirectoryView>("cards");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return entries.filter((entry) => {
      // Any of the levels picked, not all of them: somebody holding one of them
      // is what the reader is looking for.
      if (chosen.length > 0 && !entry.levelIds.some((id) => chosen.includes(id))) {
        return false;
      }
      // By name or title. The levels are their own filter, and matching on a
      // description would turn a search for a person into a search of their
      // words.
      return (
        !needle ||
        entry.name.toLowerCase().includes(needle) ||
        entry.title.toLowerCase().includes(needle)
      );
    });
  }, [entries, query, chosen]);

  function toggleLevel(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((held) => held !== id)
        : [...current, id]
    );
  }

  if (entries.length === 0) {
    return (
      <p className="member-note">
        Nobody holds a membership level yet, so there is nobody to list.
      </p>
    );
  }

  return (
    <>
      <div className="directory-filters">
        <div className="field directory-filter-search">
          <label htmlFor="directory-search">Search by name or title</label>
          <input
            id="directory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A member's name or title"
          />
        </div>

        {levels.length > 0 ? (
          <div className="field directory-filter-levels">
            <span className="field-label">Membership level</span>
            <div
              className="level-toggles"
              role="group"
              aria-label="Filter by membership level"
            >
              {levels.map((level) => (
                <button
                  key={level._id}
                  type="button"
                  className="btn btn-sm"
                  aria-pressed={chosen.includes(level._id)}
                  onClick={() => toggleLevel(level._id)}
                >
                  {level.name}
                </button>
              ))}
              {chosen.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setChosen([])}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="directory-count">
        <p className="help-text">
          {shown.length === entries.length
            ? `Showing all ${entries.length}.`
            : `${shown.length} of ${entries.length} match.`}
        </p>

        <div
          className="level-toggles directory-view"
          role="group"
          aria-label="How the directory is shown"
        >
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            Cards
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="member-note">No members match that.</p>
      ) : view === "list" ? (
        <ul className="directory-rows">
          {shown.map((entry) => (
            <li key={entry._id} className="directory-row">
              {entry.headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={protectedMediaUrl(entry.headshotUrl)}
                  alt=""
                  className="directory-headshot is-small"
                />
              ) : (
                <div
                  className="directory-headshot is-small is-empty"
                  aria-hidden="true"
                />
              )}

              <div className="directory-row-who">
                <h2 className="directory-name">
                  {entry.name}
                  {entry.isSelf ? <span className="badge">you</span> : null}
                </h2>
                <p className="directory-meta">
                  {entry.title ? `${entry.title} · ` : ""}
                  {entry.levels.join(", ") || "No level"}
                  {entry.location ? ` · ${entry.location}` : ""}
                </p>
                {/* Kept to one line here. The whole of it is on the card, and
                    a list of paragraphs is not a list. */}
                {entry.description ? (
                  <p className="directory-row-about">{entry.description}</p>
                ) : null}
              </div>

              {entry.links.length > 0 ? (
                <p className="directory-row-links">
                  {entry.links
                    .map((link) => `${link.label}: ${link.people.join(", ")}`)
                    .join(" · ")}
                </p>
              ) : null}

              {showContact && (entry.email || entry.phone) ? (
                <p className="directory-row-contact">
                  {entry.email ? (
                    <a href={`mailto:${entry.email}`}>{entry.email}</a>
                  ) : null}
                  {entry.phone ? (
                    <a href={telHref(entry.phone)}>{formatPhone(entry.phone)}</a>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="directory-grid">
          {shown.map((entry) => (
            <li key={entry._id} className="member-card directory-card">
              <div className="directory-head">
                {entry.headshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={protectedMediaUrl(entry.headshotUrl)}
                    alt=""
                    className="directory-headshot"
                  />
                ) : (
                  <div className="directory-headshot is-empty" aria-hidden="true" />
                )}

                <div style={{ minWidth: 0 }}>
                  <h2 className="directory-name">
                    {entry.name}
                    {entry.isSelf ? <span className="badge">you</span> : null}
                  </h2>
                  {entry.title ? (
                    <p className="directory-title">{entry.title}</p>
                  ) : null}
                  <p className="directory-meta">
                    {entry.levels.join(", ") || "No level"}
                    {entry.location ? ` · ${entry.location}` : ""}
                  </p>
                </div>
              </div>

              {entry.description ? (
                <p className="directory-about">{entry.description}</p>
              ) : null}

              {showContact && (entry.email || entry.phone) ? (
                <p className="directory-contact">
                  {entry.email ? (
                    <a href={`mailto:${entry.email}`}>{entry.email}</a>
                  ) : null}
                  {entry.email && entry.phone ? " · " : ""}
                  {entry.phone ? (
                    <a href={telHref(entry.phone)}>{formatPhone(entry.phone)}</a>
                  ) : null}
                </p>
              ) : null}

              {entry.links.length > 0 ? (
                <dl className="directory-links">
                  {entry.links.map((link, index) => (
                    <div key={`${link.label}-${index}`}>
                      <dt>{link.label}</dt>
                      <dd>{link.people.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
