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
  canEditDonations: boolean;
  /**
   * Reading back what is already finished.
   *
   * Separate from seeing the section, because a campaign's final figures are
   * often the sensitive part: somebody brought in to enter this year's donations
   * has no need of what every previous year raised.
   */
  canSeeClosed: boolean;
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
    canView:
      all ||
      has("sponsorships.view") ||
      has("sponsorships.campaigns") ||
      has("sponsorships.sponsors") ||
      has("sponsorships.donations"),
    canEditCampaigns: all || has("sponsorships.campaigns"),
    canEditSponsors: all || has("sponsorships.sponsors"),
    canEditDonations: all || has("sponsorships.donations"),
    canSeeClosed: all || has("sponsorships.closed"),
    canSeeRecords: all || has("sponsorships.records"),
    canManageSetup: all,
  };
}
