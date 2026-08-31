import { notFound, redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { normalizeVocabulary } from "@/lib/calendar";
import { getCalendarPageSettings, loadCalendarPage } from "@/lib/calendar-page";
import { calendarStyleCss } from "@/lib/calendar-style";
import { layoutResponsiveCss } from "@/lib/responsive-style";
import { styleSlotProps } from "@/lib/display-templates";
import { connectDB } from "@/lib/db";
import { CalendarSettings } from "@/lib/models";
import { getSession } from "@/lib/session";

import { CalendarScreen } from "./calendar-screen";

/**
 * The site's calendar, as a place rather than as a block on somebody's page.
 *
 * Who may open it is the membership level's **View the community calendar**
 * grant, and nothing else — which is what makes this different from a calendar
 * block, whose reach is whatever page it happens to sit on. A site that wants a
 * public calendar can still put a block on a public page; this address is for
 * the calendar that is the members'.
 *
 * Two different refusals, the same way `guardContent` splits them. Somebody not
 * signed in is sent to the sign-in form and returned here, because they may
 * well be allowed once they are. Somebody signed in without the grant gets a
 * plain 404: telling them the address exists but is not theirs leaks the shape
 * of a private area to no useful end.
 */
const PERMISSION = "community.calendar";

export async function generateMetadata() {
  const settings = await getCalendarPageSettings();
  return settings.enabled ? { title: settings.title } : {};
}

export default async function CalendarPage() {
  // Asked before anything else is read: a page that is switched off should not
  // cost a style lookup and a month of events to say so.
  const settings = await getCalendarPageSettings();
  if (!settings.enabled) notFound();

  const session = await getSession();
  if (!session) redirect("/login?next=/calendar");

  const { permissions, membershipStatus } = await getUserAccess(session.userId);
  if (membershipStatus !== "active" || !permissions.includes(PERMISSION)) {
    notFound();
  }

  // Seeing the calendar and running it are separate grants. `calendar.manage`
  // is a management permission, so a member can be given the page to read
  // without being given the events to change — and somebody who runs the
  // calendar no longer has to go into the admin to add one.
  const canManage = permissions.includes("calendar.manage");

  const view = await loadCalendarPage(canManage);

  // Only for the editor's pickers, so it is not read for a member who is
  // simply looking at the month.
  let vocabulary = { categories: [] as string[], who: [] as string[], tags: [] as string[] };
  if (canManage) {
    await connectDB();
    const doc = await CalendarSettings.findOne().select("categories who tags").lean<any>();
    vocabulary = {
      categories: normalizeVocabulary(doc?.categories),
      who: normalizeVocabulary(doc?.who),
      tags: normalizeVocabulary(doc?.tags),
    };
  }

  const titleStyled = styleSlotProps(view.settings.titleStyle);

  return (
    <SiteChrome
      // Redeclared for this page only, so the calendar's own paper reaches the
      // chrome around it rather than stopping at the content box.
      contentStyle={
        view.settings.backgroundColor
          ? { background: view.settings.backgroundColor }
          : undefined
      }
    >
      <div className="page-shell calendar-page">
        {/*
         * The style's own sheet.
         *
         * The calendar wears the style's class either way, but this page is
         * not a page-builder page and so nothing else emits its rules — the
         * class matched nothing here, and every saved style silently did
         * nothing on the one screen the calendar has of its own. The layouts
         * its templates use carry per-size rules of the same kind.
         */}
        <style
          dangerouslySetInnerHTML={{
            __html: [
              calendarStyleCss(view.style),
              ...Object.values(view.layouts).map(layoutResponsiveCss),
            ]
              .filter(Boolean)
              .join("\n"),
          }}
        />

        <header className="calendar-page-head">
          {/* The page's own title styling, layered over the built-in look —
              so a style that says only a colour keeps the size it had. */}
          <h1
            className={`calendar-page-title ${titleStyled.className}`.trim()}
            style={titleStyled.style}
          >
            {view.settings.title}
          </h1>
          {view.settings.intro ? (
            <p className="calendar-page-intro">{view.settings.intro}</p>
          ) : null}
        </header>

        <CalendarScreen
          display={view.settings.display}
          style={view.style}
          layouts={view.layouts}
          sources={view.sources}
          initialEvents={view.events}
          todayKey={view.todayKey}
          canManage={canManage}
          categories={vocabulary.categories}
          who={vocabulary.who}
          tags={vocabulary.tags}
        />
      </div>
    </SiteChrome>
  );
}
