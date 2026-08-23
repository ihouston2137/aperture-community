import { getAnalyticsSettings } from "./settings";
import { processAnalytics } from "./process";

/**
 * The scheduled job, run inside the server process.
 *
 * A timer here rather than an external cron because this app is a long-running
 * Node server and the work is small, idempotent and self-correcting: a run that
 * is missed, doubled or interrupted changes nothing about the result, since
 * every run rebuilds from the logs rather than accumulating. `/api/analytics/
 * process` exposes the same function for a real cron or a serverless host,
 * where this timer would not survive.
 *
 * Started from `instrumentation.ts`, which runs once per server instance.
 */

type SchedulerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  intervalMs: number;
};

// On the global so a dev-server hot reload re-enters this module without
// stacking a second timer on top of the first.
const globalState = globalThis as typeof globalThis & {
  _apertureAnalyticsScheduler?: SchedulerState;
};

const state: SchedulerState = globalState._apertureAnalyticsScheduler ?? {
  timer: null,
  running: false,
  intervalMs: 0,
};

globalState._apertureAnalyticsScheduler = state;

/** First run is delayed so it never competes with server startup. */
const FIRST_RUN_DELAY_MS = 30_000;

/**
 * Runs the processor unless it is already running.
 *
 * Overlap is the one thing the design does not tolerate: two passes rebuilding
 * the same day would race on the delete-then-write in `processDay`, and could
 * leave an hour bucket missing. The guard is process-local, which is all that
 * is needed while the timer is the only caller within a process.
 */
export async function runAnalyticsJob(): Promise<boolean> {
  if (state.running) return false;
  state.running = true;
  try {
    await processAnalytics();
    return true;
  } catch {
    // `processAnalytics` records its own failures; nothing here should throw
    // out of a timer callback and take the process down.
    return false;
  } finally {
    state.running = false;
  }
}

async function tick() {
  await runAnalyticsJob();
  await reschedule();
}

/** Re-reads the interval each time, so a change in the admin takes effect. */
async function reschedule() {
  let minutes = 15;
  try {
    const settings = await getAnalyticsSettings();
    if (!settings.enabled) minutes = 60;
    else minutes = settings.intervalMinutes;
  } catch {
    // Keep the default cadence rather than stopping.
  }

  const intervalMs = Math.max(60_000, minutes * 60_000);
  state.intervalMs = intervalMs;

  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    void tick();
  }, intervalMs);
  // Never a reason to hold the process open for analytics.
  state.timer.unref?.();
}

export function startAnalyticsScheduler() {
  if (state.timer) return;

  state.timer = setTimeout(() => {
    void tick();
  }, FIRST_RUN_DELAY_MS);
  state.timer.unref?.();
}

export function analyticsSchedulerStatus() {
  return { running: state.running, intervalMs: state.intervalMs };
}
