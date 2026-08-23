/**
 * Runs once per server instance, before the first request is served.
 *
 * Used only to start the analytics timer. The Edge runtime has no timers that
 * outlive a request and no filesystem to read logs from, so this is Node-only;
 * during a build there is no server to schedule anything for.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const { startAnalyticsScheduler } = await import("./lib/analytics/scheduler");
    startAnalyticsScheduler();
  } catch {
    // A server that cannot schedule analytics must still serve the site.
  }
}
