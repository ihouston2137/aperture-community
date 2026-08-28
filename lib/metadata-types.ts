/**
 * Member metadata: the questions a community asks about its people.
 *
 * Two kinds, and the difference is who the question belongs to.
 *
 * A **member-managed** group is asked *of* the member — dietary needs, a shirt
 * size, an emergency contact. They answer it themselves, and a required one is
 * put in front of them until they have.
 *
 * A **manager-managed** group is kept *about* the member — a safeguarding
 * check, a subscription paid, a note from the committee. The member never sees
 * it. Who may read it and who may change it are separate questions, answered
 * first by what a management role carries and then by who is named on the
 * group itself.
 *
 * Free of database imports: the editors are client components and read these
 * types and helpers, and importing a value from a module that reaches Mongoose
 * would drag the driver into the browser bundle.
 */

/* ------------------------------------------------------------- Questions */

export const QUESTION_TYPES = ["short", "long", "one", "many"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short: "Short text",
  long: "Long text",
  one: "Choose one",
  many: "Choose any",
};

export const QUESTION_TYPE_HELP: Record<QuestionType, string> = {
  short: "A line: a name, a size, a number.",
  long: "A paragraph, for anything that needs explaining.",
  one: "One answer from the list, as radio buttons.",
  many: "None, one or several from the list, as checkboxes.",
};

/** Whether a type is answered from a list rather than typed. */
export function isChoiceType(type: QuestionType): boolean {
  return type === "one" || type === "many";
}

export type MetadataQuestion = {
  /** Stable for the life of the question, because answers are stored by it. */
  id: string;
  label: string;
  /** Shown under the question. Empty when the question speaks for itself. */
  help: string;
  type: QuestionType;
  /** The answers offered, for `one` and `many`. Ignored by the text types. */
  options: string[];
  /**
   * Must be answered.
   *
   * On a member-managed group this is what puts the group in front of somebody
   * at sign-in. On a manager-managed one it is only a mark on the form: a
   * member cannot be made to answer a question they never see.
   */
  isRequired: boolean;
};

/* ---------------------------------------------------------------- Groups */

export const MANAGED_BY = ["member", "manager"] as const;

export type ManagedBy = (typeof MANAGED_BY)[number];

export const MANAGED_BY_LABELS: Record<ManagedBy, string> = {
  member: "Members answer it themselves",
  manager: "Kept about the member, by managers",
};

export type MetadataGroupSummary = {
  _id: string;
  name: string;
  description: string;
  managedBy: ManagedBy;
  /** The membership roles it is asked of. Empty means nobody. */
  roleIds: string[];
  questions: MetadataQuestion[];
  /**
   * Answered more than once.
   *
   * Some things a community asks for are a list rather than a fact: two
   * emergency contacts, three allergies, the cars somebody might arrive in.
   * The questions are the same each time; what changes is how many times they
   * are asked.
   */
  isRepeatable: boolean;
  /** What one of them is called — "Emergency contact", "Vehicle". */
  entryLabel: string;
  /** The most that may be given. Zero for no limit. */
  maxEntries: number;
  /* --- who may do what, on a manager-managed group ---------------------- */
  /** Management roles whose holders may read the answers. */
  viewRoleIds: string[];
  /** Named accounts who may read them, whatever roles they hold. */
  viewUserIds: string[];
  editRoleIds: string[];
  editUserIds: string[];
  /** The report is its own grant: reading everybody at once is not reading one. */
  reportRoleIds: string[];
  reportUserIds: string[];
};

/* --------------------------------------------------------------- Answers */

/** One question answered, for one member. */
export type MetadataValue = {
  questionId: string;
  /** For `short` and `long`. Empty for the choice types. */
  text: string;
  /** For `one` (at most one) and `many`. Empty for the text types. */
  choices: string[];
};

/**
 * One pass through a group's questions.
 *
 * Every group is answered in entries, and a group that is not repeatable is
 * simply one that holds at most one of them. That way the shape of an answer
 * does not depend on a flag somebody may change later — turning repetition on
 * for a group people have already answered keeps what they said as the first
 * entry, and turning it off keeps the first and drops the rest.
 */
export type MetadataEntry = {
  /** Distinguishes one entry from another while it is being edited. */
  id: string;
  values: MetadataValue[];
};

export type MetadataAnswerSummary = {
  _id: string;
  userId: string;
  groupId: string;
  entries: MetadataEntry[];
  /** ISO, or empty when nothing has been answered yet. */
  updatedAt: string;
};

/* --------------------------------------------------------------- Tidying */

const LABEL_LIMIT = 200;
const HELP_LIMIT = 500;
const OPTION_LIMIT = 120;
const TEXT_LIMIT = 4000;

export function questionType(value: unknown): QuestionType {
  return QUESTION_TYPES.includes(value as QuestionType)
    ? (value as QuestionType)
    : "short";
}

export function managedBy(value: unknown): ManagedBy {
  return MANAGED_BY.includes(value as ManagedBy) ? (value as ManagedBy) : "member";
}

/**
 * Drops questions somebody started and left blank, and choice questions with
 * nothing to choose from — a radio group with no options is a question that
 * cannot be answered.
 */
export function normalizeQuestions(value: unknown): MetadataQuestion[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const questions: MetadataQuestion[] = [];

  for (const [index, raw] of value.slice(0, 60).entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const label = String(entry.label ?? "").trim().slice(0, LABEL_LIMIT);
    if (!label) continue;

    const type = questionType(entry.type);
    const options = Array.isArray(entry.options)
      ? [
          ...new Set(
            entry.options
              .map((option) => String(option ?? "").trim().slice(0, OPTION_LIMIT))
              .filter(Boolean)
          ),
        ].slice(0, 60)
      : [];
    if (isChoiceType(type) && options.length === 0) continue;

    // An id repeated would have two questions sharing one answer.
    let id = String(entry.id ?? "").trim() || `q${index + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);

    questions.push({
      id,
      label,
      help: String(entry.help ?? "").trim().slice(0, HELP_LIMIT),
      type,
      options: isChoiceType(type) ? options : [],
      isRequired: Boolean(entry.isRequired),
    });
  }

  return questions;
}

/** Keeps an answer to the shape of the question it answers. */
export function normalizeValues(
  value: unknown,
  questions: MetadataQuestion[]
): MetadataValue[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  if (!Array.isArray(value)) return [];

  const values: MetadataValue[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const questionId = String(entry.questionId ?? "").trim();
    const question = byId.get(questionId);
    // An answer to a question that has since been deleted is dropped rather
    // than kept as an orphan nothing can display.
    if (!question || seen.has(questionId)) continue;
    seen.add(questionId);

    if (isChoiceType(question.type)) {
      const offered = new Set(question.options);
      const choices = (Array.isArray(entry.choices) ? entry.choices : [])
        .map((choice) => String(choice ?? "").trim())
        // Only what the question offers: an option removed from the list is no
        // longer an answer to it.
        .filter((choice) => offered.has(choice));
      values.push({
        questionId,
        text: "",
        choices: question.type === "one" ? choices.slice(0, 1) : [...new Set(choices)],
      });
      continue;
    }

    values.push({
      questionId,
      text: String(entry.text ?? "").trim().slice(0, TEXT_LIMIT),
      choices: [],
    });
  }

  return values;
}

/**
 * Reads whatever is stored into entries.
 *
 * Answers written before groups could repeat are a bare list of values; they
 * come back as the one entry they always were. A group that is not repeatable
 * keeps only the first, so turning repetition off does not leave answers
 * nothing can show.
 */
export function normalizeEntries(
  value: unknown,
  group: MetadataGroupSummary
): MetadataEntry[] {
  const rows = Array.isArray(value) ? value : [];

  // The old shape: a flat list of values rather than a list of entries.
  const looksFlat = rows.some(
    (row) => row && typeof row === "object" && "questionId" in (row as object)
  );
  const source = looksFlat ? [{ values: rows }] : rows;

  const entries: MetadataEntry[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of source.slice(0, 100).entries()) {
    const row = (raw ?? {}) as Record<string, unknown>;
    let id = String(row.id ?? "").trim() || `e${index + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);

    entries.push({ id, values: normalizeValues(row.values, group.questions) });
  }

  const kept = group.isRepeatable ? entries : entries.slice(0, 1);
  const limit = group.isRepeatable && group.maxEntries > 0 ? group.maxEntries : kept.length;
  return kept.slice(0, Math.max(limit, 0));
}

/** True when the question has been answered at all, in one entry. */
export function isAnswered(
  question: MetadataQuestion,
  values: MetadataValue[]
): boolean {
  const value = values.find((entry) => entry.questionId === question.id);
  if (!value) return false;
  return isChoiceType(question.type)
    ? value.choices.length > 0
    : value.text.trim() !== "";
}

/** Whether anything at all has been said in this entry. */
export function isEntryEmpty(
  group: MetadataGroupSummary,
  entry: MetadataEntry
): boolean {
  return !group.questions.some((question) => isAnswered(question, entry.values));
}

/**
 * What is still owed, counted across every entry.
 *
 * A required question is owed once per entry: a second emergency contact with
 * a name and no telephone number is as incomplete as a first one would be. A
 * repeatable group with nothing in it at all owes its required questions once,
 * because one entry is the least it can be answered with.
 */
export function unanswered(
  group: MetadataGroupSummary,
  entries: MetadataEntry[]
): MetadataQuestion[] {
  const required = group.questions.filter((question) => question.isRequired);
  if (required.length === 0) return [];
  if (entries.length === 0) return required;

  const owed: MetadataQuestion[] = [];
  for (const entry of entries) {
    for (const question of required) {
      if (!isAnswered(question, entry.values)) owed.push(question);
    }
  }
  return owed;
}

/** How one entry's answer reads on a report or a record. */
export function answerText(
  question: MetadataQuestion,
  values: MetadataValue[]
): string {
  const value = values.find((entry) => entry.questionId === question.id);
  if (!value) return "";
  return isChoiceType(question.type) ? value.choices.join(", ") : value.text;
}

/**
 * One question's answers across every entry, for a report's cell.
 *
 * Numbered when there is more than one, because "Dad, Mum" in one column and
 * "07700 900461, 07700 900912" in the next only line up if the reader can see
 * that they are both in the order the entries were given.
 */
export function answerAcross(
  question: MetadataQuestion,
  entries: MetadataEntry[]
): string {
  const answers = entries.map((entry) => answerText(question, entry.values));
  if (answers.length <= 1) return answers[0] ?? "";
  return answers
    .map((answer, index) => `${index + 1}. ${answer || "—"}`)
    .join("  ");
}

/* ---------------------------------------------------------------- Access */

/**
 * The permissions a management role can carry for metadata.
 *
 * Each is only half of a grant. Holding one says a role may be trusted with
 * this kind of access; being named on a group says which groups. Both are
 * needed, which is what lets one committee read the safeguarding answers and
 * another read the shirt sizes without either seeing the other.
 */
export const METADATA_PERMISSIONS = {
  define: "members.metadata",
  view: "members.metadata.view",
  edit: "members.metadata.edit",
  report: "members.metadata.reports",
} as const;

/** Who is asking, reduced to what the answer depends on. */
export type MetadataViewer = {
  userId: string;
  /** Every role held, management and community alike. */
  roleIds: string[];
  /** Every permission held, for the first half of each grant. */
  permissions: string[];
  /** Holds `members.metadata`, which defines the groups and so sees them all. */
  isDefiner: boolean;
};

/**
 * One grant, in the two ways it is given.
 *
 * A named account is a direct share and needs nothing else: it is somebody
 * being handed this one group by name, which is the whole point of naming
 * them. A role gets in only if it also carries the permission — the role list
 * says which groups, and the permission says the role may be trusted with them
 * at all.
 */
function granted(
  viewer: MetadataViewer,
  permission: string,
  roleIds: string[],
  userIds: string[]
): boolean {
  if (userIds.includes(viewer.userId)) return true;
  if (!viewer.permissions.includes(permission)) return false;
  return roleIds.some((roleId) => viewer.roleIds.includes(roleId));
}

/**
 * Whether this reader may see the answers a group holds.
 *
 * Editing implies reading: somebody trusted to change an answer is not being
 * kept from the answer they are changing.
 */
export function canViewGroup(
  viewer: MetadataViewer,
  group: MetadataGroupSummary
): boolean {
  if (viewer.isDefiner) return true;
  return (
    granted(viewer, METADATA_PERMISSIONS.view, group.viewRoleIds, group.viewUserIds) ||
    canEditGroup(viewer, group)
  );
}

export function canEditGroup(
  viewer: MetadataViewer,
  group: MetadataGroupSummary
): boolean {
  if (viewer.isDefiner) return true;
  return granted(
    viewer,
    METADATA_PERMISSIONS.edit,
    group.editRoleIds,
    group.editUserIds
  );
}

/**
 * Whether this reader may open the group's report.
 *
 * Its own grant, because everybody's answers on one screen is a different
 * thing to be trusted with than one member's answers on their record.
 */
export function canReportGroup(
  viewer: MetadataViewer,
  group: MetadataGroupSummary
): boolean {
  if (viewer.isDefiner) return true;
  return granted(
    viewer,
    METADATA_PERMISSIONS.report,
    group.reportRoleIds,
    group.reportUserIds
  );
}
