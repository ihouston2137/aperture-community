"use client";

import type { CalendarEventRecord } from "@/lib/calendar";
import {
  isCalendarSlotBlock,
  type CalendarSlotBlock,
  type CalendarTemplateBlock,
} from "@/lib/calendar-slot-layout";
import type { PageBlock, PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

import { BlockWrapper, ColumnShell, RowShell } from "./block-primitives";
import { CalendarSlotBlockView } from "./calendar-slot-blocks";
import { BlockView } from "./page-blocks";

/**
 * One event, drawn through a layout template.
 *
 * The template's calendar slots come from the event; every other block is an
 * ordinary page block, so a template can carry its own headings, icons, shapes
 * and containers — the same arrangement `StoryRenderer` uses for stories.
 */
export function CalendarTemplateRenderer({
  layout,
  event,
  sources,
  showPlaceholders = false,
  interactive = true,
  designTime = false,
}: {
  layout: PageRow[];
  event: CalendarEventRecord | null;
  /** Records referenced by the template's page blocks. */
  sources: PageSources;
  showPlaceholders?: boolean;
  /** Page blocks only: an event box turns this off so its links do not fight
   *  the box own click. It says nothing about the calendar slots. */
  interactive?: boolean;
  /** True only on the builder canvas, where nothing is loaded or saved. */
  designTime?: boolean;
}) {
  return (
    <div className="cal-template">
      {layout.map((row) => (
        <RowShell key={row.id} row={row}>
          {row.columns.map((column) => (
            <ColumnShell key={column.id} column={column}>
              {(column.blocks as CalendarTemplateBlock[]).map((block) => (
                // The same wrapper the page renderer uses, so a calendar slot is
                // sized and placed exactly as any other block would be.
                <BlockWrapper key={block.id} block={block}>
                  {isCalendarSlotBlock(block) ? (
                    <CalendarSlotBlockView
                      block={block as CalendarSlotBlock}
                      event={event}
                      showPlaceholders={showPlaceholders}
                      designTime={designTime}
                    />
                  ) : (
                    <BlockView
                      block={block as PageBlock}
                      sources={sources}
                      interactive={interactive}
                    />
                  )}
                </BlockWrapper>
              ))}
            </ColumnShell>
          ))}
        </RowShell>
      ))}
    </div>
  );
}
