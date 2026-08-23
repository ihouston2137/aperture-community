/** Shared with client components, so it lives outside `lib/models.ts`. */

/**
 * A profile is either a person or something a photograph is *about*.
 *
 * Only a person can be credited as an author, which is what separates the two:
 * author pickers offer `Person` profiles, while subject pickers offer every
 * profile — a subject can perfectly well be a person.
 */
export const BIO_TYPES = ["Person", "Subject"] as const;

export type BioType = (typeof BIO_TYPES)[number];

export const BIO_TYPE_LABELS: Record<BioType, string> = {
  Person: "Person",
  Subject: "Subject",
};

/**
 * Profiles used to be split three ways. `Author` and `Model` both described a
 * person, so both read as `Person` now; anything unrecognised does too, since
 * that is the type a new profile most often wants.
 */
export function normalizeBioType(value: unknown): BioType {
  return value === "Subject" ? "Subject" : "Person";
}

/** The profiles offered where a person has to be credited. */
export function isPersonBio(bio: { type?: string }): boolean {
  return normalizeBioType(bio.type) === "Person";
}
