import {
  monthKeyFromDateKey,
  shiftDateKey,
  startOfWeek,
  type CalendarEventRecord,
} from "./calendar";

/**
 * Stand-in events for the styling previews.
 *
 * A preview has to show every part that can be styled — a location, a category,
 * groups, tags, a link — or half the slots would have nothing to demonstrate.
 * Real events rarely fill all of them at once, so the previews fall back to
 * these when the calendar is empty, and use real ones when it is not.
 */

type Sample = Omit<CalendarEventRecord, "_id" | "date"> & { dayOffset: number };

const SAMPLES: Sample[] = [
  {
    dayOffset: 1,
    startTime: "15:30",
    endTime: "17:00",
    name: "Full Ensemble Rehearsal",
    description: "Run the closer, then sectionals for the last thirty minutes.",
    location: "Band Room",
    linkText: "Rehearsal plan",
    linkUrl: "https://example.com/plan",
    status: "published",
    category: "Rehearsal",
    who: ["Marching Band"],
    tags: ["required"],
    rsvpEnabled: true,
    attendanceEnabled: true,
  },
  {
    dayOffset: 3,
    startTime: "19:00",
    endTime: "21:00",
    name: "Fall Concert",
    description: "Doors at 6:30. Concert black.",
    location: "Auditorium",
    linkText: "Buy tickets",
    linkUrl: "https://example.com/tickets",
    status: "published",
    category: "Performance",
    who: ["Concert Band", "Percussion"],
    tags: ["ticketed", "families"],
    rsvpEnabled: true,
    attendanceEnabled: false,
  },
  {
    dayOffset: 5,
    startTime: "",
    endTime: "",
    name: "Uniform Fitting",
    description: "Drop in any time during the day.",
    location: "Room 114",
    linkText: "",
    linkUrl: "",
    status: "published",
    category: "Admin",
    who: ["Color Guard"],
    tags: [],
    rsvpEnabled: false,
    attendanceEnabled: false,
  },
];

/** Sample events laid across the month or week containing `anchorDate`. */
export function sampleCalendarEvents(
  anchorDate: string,
  view: "month" | "week"
): CalendarEventRecord[] {
  // Anchored so every sample lands inside the range being previewed.
  const start =
    view === "week" ? startOfWeek(anchorDate) : `${monthKeyFromDateKey(anchorDate)}-08`;

  return SAMPLES.map((sample, index) => {
    const { dayOffset, ...rest } = sample;
    return {
      ...rest,
      _id: `sample-${index}`,
      date: shiftDateKey(start, dayOffset),
    };
  });
}

/** The one a lightbox preview opens on — the fullest of the samples. */
export function sampleLightboxEvent(anchorDate: string): CalendarEventRecord {
  return sampleCalendarEvents(anchorDate, "month")[1];
}
