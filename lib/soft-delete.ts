/**
 * Deleting things that took a long time to make.
 *
 * A publication is weeks of somebody's arrangement; a documentation set is
 * everything anybody wrote down. A delete button is one press, so the press is
 * made reversible: `deletedAt` puts the thing in a bin where it leaves every
 * list and stops being served, but stays whole and can be put back. Removing it
 * for good is a second, deliberate act with its own permission.
 *
 * The two filters live here rather than beside either feature, so that a new
 * list cannot quietly forget the condition and start serving something somebody
 * deleted.
 */

/** Everything a list means by "the ones that are there". */
export const NOT_DELETED = { deletedAt: null } as const;

/** And the bin itself. */
export const IN_BIN = { deletedAt: { $ne: null } } as const;

/** The fields every soft-deletable document carries. */
export type SoftDeleted = {
  deletedAt?: Date | null;
  /** Who put it in the bin, so a list can say. */
  deletedBy?: string;
};

/** Whether a document read back from storage is in the bin. */
export function isDeleted(doc: SoftDeleted | null | undefined): boolean {
  return Boolean(doc?.deletedAt);
}
