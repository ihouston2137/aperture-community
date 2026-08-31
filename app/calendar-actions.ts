"use server";

import { getUserAccess } from "@/lib/access";
import { normalizeRsvpResponse, type RsvpResponse } from "@/lib/calendar";
import { connectDB } from "@/lib/db";
import { fullName, getRoleSummaries, splitRoles } from "@/lib/members";
import { CalendarEvent, EventAttendance, EventRsvp, User } from "@/lib/models";
import { getSession } from "@/lib/session";

/**
 * RSVP and attendance for one event.
 *
 * Both are read on demand rather than shipped with the calendar: a month view
 * holds dozens of events and almost none of them will be opened, so the cost
 * belongs at the moment somebody actually looks.
 */

/** A roster longer than this is a mailing list, not a room. */
const MAX_ROSTER = 500;

/**
 * One person who answered.
 *
 * The levels they hold come with the name so the list can be broken out by
 * membership level without a second round trip — and by id rather than by
 * name, because a level renamed should not silently stop matching a template
 * that names it.
 */
export type RsvpPerson = {
  name: string;
  /** Community role ids only: the membership levels, not what they administer. */
  levelIds: string[];
  /** What they said along with the answer. Empty when they said nothing. */
  note: string;
};

export type RsvpView = {
  enabled: boolean;
  /** What this viewer answered, if anything. */
  mine: RsvpResponse | null;
  yes: RsvpPerson[];
  no: RsvpPerson[];
  yesCount: number;
  noCount: number;
  /** Whether this viewer may answer, and why not when they may not. */
  canRsvp: boolean;
  signedIn: boolean;
  reason: string;
  /** This viewer's own note, so the box opens with what they last wrote. */
  myNote: string;
  /**
   * Every membership level on the site, so a block naming them by id can print
   * their names.
   *
   * Sent with the view rather than threaded from the page: the list and the
   * register are drawn deep inside a template, and passing a role table down
   * to them would touch every renderer in between for one label each.
   */
  levels: { _id: string; name: string }[];
};

const emptyRsvpView: RsvpView = {
  enabled: false,
  mine: null,
  yes: [],
  no: [],
  yesCount: 0,
  noCount: 0,
  canRsvp: false,
  signedIn: false,
  reason: "",
  myNote: "",
  levels: [],
};

async function loadRsvpView(eventId: string): Promise<RsvpView> {
  await connectDB();

  const event = await CalendarEvent.findById(eventId)
    .select("rsvpEnabled status")
    .lean<any>();
  if (!event || !event.rsvpEnabled) return { ...emptyRsvpView };

  const session = await getSession();
  const signedIn = Boolean(session);

  let canRsvp = false;
  let reason = "Sign in to answer.";

  if (session) {
    const { permissions, membershipStatus } = await getUserAccess(session.userId);
    if (membershipStatus !== "active") {
      reason = "Your membership is not active yet.";
    } else if (!permissions.includes("community.events.rsvp")) {
      reason = "Your membership level cannot RSVP to events.";
    } else {
      canRsvp = true;
      reason = "";
    }
  }

  const rsvps = await EventRsvp.find({ eventId }).limit(MAX_ROSTER).lean<any[]>();
  const userIds = rsvps.map((rsvp) => rsvp.userId);
  const [users, roles] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select("firstName lastName name email roleIds")
      .lean<any[]>(),
    getRoleSummaries(),
  ]);

  const personOf = (rsvp: any): RsvpPerson => {
    const user = users.find((candidate) => String(candidate._id) === String(rsvp.userId));
    const note = String(rsvp.note ?? "").trim();
    if (!user) return { name: "A member", levelIds: [], note };

    const { community } = splitRoles((user.roleIds ?? []).map(String), roles);
    return {
      name: fullName(user),
      levelIds: community.map((role) => role._id),
      note,
    };
  };

  const yes = rsvps.filter((rsvp) => rsvp.response === "yes");
  const no = rsvps.filter((rsvp) => rsvp.response === "no");

  const own = session
    ? rsvps.find((rsvp) => String(rsvp.userId) === session.userId)
    : null;
  const mine = own?.response ?? null;

  return {
    enabled: true,
    mine: normalizeRsvpResponse(mine),
    yes: yes.map(personOf).sort((a, b) => a.name.localeCompare(b.name)),
    no: no.map(personOf).sort((a, b) => a.name.localeCompare(b.name)),
    yesCount: yes.length,
    noCount: no.length,
    canRsvp,
    signedIn,
    reason,
    myNote: String(own?.note ?? ""),
    levels: roles
      .filter((role) => role.kind === "community")
      .map((role) => ({ _id: role._id, name: role.name })),
  };
}

/**
 * This viewer's own answers for a set of events, in one query.
 *
 * What the buttons in a grid need: a month view holds dozens of events, and
 * asking each one separately would be dozens of round trips to render a label.
 * Only the viewer's own answer comes back — the names of everyone else are a
 * separate, deliberate read.
 */
export async function getMyRsvpsAction(
  eventIds: string[]
): Promise<Record<string, RsvpResponse>> {
  const session = await getSession();
  if (!session || eventIds.length === 0) return {};

  const ids = eventIds.filter(Boolean).slice(0, MAX_ROSTER);
  if (ids.length === 0) return {};

  try {
    await connectDB();
    const rows = await EventRsvp.find({
      eventId: { $in: ids },
      userId: session.userId,
    }).lean<any[]>();

    const out: Record<string, RsvpResponse> = {};
    for (const row of rows) {
      const answer = normalizeRsvpResponse(row.response);
      if (answer) out[String(row.eventId)] = answer;
    }
    return out;
  } catch {
    // A malformed id in the list casts badly rather than meaning anything.
    return {};
  }
}

export async function getEventRsvpsAction(eventId: string): Promise<RsvpView> {
  if (!eventId) return { ...emptyRsvpView };
  try {
    return await loadRsvpView(eventId);
  } catch {
    // A malformed id casts badly rather than meaning anything.
    return { ...emptyRsvpView };
  }
}

/** Long enough for "arriving after the talk, leaving before the raffle". */
const MAX_RSVP_NOTE = 500;

export async function setMyRsvpAction(
  eventId: string,
  response: string,
  note?: string
): Promise<{ ok: boolean; error?: string; view?: RsvpView }> {
  const answer = normalizeRsvpResponse(response);
  if (!answer) return { ok: false, error: "Choose yes or no." };

  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to answer." };

  await connectDB();
  const event = await CalendarEvent.findById(eventId).select("rsvpEnabled").lean<any>();
  if (!event || !event.rsvpEnabled) {
    return { ok: false, error: "This event is not collecting RSVPs." };
  }

  const { permissions, membershipStatus } = await getUserAccess(session.userId);
  if (membershipStatus !== "active") {
    return { ok: false, error: "Your membership is not active yet." };
  }
  if (!permissions.includes("community.events.rsvp")) {
    return { ok: false, error: "Your membership level cannot RSVP to events." };
  }

  // One answer per member per event, so changing your mind updates in place.
  /*
   * The note only moves when one is passed.
   *
   * Pressing "Going" after writing a note should not wipe the note, and
   * saving a note should not need the answer re-sent — so each call says
   * which of the two it is changing.
   */
  const changes: Record<string, unknown> = { response: answer };
  if (note !== undefined) changes.note = note.trim().slice(0, MAX_RSVP_NOTE);

  await EventRsvp.findOneAndUpdate(
    { eventId, userId: session.userId },
    { $set: changes },
    { upsert: true }
  );

  return { ok: true, view: await loadRsvpView(eventId) };
}

/* ------------------------------------------------------------- Attendance */

export type AttendanceRow = {
  userId: string;
  name: string;
  /** What they said when they answered, for whoever is taking the register. */
  rsvpNote: string;
  /** The levels they hold, written out, for the line under the name. */
  level: string;
  /** The same levels as ids, for grouping the sheet into columns. */
  levelIds: string[];
  rsvp: RsvpResponse | null;
  present: boolean;
};

export type AttendanceView = {
  enabled: boolean;
  canView: boolean;
  canRecord: boolean;
  rows: AttendanceRow[];
  presentCount: number;
  /** True when the roster hit its ceiling and is not the whole membership. */
  truncated: boolean;
  /** Every membership level, so a block naming them by id can print the names. */
  levels: { _id: string; name: string }[];
};

const emptyAttendanceView: AttendanceView = {
  enabled: false,
  canView: false,
  canRecord: false,
  rows: [],
  presentCount: 0,
  truncated: false,
  levels: [],
};

async function loadAttendanceView(eventId: string): Promise<AttendanceView> {
  await connectDB();

  const event = await CalendarEvent.findById(eventId)
    .select("attendanceEnabled")
    .lean<any>();
  if (!event || !event.attendanceEnabled) return { ...emptyAttendanceView };

  const session = await getSession();
  if (!session) return { ...emptyAttendanceView, enabled: true };

  const { permissions } = await getUserAccess(session.userId);
  const canView = permissions.includes("attendance.view");
  const canRecord = permissions.includes("attendance.record");
  // Recording implies seeing, so a role given only the record permission is not
  // left with a sheet it cannot read.
  if (!canView && !canRecord) return { ...emptyAttendanceView, enabled: true };

  const roles = await getRoleSummaries();
  const communityRoleIds = roles
    .filter((role) => role.kind === "community")
    .map((role) => role._id);

  // The roster is the active membership: attendance is about who came, which
  // is not limited to who said they would.
  const [members, total, rsvps, marks] = await Promise.all([
    User.find({
      membershipStatus: "active",
      isActive: { $ne: false },
      roleIds: { $in: communityRoleIds },
    })
      .sort({ lastName: 1, firstName: 1 })
      .limit(MAX_ROSTER)
      .select("firstName lastName name email roleIds")
      .lean<any[]>(),
    User.countDocuments({
      membershipStatus: "active",
      isActive: { $ne: false },
      roleIds: { $in: communityRoleIds },
    }),
    EventRsvp.find({ eventId }).lean<any[]>(),
    EventAttendance.find({ eventId }).lean<any[]>(),
  ]);

  const rows: AttendanceRow[] = members.map((member) => {
    const id = String(member._id);
    const { community } = splitRoles((member.roleIds ?? []).map(String), roles);
    return {
      userId: id,
      name: fullName(member),
      level: community.map((role) => role.name).join(", "),
      levelIds: community.map((role) => role._id),
      rsvp: normalizeRsvpResponse(
        rsvps.find((rsvp) => String(rsvp.userId) === id)?.response
      ),
      rsvpNote: String(
        rsvps.find((rsvp) => String(rsvp.userId) === id)?.note ?? ""
      ).trim(),
      present: Boolean(
        marks.find((mark) => String(mark.userId) === id)?.present
      ),
    };
  });

  return {
    enabled: true,
    canView: canView || canRecord,
    canRecord,
    rows,
    presentCount: rows.filter((row) => row.present).length,
    truncated: total > members.length,
    levels: roles
      .filter((role) => role.kind === "community")
      .map((role) => ({ _id: role._id, name: role.name })),
  };
}

export async function getEventAttendanceAction(
  eventId: string
): Promise<AttendanceView> {
  if (!eventId) return { ...emptyAttendanceView };
  try {
    return await loadAttendanceView(eventId);
  } catch {
    return { ...emptyAttendanceView };
  }
}

export async function setAttendanceAction(
  eventId: string,
  userId: string,
  present: boolean
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to record attendance." };

  await connectDB();
  const { permissions } = await getUserAccess(session.userId);
  if (!permissions.includes("attendance.record")) {
    return { ok: false, error: "You cannot record attendance." };
  }

  const event = await CalendarEvent.findById(eventId)
    .select("attendanceEnabled")
    .lean<any>();
  if (!event || !event.attendanceEnabled) {
    return { ok: false, error: "This event is not taking attendance." };
  }

  await EventAttendance.findOneAndUpdate(
    { eventId, userId },
    {
      $set: {
        present,
        // A disputed record has an author and a time.
        recordedById: session.userId,
        recordedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return { ok: true };
}
