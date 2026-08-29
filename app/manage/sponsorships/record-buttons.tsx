"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CampaignDialog,
  type PickerOption,
  type SponsorOption,
} from "@/app/admin/campaigns/campaign-manager";
import {
  DonationDialog,
  type CampaignOption,
} from "@/app/admin/donations/donation-manager";
import { SponsorDialog } from "@/app/admin/sponsors/sponsor-manager";
import type {
  CampaignSummary,
  DonationSummary,
  RecognitionLevelSummary,
  SponsorCategorySummary,
  SponsorSummary,
} from "@/lib/sponsorship-types";

import { IconButton } from "./sponsor-controls";

/**
 * The buttons that open a record's editor from somewhere that is not a list.
 *
 * A dashboard is mostly reading, with an occasional change — so the editor is
 * reached by a button rather than by a row in a table. Each of these mounts the
 * very dialog the admin lists use, so there is still only one editor per record
 * however it was opened.
 */

export function CampaignButton({
  campaign,
  sponsors,
  members,
  label,
  primary = false,
}: {
  /** Absent when adding. */
  campaign?: CampaignSummary;
  sponsors: SponsorOption[];
  members: PickerOption[];
  label: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm${primary ? " btn-primary" : ""}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open ? (
        <CampaignDialog
          campaign={campaign}
          sponsors={sponsors}
          members={members}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

export function DonationButton({
  donation,
  campaigns,
  sponsors,
  members,
  categories,
  defaultSponsorId,
  defaultCampaignId,
  label,
  primary = false,
  icon = false,
}: {
  /** Absent when recording a new one. */
  donation?: DonationSummary;
  campaigns: CampaignOption[];
  sponsors: PickerOption[];
  members: PickerOption[];
  categories: SponsorCategorySummary[];
  /** What the page opening this already knows about a new donation. */
  defaultSponsorId?: string;
  defaultCampaignId?: string;
  label: string;
  primary?: boolean;
  /** A square pencil rather than a worded button, for a compact row. */
  icon?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      {icon ? (
        <IconButton label={label} onClick={() => setOpen(true)} />
      ) : (
        <button
          type="button"
          className={`btn btn-sm${primary ? " btn-primary" : ""}`}
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
      )}

      {open ? (
        <DonationDialog
          donation={donation}
          campaigns={campaigns}
          sponsors={sponsors}
          members={members}
          categories={categories}
          defaultSponsorId={defaultSponsorId}
          defaultCampaignId={defaultCampaignId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The whole of a sponsor's record, from the sponsor's own page.
 *
 * Everything else on that page changes one thing — the level, who looks after
 * them, their logos — because that is what somebody working a campaign does.
 * Changing the record itself is a different job, and the editor for it already
 * exists; this only puts a door to it where the record is being read.
 *
 * Offered on the whole-programme permission rather than on the one that edits
 * sponsors, because that is what the action behind the dialog asks for: a
 * button that opened onto a refusal would be worse than no button.
 */
export function SponsorRecordButton({
  sponsor,
  levels,
  categories,
}: {
  sponsor: SponsorSummary;
  levels: RecognitionLevelSummary[];
  categories: SponsorCategorySummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        label={`Edit ${sponsor.name}'s record`}
        onClick={() => setOpen(true)}
      />

      {open ? (
        <SponsorDialog
          sponsor={sponsor}
          levels={levels}
          categories={categories}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
