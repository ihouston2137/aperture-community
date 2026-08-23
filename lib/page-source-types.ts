import type { StoryView } from "@/components/story-blocks";

import type { CalendarEventRecord } from "./calendar";
import type { CalendarStyleRecord } from "./calendar-style";
import type { PageRow } from "./page-layout";
import type { ResolvedCollection } from "./collections";

/**
 * Shapes for the records a page layout references, split out from
 * `lib/page-sources.ts` so client components can import the value
 * `emptyPageSources` without pulling Mongoose into the browser bundle.
 */

export type BioSummary = {
  id: string;
  name: string;
  slug: string;
  title: string;
  location: string;
  description: string;
  headshotUrl: string;
};

export type FormSummary = {
  id: string;
  title: string;
  slug: string;
  layout: unknown[];
  settings: Record<string, unknown>;
};

export type PageSources = {
  /**
   * Fully rendered stories, for containers bound to one — the only way a page
   * references a story. Keyed by story id, with `latestStoryView` holding the
   * most recently published.
   */
  storyViews: Record<string, StoryView>;
  latestStoryView: StoryView | null;
  bios: Record<string, BioSummary>;
  collections: Record<string, ResolvedCollection>;
  /** For a container bound to "the latest collection". */
  latestCollection: ResolvedCollection | null;
  forms: Record<string, FormSummary>;
  /**
   * Published events for each calendar block's opening range, keyed by block
   * id, so the first paint is complete. The block fetches later ranges itself.
   */
  calendarEvents: Record<string, CalendarEventRecord[]>;
  /** Today in the calendar's configured zone, resolved once on the server. */
  calendarToday: string;
  /** Saved Calendar Styles, keyed by id, for the ones blocks wear. */
  calendarStyles: Record<string, CalendarStyleRecord>;
  /** Layouts those styles reference, keyed by layout id. */
  calendarLayouts: Record<string, PageRow[]>;
  /** The style a block wears when it names none. */
  calendarDefaultStyleId: string;
  /** The first page of each event list block, keyed by block id. */
  eventLists: Record<string, { events: CalendarEventRecord[]; hasMore: boolean }>;
  shapes: Record<string, { viewBox: string; paths: string[] }>;
  /**
   * Paths for the pages and collections that blocks link to, keyed by record
   * id. Resolved here rather than stored on the block so renaming a slug moves
   * every link that points at it.
   */
  linkHrefs: Record<string, string>;
  safeMode: boolean;
};

export const emptyPageSources: PageSources = {
  storyViews: {},
  latestStoryView: null,
  bios: {},
  collections: {},
  latestCollection: null,
  forms: {},
  calendarEvents: {},
  calendarToday: "",
  calendarStyles: {},
  calendarLayouts: {},
  calendarDefaultStyleId: "",
  eventLists: {},
  shapes: {},
  linkHrefs: {},
  safeMode: true,
};
