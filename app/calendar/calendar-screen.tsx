"use client";

import { useState } from "react";

import { EventDialog } from "@/app/admin/calendar/event-dialog";
import { RepeatDialog } from "@/app/admin/calendar/repeat-dialog";
import { CalendarBlock } from "@/components/calendar-block";
import type {
  CalendarDisplay,
  CalendarEventRecord,
} from "@/lib/calendar";
import type { CalendarStyleRecord } from "@/lib/calendar-style";
import type { PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

/**
 * The calendar page, plus the event editor for whoever may use it.
 *
 * The dialogs are the admin's own — `EventDialog` and `RepeatDialog`, exactly
 * as the admin calendar mounts them. Nothing about editing an event is
 * different here, so nothing about it is rebuilt here; a field added to the
 * admin's event form appears on this page the same day.
 *
 * `canManage` decides whether any of it exists, but it decides nothing on its
 * own: every action behind these dialogs calls `requirePermission` on the
 * server, so hiding the buttons is a courtesy rather than the lock.
 */

/** What the editor is doing. `null` keeps it unmounted, so each open starts clean. */
type DialogState =
  | { mode: "create"; date: string }
  | { mode: "edit"; event: CalendarEventRecord }
  | { mode: "repeat"; event: CalendarEventRecord }
  | null;

export function CalendarScreen({
  display,
  style,
  layouts,
  sources,
  initialEvents,
  todayKey,
  canManage,
  categories,
  who,
  tags,
}: {
  display: CalendarDisplay;
  style: CalendarStyleRecord;
  layouts: Record<string, PageRow[]>;
  sources: PageSources;
  initialEvents: CalendarEventRecord[];
  todayKey: string;
  canManage: boolean;
  /** The managed vocabularies, so the event form offers the site's own words. */
  categories: string[];
  who: string[];
  tags: string[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  /**
   * Bumped after every save and delete.
   *
   * The calendar caches each range it has fetched, so without this a new event
   * would not appear until the page was reloaded. `router.refresh()` would not
   * do it either: the calendar is a live component that has navigated away from
   * whatever the server rendered, and re-running the server would replace only
   * the opening month.
   */
  const [reloadToken, setReloadToken] = useState(0);

  const closeAndReload = () => {
    setDialog(null);
    setReloadToken((current) => current + 1);
  };

  return (
    <>
      <CalendarBlock
        display={display}
        style={style}
        layouts={layouts}
        sources={sources}
        initialEvents={initialEvents}
        todayKey={todayKey}
        reloadToken={reloadToken}
        manage={
          canManage
            ? {
                onAddDay: (date) => setDialog({ mode: "create", date }),
                onEditEvent: (event) => setDialog({ mode: "edit", event }),
              }
            : undefined
        }
      />

      {canManage && dialog && dialog.mode !== "repeat" ? (
        <EventDialog
          event={dialog.mode === "edit" ? dialog.event : undefined}
          defaultDate={dialog.mode === "create" ? dialog.date : undefined}
          categories={categories}
          who={who}
          tags={tags}
          onClose={() => setDialog(null)}
          onSaved={closeAndReload}
          onRepeat={(event) => setDialog({ mode: "repeat", event })}
        />
      ) : null}

      {canManage && dialog?.mode === "repeat" ? (
        <RepeatDialog
          event={dialog.event}
          // Cancelling a repeat goes back to the event it was started from,
          // rather than closing everything and losing the place.
          onClose={() => setDialog({ mode: "edit", event: dialog.event })}
          onDone={closeAndReload}
        />
      ) : null}
    </>
  );
}
