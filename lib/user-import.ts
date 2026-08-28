/**
 * Turning a column of somebody else's spreadsheet into an account.
 *
 * The mapping is the whole of the problem: no two systems name these fields
 * the same way, and guessing wrongly writes the wrong thing into everybody's
 * record at once. So the shapes and the row-by-row translation live here, free
 * of the database, and are used by both the screen that shows what will happen
 * and the action that makes it happen. What the reader is shown and what is
 * written are then the same code rather than two readings of one intention.
 */

import { isEmailAddress, normalizePhone } from "./member-types";
import { membershipStatus, type MembershipStatus } from "./permissions";

/** A field of an account that an imported column can be pointed at. */
export type ImportField = {
  key: ImportFieldKey;
  label: string;
  help: string;
  required?: boolean;
};

export const IMPORT_FIELD_KEYS = [
  "email",
  "firstName",
  "lastName",
  "name",
  "phone",
  "roles",
  "extraRoles",
  "passwordHash",
  "membershipStatus",
  "isActive",
  "emailVerified",
  "isSuspended",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: "email",
    label: "Email",
    help: "Required. The account is found by it, so it also decides what counts as somebody already on file.",
    required: true,
  },
  { key: "firstName", label: "First name", help: "" },
  { key: "lastName", label: "Last name", help: "" },
  {
    key: "name",
    label: "Display name",
    help: "Left to the first and last names when nothing is mapped.",
  },
  { key: "phone", label: "Phone", help: "Stored as digits, however it is written." },
  {
    key: "roles",
    label: "Roles",
    help: "Matched to the roles on this site by name. Several in one cell can be separated by a semicolon or a comma.",
  },
  {
    key: "extraRoles",
    label: "More roles",
    help: "A second column of role names, for an export that keeps team roles and access roles apart.",
  },
  {
    key: "passwordHash",
    label: "Password hash",
    help: "A bcrypt hash carried over from the old system, so people keep their password. Anything else is ignored, and those accounts get an unusable password instead.",
  },
  {
    key: "membershipStatus",
    label: "Membership status",
    help: "pending, active, rejected or suspended. Anything else reads as active.",
  },
  { key: "isActive", label: "Active", help: "true / false, yes / no, 1 / 0." },
  {
    key: "emailVerified",
    label: "Email verified",
    help: "A verified address is taken as confirmed, so nobody is asked to confirm an address again.",
  },
  {
    key: "isSuspended",
    label: "Suspended",
    help: "When true it sets the membership status to suspended, whatever the status column said.",
  },
];

/** Which column of the file, if any, each field is read from. */
export type ImportMapping = Partial<Record<ImportFieldKey, string>>;

/** One account as the file describes it, before anything is written. */
export type ImportDraft = {
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  /** As written in the file. Matching them to roles needs the database. */
  roleNames: string[];
  /** Empty unless the file carried one that is plainly a bcrypt hash. */
  passwordHash: string;
  membershipStatus: MembershipStatus;
  isActive: boolean;
  emailVerified: boolean;
};

/**
 * Guesses which column belongs to which field.
 *
 * Only a starting point — every guess is shown and can be changed before
 * anything is imported. Matching is on letters alone, so "First Name",
 * "first_name" and "firstname" are one thing.
 */
const GUESSES: Record<ImportFieldKey, string[]> = {
  email: ["email", "emailaddress", "mail"],
  firstName: ["firstname", "first", "givenname", "forename"],
  lastName: ["lastname", "last", "surname", "familyname"],
  name: ["name", "displayname", "fullname"],
  phone: ["phone", "phonenumber", "mobile", "cell", "telephone"],
  roles: ["teamroles", "roles", "role", "groups", "membership"],
  extraRoles: ["accessrole", "accessroles", "permissionrole", "level"],
  passwordHash: ["passwordhash", "password", "hash"],
  membershipStatus: ["membershipstatus", "status"],
  isActive: ["active", "isactive", "enabled"],
  emailVerified: ["verified", "emailverified", "isverified", "confirmed"],
  isSuspended: ["suspended", "issuspended", "blocked"],
};

function flatten(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function guessMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const taken = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    const wanted = GUESSES[field.key];
    // In the order the guesses are written, so "firstname" wins over "name"
    // for the first-name field and "name" is still there for the display name.
    for (const candidate of wanted) {
      const header = headers.find(
        (entry) => !taken.has(entry) && flatten(entry) === candidate
      );
      if (header) {
        mapping[field.key] = header;
        taken.add(header);
        break;
      }
    }
  }

  return mapping;
}

/** true / yes / y / 1 and their opposites, as a spreadsheet writes them. */
export function readBoolean(value: string): boolean {
  return ["true", "yes", "y", "1", "t"].includes(value.trim().toLowerCase());
}

/** Role names as people write a list of them: "Mentor;Parent" or "A, B". */
export function readRoleNames(value: string): string[] {
  return value
    .split(/[;,|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * A password carried over, or nothing.
 *
 * Only a bcrypt hash is taken. A column holding plain text would otherwise be
 * written into the field the site compares passwords against, which would
 * store the password in the clear and let nobody in.
 */
export function readPasswordHash(value: string): string {
  const hash = value.trim();
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash) ? hash : "";
}

/** Reads one row of the file into the account it describes. */
export function buildDraft(
  row: string[],
  headers: string[],
  mapping: ImportMapping
): ImportDraft {
  const cell = (key: ImportFieldKey): string => {
    const header = mapping[key];
    if (!header) return "";
    const index = headers.indexOf(header);
    return index === -1 ? "" : (row[index] ?? "").trim();
  };

  const firstName = cell("firstName");
  const lastName = cell("lastName");

  const suspended = mapping.isSuspended ? readBoolean(cell("isSuspended")) : false;
  const status = mapping.membershipStatus
    ? membershipStatus(cell("membershipStatus").toLowerCase())
    : "active";

  return {
    email: cell("email").toLowerCase(),
    firstName,
    lastName,
    name: cell("name") || [firstName, lastName].filter(Boolean).join(" "),
    phone: normalizePhone(cell("phone")),
    roleNames: [
      ...readRoleNames(cell("roles")),
      ...readRoleNames(cell("extraRoles")),
    ],
    passwordHash: readPasswordHash(cell("passwordHash")),
    // Suspension is a fact about the account, not a status among others: a
    // file saying both "active" and "suspended" means the account is stopped.
    membershipStatus: suspended ? "suspended" : status,
    // Nothing mapped means nothing said, and an account nobody has disabled is
    // one that works.
    isActive: mapping.isActive ? readBoolean(cell("isActive")) : true,
    emailVerified: mapping.emailVerified
      ? readBoolean(cell("emailVerified"))
      : false,
  };
}

/** Why one row cannot be imported, or empty when it can. */
export function draftProblem(draft: ImportDraft): string {
  if (!draft.email) return "No email address.";
  if (!isEmailAddress(draft.email)) return `"${draft.email}" is not an email address.`;
  if (!draft.firstName && !draft.lastName && !draft.name) return "No name.";
  return "";
}

/** What to do about an address already on the site. */
export const IMPORT_MODES = ["skip", "update"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export type ImportReport = {
  created: number;
  updated: number;
  /** Already on the site, and left alone. */
  skipped: number;
  /** Row number in the file, and what was wrong with it. */
  problems: { row: number; message: string }[];
  /** Role names in the file that match nothing on this site. */
  unknownRoles: string[];
};
