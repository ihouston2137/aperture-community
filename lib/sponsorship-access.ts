/**
 * Who may do what with sponsorships.
 *
 * The one place the permission strings are turned into answers, so the sponsor
 * manager and the site admin can never disagree about who is allowed to edit
 * what.
 *
 * Seeing the section is one grant; editing each part of it is another. That is
 * what lets somebody be given the donations to enter without also being handed
 * the sponsor records, while still being able to see the campaign they are
 * entering them against.
 */
export type SponsorshipAccess = {
  /** Reaches the sponsorships dashboard at all. */
  canView: boolean;
  canEditCampaigns: boolean;
  canEditSponsors: boolean;
  /**
   * Putting a sponsor on a campaign, and everything about them once they are
   * on it: the status, who is looking after them, the recognition level.
   *
   * Its own grant, because it is the week-to-week work of running a campaign
   * and is not the same trust as being able to rewrite the sponsor's record or
   * to create a campaign in the first place.
   */
  canEditAssignments: boolean;
  /**
   * Putting artwork up and taking a copy of it — never removing it.
   *
   * Narrower than editing a sponsor and granted separately, since it is the
   * one job a member is often asked to do: somebody has the logo file and
   * nothing else about the record is theirs to change. Removing artwork is a
   * decision about the record, so it sits with `canEditSponsors`.
   */
  canEditLogos: boolean;
  /** Taking a sponsor's artwork off the site, which is not the same thing. */
  canDeleteLogos: boolean;
  /**
   * The people at a sponsor, and the address, phone and site they are reached
   * at. Kept apart from the record as a whole: keeping a contact list current
   * is a job to be helped with, and it says nothing about what they gave.
   */
  canEditContacts: boolean;
  canEditDonations: boolean;
  /**
   * Reading back what is already finished.
   *
   * Separate from seeing the section, because a campaign's final figures are
   * often the sensitive part: somebody brought in to enter this year's donations
   * has no need of what every previous year raised.
   */
  canSeeArchived: boolean;
  /**
   * The whole-programme lists, as opposed to the campaigns being worked on.
   *
   * Somebody looking after two sponsors on one campaign has no need of every
   * sponsor and every donation on file, and a list of all of them is a
   * different thing to be trusted with.
   */
  canSeeRecords: boolean;
  /**
   * The definitions behind it all — recognition levels, benefits, categories.
   * Deliberately not offered in the sponsorships dashboard: what Gold means
   * is a decision about the programme, not about this week's data entry.
   */
  canManageSetup: boolean;
};

export function sponsorshipAccess(permissions: string[]): SponsorshipAccess {
  const has = (permission: string) => permissions.includes(permission);

  // The original blanket grant still means everything, so a role set up before
  // the finer permissions existed keeps working exactly as it did.
  const all = has("sponsorships.manage");

  return {
    /*
     * Any grant at all gets somebody through the door.
     *
     * Whatever they were given it for, they have to reach the sponsor or the
     * campaign to do it — a permission that leads to a page they cannot open
     * is not a permission.
     */
    canView:
      all ||
      has("sponsorships.view") ||
      has("sponsorships.campaigns") ||
      has("sponsorships.sponsors") ||
      has("sponsorships.donations") ||
      has("sponsorships.assignments") ||
      has("sponsorships.logos") ||
      has("sponsorships.contacts"),
    canEditCampaigns: all || has("sponsorships.campaigns"),
    canEditSponsors: all || has("sponsorships.sponsors"),
    /*
     * `campaigns` still grants this.
     *
     * Before assignments were their own permission, editing a campaign was
     * what let somebody put a sponsor on one — so a role set up then goes on
     * doing exactly what it did rather than quietly losing half its job.
     */
    canEditAssignments:
      all ||
      has("sponsorships.assignments") ||
      has("sponsorships.campaigns") ||
      has("sponsorships.sponsors"),
    canEditLogos: all || has("sponsorships.sponsors") || has("sponsorships.logos"),
    canDeleteLogos: all || has("sponsorships.sponsors"),
    canEditContacts: all || has("sponsorships.sponsors") || has("sponsorships.contacts"),
    canEditDonations: all || has("sponsorships.donations"),
    canSeeArchived: all || has("sponsorships.closed"),
    canSeeRecords: all || has("sponsorships.records"),
    canManageSetup: all,
  };
}
