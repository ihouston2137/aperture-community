"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getEventRsvpsAction,
  getMyRsvpsAction,
  type RsvpView,
} from "@/app/calendar-actions";
import type { RsvpResponse } from "@/lib/calendar";

/**
 * One RSVP state for a whole calendar, shared by every block that shows it.
 *
 * Without this each block kept its own copy: a button in the grid could not
 * know what the member had already answered, and answering in the popup left
 * the list in the lightbox showing what it had loaded a moment earlier. They
 * are three views of one fact, so they read it from one place.
 *
 * The viewer's own answers for every visible event load in a single query; the
 * full list of who said what is loaded per event, only when something actually
 * asks to show it.
 */
type RsvpStore = {
  /** True on the builder canvas, where nothing is loaded or saved. */
  designTime: boolean;
  mine: Record<string, RsvpResponse | null>;
  views: Record<string, RsvpView>;
  /** Loads the full view for one event, once. */
  requestView: (eventId: string) => void;
  /** Publishes a fresh view after an answer, updating every block at once. */
  publish: (eventId: string, view: RsvpView) => void;
};

const RsvpContext = createContext<RsvpStore | null>(null);

export function CalendarRsvpProvider({
  eventIds,
  designTime = false,
  children,
}: {
  /** The events currently on screen, whose own answers are worth prefetching. */
  eventIds: string[];
  designTime?: boolean;
  children: React.ReactNode;
}) {
  const [mine, setMine] = useState<Record<string, RsvpResponse | null>>({});
  const [views, setViews] = useState<Record<string, RsvpView>>({});

  // Joined rather than passed as an array, so a re-render with an equal list
  // does not re-run the fetch.
  const key = eventIds.join(",");

  useEffect(() => {
    if (designTime) return;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;

    let live = true;
    getMyRsvpsAction(ids).then((answers) => {
      if (live) setMine((current) => ({ ...current, ...answers }));
    });
    return () => {
      live = false;
    };
  }, [key, designTime]);

  // Never cleared: it records that an event has been asked for, so a context
  // value changing (which it does on every load) cannot re-trigger the load.
  const requested = useRef<Set<string>>(new Set());

  const requestView = useCallback(
    (eventId: string) => {
      if (designTime || !eventId || requested.current.has(eventId)) return;
      requested.current.add(eventId);

      getEventRsvpsAction(eventId).then((view) => {
        setViews((current) => ({ ...current, [eventId]: view }));
        setMine((current) => ({ ...current, [eventId]: view.mine }));
      });
    },
    [designTime]
  );

  const publish = useCallback((eventId: string, view: RsvpView) => {
    requested.current.add(eventId);
    setViews((current) => ({ ...current, [eventId]: view }));
    setMine((current) => ({ ...current, [eventId]: view.mine }));
  }, []);

  const store = useMemo<RsvpStore>(
    () => ({ designTime, mine, views, requestView, publish }),
    [designTime, mine, views, requestView, publish]
  );

  return <RsvpContext value={store}>{children}</RsvpContext>;
}

/**
 * One event's RSVP state.
 *
 * Works without a provider too — a lightbox opened from somewhere that does not
 * wrap its events still shows and saves answers, it just keeps them to itself.
 *
 * @param wantView whether this block needs the full list of who answered, or
 * only the viewer's own answer.
 */
export function useEventRsvp(eventId: string, wantView: boolean) {
  const shared = useContext(RsvpContext);
  const [localView, setLocalView] = useState<RsvpView | null>(null);
  const localRequested = useRef(false);

  const designTime = shared?.designTime ?? false;
  const requestShared = shared?.requestView;

  useEffect(() => {
    if (designTime || !wantView || !eventId) return;

    if (requestShared) {
      requestShared(eventId);
      return;
    }

    if (localRequested.current) return;
    localRequested.current = true;

    let live = true;
    getEventRsvpsAction(eventId).then((view) => {
      if (live) setLocalView(view);
    });
    return () => {
      live = false;
    };
  }, [eventId, wantView, designTime, requestShared]);

  const view = shared ? (shared.views[eventId] ?? null) : localView;
  const mine = shared ? (shared.mine[eventId] ?? null) : (localView?.mine ?? null);

  const sharedPublish = shared?.publish;
  const publish = useCallback(
    (next: RsvpView) => {
      if (sharedPublish) sharedPublish(eventId, next);
      else setLocalView(next);
    },
    [sharedPublish, eventId]
  );

  return { view, mine, designTime, publish };
}
