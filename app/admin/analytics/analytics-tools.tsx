"use client";

import { useState, useTransition } from "react";

import { processAnalyticsAction, rebuildAnalyticsAction } from "./actions";

/**
 * The two manual triggers.
 *
 * "Process now" is the same job the timer runs — the button exists because
 * waiting a quarter hour to see whether a change took is a poor way to work,
 * not because the job needs a person. "Rebuild everything" is the recovery
 * path after the timezone changes, which moves every day boundary underneath
 * summaries that were derived under the old one.
 */
export function AnalyticsTools({ canRebuild }: { canRebuild: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setResult(null);
    startTransition(async () => {
      setResult(await action());
    });
  }

  return (
    <>
      {result ? (
        <div className={`admin-notice${result.ok ? "" : " is-error"}`}>
          {result.message}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => run(processAnalyticsAction)}
        >
          {pending ? "Working…" : "Process now"}
        </button>

        {canRebuild ? (
          confirmRebuild ? (
            <>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={() => {
                  setConfirmRebuild(false);
                  run(rebuildAnalyticsAction);
                }}
              >
                Discard summaries and rebuild
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmRebuild(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              onClick={() => setConfirmRebuild(true)}
            >
              Rebuild everything…
            </button>
          )
        ) : null}
      </div>
    </>
  );
}
