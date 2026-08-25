"use client";

import { useEffect, useState, useTransition } from "react";

import { setMyRsvpAction, type RsvpView } from "@/app/calendar-actions";
import { eventLabel, type CalendarEventRecord } from "@/lib/calendar";
import type { CalendarSlotBlock } from "@/lib/calendar-slot-layout";
import { slotIsStyled } from "@/lib/responsive-style";

import { styleSlotProps } from "./block-primitives";
import { useEventRsvp } from "./calendar-rsvp-context";
import { ModalPortal } from "./modal-portal";

/** The style slot each answer wears in place of the block's resting style. */
const STATE_SLOT: Record<"yes" | "no", "goingStyle" | "notGoingStyle"> = {
  yes: "goingStyle",
  no: "notGoingStyle",
};

/** Cycles the canvas preview so all three looks can be seen while styling. */
const NEXT_PREVIEW: Record<string, "yes" | "no" | null> = {
  none: "yes",
  yes: "no",
  no: null,
};

/**
 * The RSVP button, and the popup behind it.
 *
 * The label comes from the shared store, so a button in the grid opens already
 * showing what the member answered, and changing the answer anywhere updates
 * every copy of it at once.
 *
 * The three answers are three looks: the block's own style is how the button
 * rests, and either answered state can replace it with one of its own.
 */
export function CalendarRsvpButton({
  block,
  event,
  className,
  style,
  designTime,
}: {
  block: CalendarSlotBlock;
  event: CalendarEventRecord;
  /** The block's resting style, already resolved. */
  className: string;
  style: React.CSSProperties | undefined;
  /** True on the builder canvas, where the button previews rather than saves. */
  designTime: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<"yes" | "no" | null>(null);
  // The count needs the full view; the label only needs the viewer's answer.
  const { view, mine } = useEventRsvp(event._id, Boolean(block.showCount));

  const answer = designTime ? preview : mine;

  const label =
    answer === "yes"
      ? block.rsvpGoingText || "Going"
      : answer === "no"
        ? block.rsvpNotGoingText || "Not going"
        : block.rsvpText || "RSVP";

  const count = block.showCount && view ? ` · ${view.yesCount} going` : "";

  /**
   * An answered state that has been styled replaces the resting look outright;
   * one that has not falls through to it.
   *
   * Not layered, deliberately. A slot resolves to either inline CSS or a
   * generated class, and inline always beats a class — so layering would make a
   * state with per-screen overrides lose to the resting style it is meant to
   * refine. One slot wins the whole button, which is a rule that holds however
   * either side happens to be expressed. The inspector offers a copy of the
   * resting style as a starting point, so this costs nothing to work with.
   */
  const stateSlot = answer && slotIsStyled(block, STATE_SLOT[answer])
    ? STATE_SLOT[answer]
    : null;
  const look = stateSlot ? styleSlotProps(block, stateSlot) : { className, style };

  return (
    <>
      <button
        type="button"
        className={`cal-slot cal-rsvp-button ${look.className}`.trim()}
        style={look.style}
        data-answer={answer ?? "none"}
        title={designTime ? "Click to preview each answered state" : undefined}
        onClick={(clickEvent) => {
          // An event box is itself clickable; answering must not also open the
          // lightbox behind the popup.
          clickEvent.stopPropagation();
          // On the canvas there is nobody to answer for, so the click shows the
          // next state instead — otherwise the two answered looks could be
          // styled but never seen.
          if (designTime) setPreview((current) => NEXT_PREVIEW[current ?? "none"]);
          else setOpen(true);
        }}
        onKeyDown={(keyEvent) => {
          // Same again for the keyboard: the box opens on Enter and Space, and
          // those are exactly the keys that press this button.
          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
            keyEvent.stopPropagation();
          }
        }}
      >
        {label}
        {count}
      </button>

      {open ? (
        <RsvpDialog event={event} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function RsvpDialog({
  event,
  onClose,
}: {
  event: CalendarEventRecord;
  onClose: () => void;
}) {
  const { view, publish } = useEventRsvp(event._id, true);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function answer(response: "yes" | "no") {
    setError("");
    startSaving(async () => {
      const result = await setMyRsvpAction(event._id, response);
      if (result.ok && result.view) publish(result.view);
      else setError(result.error ?? "Could not save your answer.");
    });
  }

  const busy = !view || saving;

  return (
    <ModalPortal>
      <div
        className="auth-dialog-backdrop"
        role="presentation"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          onClose();
        }}
      >
        <div
          className="auth-dialog cal-rsvp-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`RSVP to ${eventLabel(event)}`}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <div className="auth-dialog-header">
            <h2 className="panel-title" style={{ margin: 0 }}>
              Are you going?
            </h2>
            <button
              type="button"
              className="auth-dialog-close"
              aria-label="Close"
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="auth-dialog-body">
            <p className="cal-rsvp-event">{eventLabel(event)}</p>

            {error ? <div className="admin-notice is-error">{error}</div> : null}

            {!view ? (
              <p className="help-text">Loading…</p>
            ) : view.canRsvp ? (
              <>
                <div className="cal-rsvp-choices">
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-selected={view.mine === "yes" ? "true" : "false"}
                    disabled={busy}
                    onClick={() => answer("yes")}
                  >
                    Yes, I am going
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-selected={view.mine === "no" ? "true" : "false"}
                    disabled={busy}
                    onClick={() => answer("no")}
                  >
                    No, I cannot
                  </button>
                </div>

                {view.mine ? (
                  <p className="help-text" style={{ marginTop: "0.75rem" }}>
                    You are down as {view.mine === "yes" ? "going" : "not going"}. You
                    can change this at any time.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="help-text">{view.reason || "RSVPs are closed."}</p>
                {!view.signedIn ? (
                  // Picked up by the header menu, which owns the sign-in popup.
                  <button type="button" className="btn btn-primary" data-auth="signin">
                    Sign in
                  </button>
                ) : null}
              </>
            )}

            {view && (view.yesCount > 0 || view.noCount > 0) ? (
              <p className="help-text" style={{ marginTop: "1rem" }}>
                {view.yesCount} going · {view.noCount} not going
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Who has answered, for the lightbox.
 *
 * Reads the same shared view the popup writes to, so answering updates this
 * list without it having to reload or be told.
 */
export function CalendarRsvpList({
  block,
  event,
  className,
  style,
  designTime,
}: {
  block: CalendarSlotBlock;
  event: CalendarEventRecord;
  className: string;
  style: React.CSSProperties | undefined;
  designTime: boolean;
}) {
  const { view } = useEventRsvp(event._id, true);

  const shows = block.rsvpShows ?? "both";
  const asCounts = block.namesOrCounts === "counts";

  const section = (
    heading: string,
    names: string[],
    count: number,
    kind: "yes" | "no"
  ) => (
    <div className="cal-rsvp-group" data-answer={kind}>
      <span className="cal-rsvp-heading">
        {heading}
        <span className="cal-rsvp-count">{count}</span>
      </span>
      {asCounts ? null : names.length > 0 ? (
        <ul className="cal-rsvp-names">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <span className="cal-rsvp-empty">Nobody yet</span>
      )}
    </div>
  );

  // On the canvas, and for the moment before the answers arrive, the block
  // shows its own shape rather than collapsing and pushing the layout about.
  const yes = designTime || !view ? [] : view.yes;
  const no = designTime || !view ? [] : view.no;

  return (
    <div className={`cal-slot cal-rsvp-list ${className}`.trim()} style={style}>
      {shows !== "no"
        ? section(block.yesHeading || "Going", yes, view?.yesCount ?? 0, "yes")
        : null}
      {shows !== "yes"
        ? section(block.noHeading || "Not going", no, view?.noCount ?? 0, "no")
        : null}
    </div>
  );
}
