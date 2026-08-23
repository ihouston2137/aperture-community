"use client";

import { useMemo, useRef, useState } from "react";

import type { SummaryPoint } from "@/lib/analytics/report";

/**
 * Visitors, visits and page views over time.
 *
 * Three series on one axis. All three count the same kind of thing — people,
 * sittings, pages — so they share a scale honestly; a second y-axis would let
 * any two of them be drawn crossing or not crossing at will, which is a claim
 * the data does not make.
 *
 * Two shapes for two readings. Lines suit a long run of days, where the
 * question is which way the trend is going. Columns suit a short run of
 * discrete buckets — the last two days, hour by hour — where each bucket is a
 * thing in itself rather than a point on a curve.
 *
 * The three hues are the first three categorical slots, which clear the
 * colour-vision, contrast and separation gates against both a dark and a light
 * panel — the admin surface is themeable, so the palette has to hold on either.
 * Identity never rests on hue alone regardless: the legend carries a colour key
 * beside each name, and the tooltip names every value it shows.
 */

const SERIES = [
  { key: "visitors", label: "Visitors", color: "#3987e5" },
  { key: "visits", label: "Visits", color: "#d95926" },
  { key: "pageViews", label: "Page views", color: "#199e70" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

const PLOT_WIDTH = VIEW_WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD.top - PAD.bottom;

/** White does the separating between touching marks — never a stroke. */
const BAR_GAP = 2;
/** Left over as air, so a group never fills its slot edge to edge. */
const SLOT_AIR = 2;
/**
 * A column is capped rather than stretched to fill its slot. Past this it stops
 * reading as a thin mark and becomes a block, which is loud out of proportion
 * to what it says — the leftover is air, and the group centres in the slot.
 */
const MAX_BAR = 24;
/** A non-zero value always draws something, however small. */
const MIN_BAR = 1;

/** Axis tops land on 1, 2 or 5 × a power of ten, so ticks read as round numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

const compact = (value: number): string =>
  value >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString();

/**
 * A column: rounded at the value end, square where it meets the baseline.
 *
 * The radius is capped at half the width so a thin bar rounds into a dome
 * rather than overshooting into a shape the path cannot draw.
 */
function columnPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(4, width / 2, height);
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + width - radius},${y}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `L${x + width},${bottom}`,
    "Z",
  ].join(" ");
}

export function AnalyticsChart({
  points,
  caption,
  variant = "line",
  totals,
}: {
  points: SummaryPoint[];
  /** Names what is plotted, so a single-glance read needs no legend hunt. */
  caption?: string;
  variant?: "line" | "bar";
  /**
   * The figures beside each name in the legend: the whole period, not its last
   * bucket.
   *
   * Passed in rather than added up here because visitors do not add up —
   * someone who came on Monday and again on Thursday is one visitor, and only
   * the report layer, which holds the id sets, can say so. Omitted, the legend
   * falls back to summing, which is right for visits and views and an
   * over-count for visitors.
   */
  totals?: Partial<Record<SeriesKey, number>>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const isBar = variant === "bar";

  const geometry = useMemo(() => {
    const highest = points.reduce(
      (top, point) => Math.max(top, point.visitors, point.visits, point.pageViews),
      0
    );
    const max = niceMax(highest);

    // Columns own a band each; a line's points sit on the edges of the plot.
    const slot = PLOT_WIDTH / Math.max(1, points.length);
    const span = Math.max(1, points.length - 1);

    const barWidth = Math.min(
      MAX_BAR,
      Math.max(0.5, (slot - SLOT_AIR - BAR_GAP * (SERIES.length - 1)) / SERIES.length)
    );

    // Whatever the cap leaves over becomes air on both sides of the group.
    const groupSpan = barWidth * SERIES.length + BAR_GAP * (SERIES.length - 1);
    const groupInset = Math.max(SLOT_AIR / 2, (slot - groupSpan) / 2);

    return {
      max,
      slot,
      barWidth,
      groupInset,
      centerFor: (index: number) =>
        isBar
          ? PAD.left + (index + 0.5) * slot
          : PAD.left + (index / span) * PLOT_WIDTH,
      yFor: (value: number) => PAD.top + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT,
    };
  }, [points, isBar]);

  const { max, slot, barWidth, groupInset, centerFor, yFor } = geometry;
  const ticks = [0, max / 2, max];

  if (points.length === 0) {
    return <p className="admin-subtitle">No analytics yet.</p>;
  }

  /** The whole period's figure for one series, for the legend. */
  const totalFor = (key: SeriesKey) =>
    totals?.[key] ??
    points.reduce((sum, point) => sum + point[key], 0);

  const lineFor = (key: SeriesKey) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${centerFor(index)},${yFor(point[key])}`
      )
      .join(" ");

  /**
   * Pointer position → nearest bucket, through the SVG's rendered width.
   *
   * The whole slot is the target, not the mark: a 4px column is far below any
   * usable hit size, and the reader is pointing at an hour rather than at one
   * of its three bars.
   */
  function trackPointer(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;

    const viewX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const index = isBar
      ? Math.floor((viewX - PAD.left) / slot)
      : Math.round(((viewX - PAD.left) / PLOT_WIDTH) * Math.max(1, points.length - 1));

    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  const active = hover === null ? null : points[hover];
  // Flipped to the left near the right edge so it never runs off the panel.
  const tooltipRight =
    hover !== null && centerFor(hover) > PAD.left + PLOT_WIDTH * 0.6;

  return (
    <figure className="viz-figure">
      {caption ? <figcaption className="viz-caption">{caption}</figcaption> : null}

      <div className="viz-legend">
        {SERIES.map((series) => (
          <span key={series.key} className="viz-legend-item">
            <span className="viz-key" style={{ background: series.color }} />
            {series.label}
            <strong>{totalFor(series.key).toLocaleString()}</strong>
          </span>
        ))}
      </div>

      <div className="viz-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="viz-svg"
          role="img"
          aria-label={
            caption ?? "Visitors, visits and page views over the selected period"
          }
          onPointerMove={trackPointer}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_WIDTH}
                y1={yFor(tick)}
                y2={yFor(tick)}
                className="viz-grid"
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 8} y={yFor(tick) + 4} className="viz-tick" textAnchor="end">
                {compact(Math.round(tick))}
              </text>
            </g>
          ))}

          {/* First and last only: a label under every one of forty-eight
              buckets is unreadable, and the tooltip names the exact one. */}
          <text x={PAD.left} y={VIEW_HEIGHT - 8} className="viz-tick" textAnchor="start">
            {points[0].label}
          </text>
          <text
            x={PAD.left + PLOT_WIDTH}
            y={VIEW_HEIGHT - 8}
            className="viz-tick"
            textAnchor="end"
          >
            {points[points.length - 1].label}
          </text>

          {/* The hover indicator sits behind the marks: a band over the whole
              bucket for columns, a crosshair through the point for lines. */}
          {hover !== null ? (
            isBar ? (
              <rect
                x={PAD.left + hover * slot}
                y={PAD.top}
                width={slot}
                height={PLOT_HEIGHT}
                className="viz-hover-band"
              />
            ) : (
              <line
                x1={centerFor(hover)}
                x2={centerFor(hover)}
                y1={PAD.top}
                y2={PAD.top + PLOT_HEIGHT}
                className="viz-crosshair"
                vectorEffect="non-scaling-stroke"
              />
            )
          ) : null}

          {isBar
            ? points.map((point, index) => (
                <g key={point.key}>
                  {SERIES.map((series, seriesIndex) => {
                    const value = point[series.key];
                    if (value <= 0) return null;

                    const top = yFor(value);
                    const height = Math.max(MIN_BAR, PAD.top + PLOT_HEIGHT - top);
                    const x =
                      PAD.left +
                      index * slot +
                      groupInset +
                      seriesIndex * (barWidth + BAR_GAP);

                    return (
                      <path
                        key={series.key}
                        d={columnPath(
                          x,
                          PAD.top + PLOT_HEIGHT - height,
                          barWidth,
                          height
                        )}
                        fill={series.color}
                      />
                    );
                  })}
                </g>
              ))
            : SERIES.map((series) => (
                <path
                  key={series.key}
                  d={lineFor(series.key)}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

          {/* End dots belong to lines: on columns the bar end already marks the
              value, and a dot on top of it would be a second mark saying so. */}
          {isBar
            ? null
            : SERIES.map((series) => {
                const index = hover ?? points.length - 1;
                return (
                  <circle
                    key={series.key}
                    cx={centerFor(index)}
                    cy={yFor(points[index][series.key])}
                    r={4}
                    fill={series.color}
                    className="viz-dot"
                  />
                );
              })}
        </svg>

        {active ? (
          <div
            className="viz-tooltip"
            style={{
              left: `${((centerFor(hover as number) / VIEW_WIDTH) * 100).toFixed(3)}%`,
              transform: tooltipRight
                ? "translateX(-100%) translateX(-12px)"
                : "translateX(12px)",
            }}
          >
            <div className="viz-tooltip-title">{active.label}</div>
            {SERIES.map((series) => (
              <div key={series.key} className="viz-tooltip-row">
                <span className="viz-key" style={{ background: series.color }} />
                <span>{series.label}</span>
                <strong>{active[series.key].toLocaleString()}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
