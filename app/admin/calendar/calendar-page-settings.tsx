"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ColorPicker } from "@/components/color-field";
import { CalendarDisplayFields } from "@/components/builder/calendar-block-inspector";
import {
  defaultCalendarPageSettings,
  type CalendarDisplay,
  type CalendarPageSettings,
} from "@/lib/calendar";

import { saveCalendarPageAction } from "./actions";

/**
 * The site's own calendar page, set up here rather than built as a page.
 *
 * The display controls are literally the calendar block's, so a calendar as a
 * page and a calendar inside a page offer the same choices and are described in
 * the same words. Only what a block has no use for is added: whether the page
 * exists, and what it says at the top.
 */
export function CalendarPageSettingsPanel({
  settings,
  styles,
  defaultStyleId,
  categories,
  who,
  tags,
}: {
  settings: CalendarPageSettings;
  styles: { _id: string; name: string }[];
  defaultStyleId: string;
  categories: string[];
  who: string[];
  tags: string[];
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [title, setTitle] = useState(settings.title);
  const [intro, setIntro] = useState(settings.intro);
  const [background, setBackground] = useState(settings.backgroundColor);
  const [display, setDisplay] = useState<CalendarDisplay>(settings.display);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setNotice("");
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("enabled", enabled ? "on" : "");
      formData.set("title", title);
      formData.set("intro", intro);
      formData.set("backgroundColor", background);
      formData.set("display", JSON.stringify(display));

      const result = await saveCalendarPageAction(formData);
      if (result.ok) setNotice(result.message ?? "Saved.");
      else setError(result.error ?? "Could not save the calendar page.");
    });
  }

  return (
    <Panel title="Calendar page">
      <p className="help-text" style={{ marginBottom: "0.75rem" }}>
        A calendar of its own at <code>/calendar</code>, so a menu item or an
        email can point at one address without a page being built around it.
        Only members whose level holds <strong>View the community calendar</strong>{" "}
        can open it — everyone else gets a page that does not appear to exist.
      </p>

      <div className="field">
        <label className="chip-option" style={{ width: "fit-content" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Give the site a calendar page
        </label>
      </div>

      {enabled ? (
        <>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="calendar-page-title">Title</label>
              <input
                id="calendar-page-title"
                type="text"
                value={title}
                placeholder={defaultCalendarPageSettings.title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="calendar-page-intro">Intro</label>
              <input
                id="calendar-page-intro"
                type="text"
                value={intro}
                placeholder="A line under the title. Optional."
                onChange={(event) => setIntro(event.target.value)}
              />
            </div>
          </div>

          <ColorPicker
            label="Page background"
            value={background}
            onChange={setBackground}
            onClear={() => setBackground("")}
          />
          <p className="help-text" style={{ marginTop: "-0.35rem" }}>
            What the whole page sits on. Cleared, it follows the site&rsquo;s
            content background. A Calendar Style dresses the grid itself; this
            is the paper behind it.
          </p>

          <CalendarDisplayFields
            display={display}
            onChange={setDisplay}
            styles={styles}
            defaultStyleId={defaultStyleId}
            categories={categories}
            who={who}
            tags={tags}
          />

          <p className="help-text">
            Nothing links to it on its own. Add a menu item pointing at{" "}
            <code>/calendar</code> under Design › Menus, and give that item the
            same audience so the link and the page agree.
          </p>
        </>
      ) : null}

      <div className="member-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save calendar page"}
        </button>
        {enabled ? (
          <Link href="/calendar" className="btn" target="_blank">
            Open it
          </Link>
        ) : null}
        {notice ? <span className="help-text">{notice}</span> : null}
        {error ? <span className="form-error">{error}</span> : null}
      </div>
    </Panel>
  );
}
