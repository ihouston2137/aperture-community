import { normalizeBioType } from "./bio-types";
import { normalizeVocabulary, todayDateKey } from "./calendar";
import { normalizeCalendarTemplateLayout } from "./calendar-slot-layout";
import {
  calendarStyleLayoutIds,
  normalizeCalendarStyle,
  type CalendarStyleRecord,
} from "./calendar-style";
import { connectDB } from "./db";
import {
  Bio,
  CalendarSettings,
  CalendarStyle,
  CalendarTemplate,
  Collection,
  CustomPageBlock,
  CustomShape,
  CustomStyle,
  FontFamily,
  FormDefinition,
  Menu,
  SitePage,
  Story,
  StoryTemplate,
} from "./models";

/**
 * Everything the admin builders need in their pickers. Loaded once per editor
 * page and passed down as plain JSON so the builder stays a client component.
 */
import type { PageRow } from "./page-layout";

export type BuilderSources = {
  fonts: string[];
  styles: { _id: string; name: string; slug: string }[];
  shapes: { _id: string; name: string; slug: string; viewBox: string; paths: string[] }[];
  stories: { _id: string; label: string }[];
  /** `type` is carried so author pickers can offer people only. */
  bios: { _id: string; label: string; type: string }[];
  /** `isPublic` is carried so link pickers can offer public galleries only. */
  collections: { _id: string; label: string; isPublic: boolean }[];
  /** Published pages, for linking to. Drafts have no address to point at. */
  pages: { _id: string; label: string }[];
  forms: { _id: string; label: string }[];
  /** Named menus, for the menu block. */
  menus: { _id: string; label: string }[];
  templates: { _id: string; label: string }[];
  /** The calendar vocabularies, for a calendar block's filters. */
  calendarCategories: string[];
  /** Today in the calendar's zone, so a previewed calendar agrees with the page. */
  calendarToday: string;
  /**
   * Saved Calendar Styles in full, not just their names.
   *
   * The picker only needs a name, but the canvas renders the real calendar —
   * so the preview needs the whole record and the layouts it reaches for, or
   * choosing a style would change nothing until the page was published.
   */
  calendarStyles: CalendarStyleRecord[];
  /** Layouts those styles reference, keyed by layout id. */
  calendarLayouts: Record<string, PageRow[]>;
  /** Event-box layout templates, for the event list block's item picker. */
  calendarEventTemplates: { _id: string; name: string }[];
  /** What "site default" resolves to, so the option can name it. */
  calendarDefaultStyleId: string;
  calendarWho: string[];
  calendarTags: string[];
  savedBlocks: { _id: string; name: string; icon: string; block: unknown }[];
};

export async function loadBuilderSources(): Promise<BuilderSources> {
  await connectDB();

  const [
    fonts,
    styles,
    shapes,
    stories,
    bios,
    collections,
    pages,
    forms,
    menus,
    templates,
    calendarSettings,
    calendarStyles,
    savedBlocks,
  ] = await Promise.all([
    FontFamily.find().select("family").sort({ family: 1 }).lean<any[]>(),
    CustomStyle.find().select("name slug").sort({ name: 1 }).lean<any[]>(),
    CustomShape.find().sort({ name: 1 }).lean<any[]>(),
    Story.find().select("headline").sort({ headline: 1 }).lean<any[]>(),
    Bio.find().select("name type").sort({ name: 1 }).lean<any[]>(),
    Collection.find().select("name isPublic").sort({ name: 1 }).lean<any[]>(),
    SitePage.find({ status: "published" }).select("title").sort({ title: 1 }).lean<any[]>(),
    FormDefinition.find().select("title").sort({ title: 1 }).lean<any[]>(),
    Menu.find().select("name isSite").sort({ isSite: -1, name: 1 }).lean<any[]>(),
    StoryTemplate.find().select("name").sort({ name: 1 }).lean<any[]>(),
    CalendarSettings.findOne()
      .select("categories who tags timeZone defaultStyleId")
      .lean<any>(),
    CalendarStyle.find().sort({ name: 1 }).lean<any[]>(),
    CustomPageBlock.find().sort({ name: 1 }).lean<any[]>(),
  ]);

  const styleRecords: CalendarStyleRecord[] = calendarStyles.map((doc) => ({
    ...normalizeCalendarStyle(doc),
    _id: String(doc._id),
    slug: doc.slug ?? "",
  }));

  // Every layout every saved style reaches for, so the canvas can draw an event
  // through the one its style picked.
  const styleLayoutIds = new Set<string>();
  for (const record of styleRecords) {
    for (const id of calendarStyleLayoutIds(record)) styleLayoutIds.add(id);
  }

  // Every event-box template, whether a style reaches for it or not: the event
  // list picks one directly rather than through a style.
  //
  // Fetched whole rather than by name, because the canvas draws the real list —
  // a template picked here has to render in the preview, not just appear in the
  // dropdown.
  const templateDocs = await CalendarTemplate.find({ kind: { $ne: "lightbox" } })
    .sort({ name: 1 })
    .lean<any[]>();

  const calendarEventTemplates = templateDocs.map((doc) => ({
    _id: String(doc._id),
    name: doc.name ?? "",
  }));

  const calendarLayouts: Record<string, PageRow[]> = {};
  for (const doc of templateDocs) {
    calendarLayouts[String(doc._id)] = normalizeCalendarTemplateLayout(doc.layout);
  }

  // Whatever a style reaches for beyond those — lightbox layouts, chiefly.
  const missing = [...styleLayoutIds].filter(
    (id) => !calendarLayouts[id] && /^[a-f0-9]{24}$/i.test(id)
  );
  if (missing.length > 0) {
    const layoutDocs = await CalendarTemplate.find({
      _id: { $in: missing },
    }).lean<any[]>();
    for (const doc of layoutDocs) {
      calendarLayouts[String(doc._id)] = normalizeCalendarTemplateLayout(doc.layout);
    }
  }

  return {
    fonts: fonts.map((font) => font.family as string),
    styles: styles.map((style) => ({
      _id: String(style._id),
      name: style.name,
      slug: style.slug,
    })),
    shapes: shapes.map((shape) => ({
      _id: String(shape._id),
      name: shape.name,
      slug: shape.slug,
      viewBox: shape.viewBox ?? "0 0 100 100",
      paths: shape.paths ?? [],
    })),
    stories: stories.map((story) => ({ _id: String(story._id), label: story.headline })),
    bios: bios.map((bio) => ({
      _id: String(bio._id),
      label: bio.name,
      type: normalizeBioType(bio.type),
    })),
    collections: collections.map((collection) => ({
      _id: String(collection._id),
      label: collection.name,
      isPublic: Boolean(collection.isPublic),
    })),
    pages: pages.map((page) => ({
      _id: String(page._id),
      label: page.title || "Untitled page",
    })),
    forms: forms.map((form) => ({ _id: String(form._id), label: form.title })),
    menus: menus.map((menu) => ({ _id: String(menu._id), label: menu.name })),
    templates: templates.map((template) => ({
      _id: String(template._id),
      label: template.name,
    })),
    calendarCategories: normalizeVocabulary(calendarSettings?.categories),
    calendarToday: todayDateKey(calendarSettings?.timeZone),
    calendarStyles: styleRecords,
    calendarLayouts,
    calendarEventTemplates,
    calendarDefaultStyleId: String(calendarSettings?.defaultStyleId ?? ""),
    calendarWho: normalizeVocabulary(calendarSettings?.who),
    calendarTags: normalizeVocabulary(calendarSettings?.tags),
    savedBlocks: savedBlocks.map((saved) => ({
      _id: String(saved._id),
      name: saved.name,
      icon: saved.icon ?? "",
      block: saved.block,
    })),
  };
}
