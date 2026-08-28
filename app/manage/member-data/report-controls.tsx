"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  DIMENSION_HELP,
  DIMENSION_LABELS,
  REPORT_DIMENSIONS,
  reportDimension,
  reportQueryString,
  type ReportSettings,
} from "@/lib/metadata-report";

export type SummableQuestion = {
  id: string;
  label: string;
  groupName: string;
};

/**
 * The three settings the dashboard is built from.
 *
 * Written to the URL rather than saved, so a reading can be linked to and sent
 * to somebody — "the shirt sizes by member" is a link, not a set of
 * instructions for reproducing it. It also means the settings belong to
 * whoever is looking rather than to the site, which is right for a question
 * one person asks once.
 */
export function ReportControls({
  settings,
  questions,
}: {
  settings: ReportSettings;
  questions: SummableQuestion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(next: Partial<ReportSettings>) {
    startTransition(() =>
      router.push(`/manage/member-data${reportQueryString({ ...settings, ...next })}`)
    );
  }

  function toggleQuestion(id: string) {
    const held = settings.questionIds;
    go({
      questionIds: held.includes(id)
        ? held.filter((entry) => entry !== id)
        : [...held, id],
    });
  }

  return (
    <section className="member-card manager-card">
      <h2 className="member-card-title">What this shows</h2>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="report-rows">Down the side</label>
          <select
            id="report-rows"
            value={settings.rowDimension}
            disabled={pending}
            onChange={(event) =>
              go({ rowDimension: reportDimension(event.target.value) })
            }
          >
            {REPORT_DIMENSIONS.map((dimension) => (
              <option key={dimension} value={dimension}>
                {DIMENSION_LABELS[dimension]}
              </option>
            ))}
          </select>
          <span className="help-text">
            {DIMENSION_HELP[settings.rowDimension]}
          </span>
        </div>

        <div className="field">
          <label htmlFor="report-cols">Across the top</label>
          <select
            id="report-cols"
            value={settings.columnDimension}
            disabled={pending}
            onChange={(event) =>
              go({ columnDimension: reportDimension(event.target.value) })
            }
          >
            {REPORT_DIMENSIONS.map((dimension) => (
              <option key={dimension} value={dimension}>
                {DIMENSION_LABELS[dimension]}
              </option>
            ))}
          </select>
          <span className="help-text">
            {DIMENSION_HELP[settings.columnDimension]}
          </span>
        </div>
      </div>

      <div className="field" style={{ marginTop: "0.875rem" }}>
        <span className="field-label">Added up</span>

        {questions.length === 0 ? (
          <span className="help-text">
            None of the groups you can see asks a number question. Only numbers
            can be added up — a shirt size is not a quantity.
          </span>
        ) : (
          <>
            <div className="chip-picker">
              {questions.map((question) => (
                <label key={question.id} className="chip-option">
                  <input
                    type="checkbox"
                    checked={settings.questionIds.includes(question.id)}
                    disabled={pending}
                    onChange={() => toggleQuestion(question.id)}
                  />
                  {question.groupName}: {question.label}
                </label>
              ))}
            </div>
            <span className="help-text">
              The number questions to total. Choosing none takes them all,
              which is worth watching when they measure different things —
              tickets and pounds do not add.
            </span>
          </>
        )}
      </div>
    </section>
  );
}
