/** Shared with client components, so it lives outside `lib/models.ts`. */

/**
 * A profile is a person, a member, or something a photograph is *about*.
 *
 * `Person` and `Subject` separate on credit: author pickers offer `Person`
 * profiles, while subject pickers offer every profile — a subject can perfectly
 * well be a person. `Member` is the profile every account on the site carries,
 * kept in step with the account behind it rather than typed out by hand.
 */
export const BIO_TYPES = ["Person", "Subject", "Member"] as const;

export type BioType = (typeof BIO_TYPES)[number];

export const BIO_TYPE_LABELS: Record<BioType, string> = {
  Person: "Person",
  Subject: "Subject",
  Member: "Member",
};

/**
 * Profiles used to be split three ways. `Author` and `Model` both described a
 * person, so both read as `Person` now; anything unrecognised does too, since
 * that is the type a new profile most often wants.
 */
export function normalizeBioType(value: unknown): BioType {
  if (value === "Subject") return "Subject";
  if (value === "Member") return "Member";
  return "Person";
}

/**
 * The profiles offered where a person has to be credited.
 *
 * Members count: they write and photograph, so they can be the author of what
 * they made. Only a `Subject` is left out, which is the whole point of that
 * type — a place or an object cannot be credited.
 */
export function isPersonBio(bio: { type?: string }): boolean {
  return normalizeBioType(bio.type) !== "Subject";
}

/** A profile the site keeps in step with an account, rather than a free one. */
export function isMemberBio(bio: { type?: string }): boolean {
  return normalizeBioType(bio.type) === "Member";
}
