import { connectDB } from "./db";
import { getMenuById, getMenuViewer, loadMenuFor, type MenuItem } from "./menus";
import {
  Bio,
  CalendarEvent,
  CalendarSettings,
  CalendarStyle,
  CalendarTemplate,
  Collection,
  CustomShape,
  FormDefinition,
  SitePage,
  Story,
} from "./models";
import { normalizeCalendarTemplateLayout } from "./calendar-slot-layout";
import { getRecognitionLevels, getSponsors } from "./sponsorships";
import { isPubliclyNamed, primaryLogo, sponsorLogoSrc } from "./sponsorship-types";
import {
  eventListQuery,
  normalizeEventListSettings,
  type EventListSettings,
} from "./event-list";
import {
  calendarStyleLayoutIds,
  normalizeCalendarStyle,
  type CalendarStyleRecord,
} from "./calendar-style";
import {
  monthKeyFromDateKey,
  monthRange,
  normalizeCalendarDisplay,
  normalizeStatus,
  todayDateKey,
  weekRange,
  type CalendarEventRecord,
} from "./calendar";
import {
  getCollectionById,
  resolveCollection,
  type ResolvedCollection,
} from "./collections";
import {
  emptyPageSources,
  type BioSummary,
  type FormSummary,
  type PageSources,
} from "./page-source-types";
import { getSafeMode } from "./safe-mode";
import { toStoryView } from "./stories";
import type { StoryView } from "@/components/story-blocks";
import { getSiteContent } from "./site-settings";
import {
  normalizeSponsorScroll,
  walkBlocks,
  type PageLayout,
  type PageRow,
} from "./page-layout";

export { emptyPageSources };
export type { BioSummary, FormSummary, PageSources };

function bioSummary(doc: Record<string, any>): BioSummary {
  return {
    id: String(doc._id),
    name: doc.name ?? "",
    slug: doc.slug ?? "",
    title: doc.title ?? "",
    location: doc.location ?? "",
    description: doc.description ?? "",
    headshotUrl: doc.headshotUrl ?? "",
  };
}

export { walkBlocks };

/** One stored event as the renderers consume it. */
function toEventRecord(doc: Record<string, any>): CalendarEventRecord {
  return {
    _id: String(doc._id),
    date: doc.date ?? "",
    startTime: doc.startTime ?? "",
    endTime: doc.endTime ?? "",
    name: doc.name ?? "",
    description: doc.description ?? "",
    location: doc.location ?? "",
    linkText: doc.linkText ?? "",
    linkUrl: doc.linkUrl ?? "",
    status: normalizeStatus(doc.status),
    category: doc.category ?? "",
    who: Array.isArray(doc.who) ? doc.who.map(String) : [],
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    rsvpEnabled: Boolean(doc.rsvpEnabled),
    attendanceEnabled: Boolean(doc.attendanceEnabled),
  };
}

/**
 * Load every record a layout references in one pass, so the renderer stays a
 * pure function of `(layout, sources)` and never queries per block.
 */
export async function loadPageSources(layout: PageLayout): Promise<PageSources> {
  await connectDB();

  const bioIds = new Set<string>();
  const collectionIds = new Set<string>();
  const formIds = new Set<string>();
  // Menu blocks are collected as pairs: the same menu shown twice is filtered
  // the same way, but each block needs its own entry to read.
  const menuBlocks: { blockId: string; menuId: string }[] = [];
  const shapeSlugs = new Set<string>();
  const linkPageIds = new Set<string>();
  const linkCollectionIds = new Set<string>();

  // Containers can be bound to a story, which their story slots render from —
  // the only way a page references a story.
  const storyViewIds = new Set<string>();
  let needsLatestStoryView = false;
  let needsLatestCollection = false;

  // Each calendar block opens on its own view, so each needs its own range.
  const calendarBlocks: { id: string; view: string }[] = [];
  const calendarStyleIds = new Set<string>();
  const calendarLayoutIds = new Set<string>();
  const eventListBlocks: { id: string; settings: EventListSettings }[] = [];
  const sponsorScrollBlocks: { id: string; levelIds: string[] }[] = [];

  walkBlocks(layout, (block) => {
    if (block.type === "bio" && block.bioId) bioIds.add(block.bioId);
    if (block.type === "collection" && block.collectionId) {
      collectionIds.add(block.collectionId);
    }
    if (block.type === "form" && block.formId) formIds.add(block.formId);
    if (block.type === "menu" && block.menuId) {
      menuBlocks.push({ blockId: block.id, menuId: block.menuId });
    }
    if (block.type === "calendar") {
      const display = normalizeCalendarDisplay(block.calendar);
      calendarBlocks.push({ id: block.id, view: display.view });
      if (display.styleId) calendarStyleIds.add(display.styleId);
    }
    if (block.type === "eventList") {
      const settings = normalizeEventListSettings(block.eventList);
      eventListBlocks.push({ id: block.id, settings });
      if (settings.templateId) calendarLayoutIds.add(settings.templateId);
    }
    if (block.type === "sponsorScroll") {
      const settings = normalizeSponsorScroll(block.sponsorScroll);
      sponsorScrollBlocks.push({ id: block.id, levelIds: settings.levelIds });
    }
    if (block.type === "customShape" && block.shapeSlug) shapeSlugs.add(block.shapeSlug);

    // An image can link to a page or a collection; only the slug is needed.
    if (block.clickAction === "link") {
      if (block.linkPageId) linkPageIds.add(block.linkPageId);
      if (block.linkCollectionId) linkCollectionIds.add(block.linkCollectionId);
    }

    if (block.type === "container" && block.container) {
      const source = block.container.storySource;
      if (source === "latest") needsLatestStoryView = true;
      else if (source === "specific" && block.container.storyId) {
        storyViewIds.add(block.container.storyId);
      }

      // A container can be bound to a collection too, which its collection
      // slots draw from.
      const from = block.container.collectionSource;
      if (from === "latest") needsLatestCollection = true;
      else if (from === "specific" && block.container.collectionId) {
        collectionIds.add(block.container.collectionId);
      }
    }
  });

  const objectIds = (values: Set<string>) =>
    [...values].filter((value) => /^[a-f0-9]{24}$/i.test(value));

  const [bioDocs, formDocs, shapeDocs, siteContent] = await Promise.all([
    bioIds.size
      ? Bio.find({ _id: { $in: objectIds(bioIds) } }).lean<any[]>()
      : Promise.resolve([]),
    formIds.size
      ? FormDefinition.find({ _id: { $in: objectIds(formIds) } }).lean<any[]>()
      : Promise.resolve([]),
    shapeSlugs.size
      ? CustomShape.find({ slug: { $in: [...shapeSlugs] } }).lean<any[]>()
      : Promise.resolve([]),
    getSiteContent(),
  ]);

  const collections: Record<string, ResolvedCollection> = {};
  for (const id of objectIds(collectionIds)) {
    const resolved = await getCollectionById(id);
    if (resolved) collections[id] = resolved;
  }

  // "The latest collection" is the most recently made public one, so a page
  // bound to it follows whichever gallery a visitor would call current.
  const latestCollectionDoc = needsLatestCollection
    ? await Collection.findOne({ isPublic: true }).sort({ createdAt: -1 }).lean<any>()
    : null;
  const latestCollection = await resolveCollection(latestCollectionDoc);

  const bios: Record<string, BioSummary> = {};
  for (const doc of bioDocs) bios[String(doc._id)] = bioSummary(doc);

  const forms: Record<string, FormSummary> = {};
  for (const doc of formDocs) {
    forms[String(doc._id)] = {
      id: String(doc._id),
      title: doc.title ?? "",
      slug: doc.slug ?? "",
      layout: Array.isArray(doc.layout) ? doc.layout : [],
      settings: (doc.settings ?? {}) as Record<string, unknown>,
    };
  }

  // Link targets. A draft page or a private collection still resolves: the
  // editor filters the pickers, and an address that exists is better than a
  // link that silently renders as plain text.
  const linkHrefs: Record<string, string> = {};
  const [linkPageDocs, linkCollectionDocs] = await Promise.all([
    linkPageIds.size
      ? SitePage.find({ _id: { $in: objectIds(linkPageIds) } })
          .select("slug isHome")
          .lean<any[]>()
      : Promise.resolve([]),
    linkCollectionIds.size
      ? Collection.find({ _id: { $in: objectIds(linkCollectionIds) } })
          .select("slug")
          .lean<any[]>()
      : Promise.resolve([]),
  ]);

  for (const doc of linkPageDocs) {
    linkHrefs[String(doc._id)] = doc.isHome ? "/" : `/${doc.slug ?? ""}`;
  }
  for (const doc of linkCollectionDocs) {
    linkHrefs[String(doc._id)] = `/collections/${doc.slug ?? ""}`;
  }

  const shapes: Record<string, { viewBox: string; paths: string[] }> = {};
  for (const doc of shapeDocs) {
    shapes[doc.slug] = {
      viewBox: doc.viewBox ?? "0 0 100 100",
      paths: Array.isArray(doc.paths) ? doc.paths : [],
    };
  }

  // Story-bound containers need the same rendered view the story page uses, so
  // a slot on a page cannot differ from the same slot in a template.
  const viewIds = objectIds(storyViewIds);
  const viewDocs = await Promise.all([
    ...viewIds.map((id) => Story.findById(id).lean<any>()),
    needsLatestStoryView
      ? Story.findOne({ status: "published" }).sort({ publishDate: -1 }).lean<any>()
      : Promise.resolve(null),
  ]);

  const storyViews: Record<string, StoryView> = {};
  for (const doc of viewDocs.slice(0, viewIds.length)) {
    if (doc) storyViews[String(doc._id)] = await toStoryView(doc);
  }

  const latestViewDoc = viewDocs[viewDocs.length - 1];
  const latestStoryView = latestViewDoc ? await toStoryView(latestViewDoc) : null;

  // Calendar blocks: published events for whatever range each one opens on, so
  // the page paints complete. Distinct ranges are queried once and shared, since
  // two month calendars on a page almost always want the same window.
  const calendarSettings = calendarBlocks.length
    ? await CalendarSettings.findOne()
        .select("timeZone defaultStyleId")
        .lean<any>()
    : null;
  const calendarToday = calendarBlocks.length
    ? todayDateKey(calendarSettings?.timeZone)
    : "";
  // A block wearing no style falls back to the site default, so that one has
  // to be loaded alongside whatever the blocks name outright.
  const calendarDefaultStyleId = String(calendarSettings?.defaultStyleId ?? "");
  if (calendarBlocks.length > 0 && calendarDefaultStyleId) {
    calendarStyleIds.add(calendarDefaultStyleId);
  }

  const calendarStyles: Record<string, CalendarStyleRecord> = {};
  const calendarLayouts: Record<string, PageRow[]> = {};

  // An event list names a layout directly, so its id has to be loaded even when
  // no Calendar Style on the page reaches for one.
  if (calendarStyleIds.size > 0 || calendarLayoutIds.size > 0) {
    const styleDocs =
      calendarStyleIds.size > 0
        ? await CalendarStyle.find({
            _id: { $in: objectIds(calendarStyleIds) },
          }).lean<any[]>()
        : [];

    const layoutIds = new Set(calendarLayoutIds);
    for (const doc of styleDocs) {
      const record: CalendarStyleRecord = {
        ...normalizeCalendarStyle(doc),
        _id: String(doc._id),
        slug: doc.slug ?? "",
      };
      calendarStyles[record._id] = record;
      for (const id of calendarStyleLayoutIds(record)) layoutIds.add(id);
    }

    // One query for every layout every style on the page reaches for.
    if (layoutIds.size > 0) {
      const layoutDocs = await CalendarTemplate.find({
        _id: { $in: objectIds(layoutIds) },
      }).lean<any[]>();
      for (const doc of layoutDocs) {
        calendarLayouts[String(doc._id)] = normalizeCalendarTemplateLayout(doc.layout);
      }
    }
  }

  const calendarEvents: Record<string, CalendarEventRecord[]> = {};
  if (calendarBlocks.length > 0) {
    const rangeFor = (view: string) =>
      view === "week"
        ? weekRange(calendarToday)
        : monthRange(monthKeyFromDateKey(calendarToday));

    const byRange = new Map<string, CalendarEventRecord[]>();
    for (const key of new Set(calendarBlocks.map((entry) => entry.view))) {
      const { start, end } = rangeFor(key);
      const docs = await CalendarEvent.find({
        status: "published",
        date: { $gte: start, $lte: end },
      })
        .sort({ date: 1, startTime: 1 })
        .lean<any[]>();

      byRange.set(key, docs.map(toEventRecord));
    }

    for (const entry of calendarBlocks) {
      calendarEvents[entry.id] = byRange.get(entry.view) ?? [];
    }
  }

  // The first page of every event list, so each paints complete on the server
  // and only "load more" needs the browser.
  const eventLists: Record<
    string,
    { events: CalendarEventRecord[]; hasMore: boolean }
  > = {};

  for (const entry of eventListBlocks) {
    const query = eventListQuery(entry.settings, calendarToday);
    const filter = {
      status: "published",
      date: { $gte: query.start, $lte: query.end },
    };

    const [docs, total] = await Promise.all([
      CalendarEvent.find(filter)
        .sort({ date: 1, startTime: 1 })
        .limit(query.limit)
        .lean<any[]>(),
      CalendarEvent.countDocuments(filter),
    ]);

    eventLists[entry.id] = {
      events: docs.map(toEventRecord),
      hasMore: docs.length < total,
    };
  }

  /*
   * Sponsor logos per scroll block.
   *
   * The sponsors and levels are read once however many scrolls a page holds,
   * and each block filtered from the same lists. A sponsor whose level is
   * anonymous never appears: the level says the site does not name them, and
   * a logo names them louder than a line of type would.
   */
  const sponsorLogos: Record<string, { id: string; name: string; src: string }[]> = {};
  if (sponsorScrollBlocks.length > 0) {
    const [levels, sponsors] = await Promise.all([
      getRecognitionLevels(),
      getSponsors(),
    ]);

    // Highest recognition first, then alphabetically — the order the rest of
    // the site lists sponsors in, so a scroll agrees with a wall of them.
    const rank = new Map(levels.map((level, index) => [level._id, index]));
    const ordered = [...sponsors].sort(
      (a, b) =>
        (rank.get(a.recognitionLevelId) ?? 999) - (rank.get(b.recognitionLevelId) ?? 999) ||
        a.name.localeCompare(b.name)
    );

    for (const entry of sponsorScrollBlocks) {
      sponsorLogos[entry.id] = ordered
        .filter((sponsor) => {
          if (!isPubliclyNamed(sponsor, levels)) return false;
          // No levels named means every level, which is what a scroll dropped
          // on a page with nothing configured should show.
          if (entry.levelIds.length === 0) return Boolean(sponsor.recognitionLevelId);
          return entry.levelIds.includes(sponsor.recognitionLevelId);
        })
        .map((sponsor) => ({
          id: sponsor._id,
          name: sponsor.name,
          src: sponsorLogoSrc(primaryLogo(sponsor.logos)),
        }))
        // A sponsor with no artwork has nothing to put in a run of logos.
        .filter((sponsor) => Boolean(sponsor.src));
    }
  }

  /**
   * Menu items per block, filtered to whoever is asking.
   *
   * One viewer read however many menu blocks a page holds, and the menus
   * themselves fetched once each — a page with two blocks on one menu resolves
   * it once and hands both the same list.
   */
  const menus: Record<string, MenuItem[]> = {};
  if (menuBlocks.length > 0) {
    const viewer = await getMenuViewer();
    const wanted = [...new Set(menuBlocks.map((entry) => entry.menuId))];
    const resolved = new Map<string, MenuItem[]>();

    for (const menuId of wanted) {
      const menu = await getMenuById(menuId);
      resolved.set(menuId, await loadMenuFor(menu, viewer));
    }
    for (const entry of menuBlocks) {
      menus[entry.blockId] = resolved.get(entry.menuId) ?? [];
    }
  }

  return {
    sponsorLogos,
    storyViews,
    latestStoryView,
    bios,
    collections,
    latestCollection,
    forms,
    menus,
    calendarEvents,
    calendarToday,
    calendarStyles,
    calendarLayouts,
    calendarDefaultStyleId,
    eventLists,
    shapes,
    linkHrefs,
    safeMode: await getSafeMode(siteContent.safeModeDefault),
  };
}
