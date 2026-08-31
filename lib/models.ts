import mongoose, { Schema, type Model } from "mongoose";

import { BIO_TYPES } from "./bio-types";
import {
  CALENDAR_EVENT_STATUSES,
  CALENDAR_TEMPLATE_KINDS,
  RSVP_RESPONSES,
} from "./calendar";
import {
  MEMBERSHIP_STATUSES,
  ROLE_KINDS,
  type MembershipStatus,
  type RoleKind,
} from "./permissions";
import { STORY_TEMPLATE_LAYOUT_VERSION } from "./story-template-layout";
import {
  MEDIA_CLICK_ACTIONS,
  STORY_IMAGE_ALIGNMENTS,
  STORY_IMAGE_SIZES,
} from "./story-media";
import { TWO_FACTOR_MODES, VERIFICATION_PURPOSES } from "./verification-types";

/**
 * All builder layouts (pages, forms, publications, story templates) are stored
 * as mixed JSON arrays. The schema layer is deliberately permissive there —
 * normalization lives in the `lib/*-layout.ts` helpers instead of in Mongoose.
 */

const Mixed = Schema.Types.Mixed;

/**
 * Models are typed as `Model<any>` on purpose. A generic `model()` helper
 * makes the TypeScript checker blow its heap on Mongoose 9's conditional types,
 * and every read path here already goes through `.lean()` plus the explicit
 * normalizers in `lib/*-layout.ts`.
 */
/**
 * Compiles a model once, but never keeps one whose schema has moved on.
 *
 * Mongoose caches compiled models on the connection, and a hot reload
 * re-evaluates this module with fresh schema objects. Returning the cached
 * model then means writes are validated against the *old* schema, and strict
 * mode silently drops any field added since — which is invisible until the data
 * is read back and the new field is missing from every document. Recompiling
 * when the schema object differs costs nothing in production, where this module
 * is evaluated once.
 */
function model(name: string, schema: Schema): Model<any> {
  const cached = mongoose.models[name] as Model<any> | undefined;
  if (cached) {
    if (cached.schema === schema) return cached;
    mongoose.deleteModel(name);
  }
  return mongoose.model(name, schema);
}

/* ------------------------------------------------------------------ Access */

export type UserDoc = {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  mustChangePassword: boolean;
  roleIds: mongoose.Types.ObjectId[];
  requestedRoleId: mongoose.Types.ObjectId | null;
  membershipStatus: MembershipStatus;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const UserSchema = new Schema<any>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    /**
     * The display name. Kept as its own field rather than derived on read so
     * accounts created before first and last names existed keep the name they
     * were given, and so a member can be shown under a name that is not simply
     * "first last". `composeName()` in `lib/members.ts` keeps it in step.
     */
    name: { type: String, default: "" },
    phone: { type: String, default: "", trim: true },
    mustChangePassword: { type: Boolean, default: false },
    /**
     * Both kinds of role live here. Reads filter by the role's `kind` — see
     * `splitRoles()` in `lib/members.ts` — so a member holding a management
     * role is one account, not two.
     */
    roleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    /** The community role asked for at registration, kept for the approver. */
    requestedRoleId: { type: Schema.Types.ObjectId, ref: "Role", default: null },
    membershipStatus: {
      type: String,
      enum: MEMBERSHIP_STATUSES,
      default: "active",
    },
    /** Null until the six-digit code sent at registration is entered. */
    emailVerifiedAt: { type: Date, default: null },
    registeredAt: { type: Date, default: null },
    /** Stops the new-registration notification going out twice. */
    registrationNotifiedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** Shown to the approver, and to the member on their own record. */
    decisionNote: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = model("User", UserSchema);

export type RoleDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  kind: RoleKind;
  level: number;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const RoleSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    /**
     * `management` roles grant admin permissions; `community` roles are the
     * membership levels. The two draw from different permission vocabularies
     * (`permissionGroupsFor()`), so the kind decides what may be stored below.
     */
    kind: { type: String, enum: ROLE_KINDS, default: "management" },
    /** Orders the membership levels. Unused by management roles. */
    level: { type: Number, default: 0 },
    /** Offered on the registration form. Community roles only. */
    openToRegistration: { type: Boolean, default: true },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Role = model("Role", RoleSchema);

/**
 * One six-digit code, hashed. Serves all three flows — confirming an address at
 * registration, the second factor at sign-in, and password recovery — because
 * they differ only in what consuming the code is allowed to do.
 */
const VerificationCodeSchema = new Schema<any>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: VERIFICATION_PURPOSES, required: true },
    /** bcrypt, so a dumped collection does not hand over live codes. */
    codeHash: { type: String, required: true },
    sentTo: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    /** Wrong guesses so far; the code dies at `MAX_CODE_ATTEMPTS`. */
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongo drops expired codes on its own, so a stale one is never a live one.
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationCode = model("VerificationCode", VerificationCodeSchema);

/**
 * How joining works: whether registration is open, what a new account is given,
 * whether a human approves it, and who hears about it. Defaults live in
 * `lib/auth-settings.ts`; this only stores what was chosen.
 */
const AuthSettingsSchema = new Schema<any>(
  {
    allowRegistration: { type: Boolean, default: true },
    /** Whether registrants choose the level they are applying for. */
    allowRoleRequest: { type: Boolean, default: true },
    /** Assigned at registration regardless of what was requested. */
    defaultCommunityRoleId: { type: Schema.Types.ObjectId, ref: "Role", default: null },
    /** Skips the approval queue: new accounts land `active`. */
    autoApproveRegistrations: { type: Boolean, default: false },
    requireEmailVerification: { type: Boolean, default: true },
    /** `admins` asks only accounts holding a management role for a code. */
    twoFactorMode: { type: String, enum: TWO_FACTOR_MODES, default: "off" },
    codeTtlMinutes: { type: Number, default: 15 },
    /* ------------------------------ New registration notification */
    notifyOnRegistration: { type: Boolean, default: false },
    registrationRecipients: [{ type: String }],
    registrationSubject: { type: String, default: "" },
    registrationIntro: { type: String, default: "" },
  },
  { timestamps: true }
);

export const AuthSettings = model("AuthSettings", AuthSettingsSchema);

/* --------------------------------------------------- Legacy / home content */

const PhotoSchema = new Schema<any>(
  {
    title: { type: String, default: "" },
    place: { type: String, default: "" },
    alt: { type: String, default: "" },
    src: { type: String, default: "" },
    featured: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    orientation: { type: String, default: "landscape" },
  },
  { timestamps: true }
);

export const Photo = model("Photo", PhotoSchema);

const SettingsSchema = new Schema<any>(
  {
    photographerName: { type: String, default: "" },
    location: { type: String, default: "" },
    bio: { type: String, default: "" },
    email: { type: String, default: "" },
    heroTitle: { type: String, default: "" },
    heroSubtitle: { type: String, default: "" },
    instagram: { type: String, default: "" },
    vimeo: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Settings = model("Settings", SettingsSchema);

export const CONTENT_WIDTHS = ["full", "wide", "standard", "narrow"] as const;

const AppearanceSchema = new Schema<any>(
  {
    headerBackground: { type: String, default: "#0f1115" },
    headerText: { type: String, default: "#f5f5f5" },
    headerAccent: { type: String, default: "#8ab4f8" },

    // Header layout
    headerWidth: { type: String, enum: CONTENT_WIDTHS, default: "standard" },
    headerPaddingY: { type: Number, default: 1 },
    headerSticky: { type: Boolean, default: false },
    headerBorderEnabled: { type: Boolean, default: true },
    headerBorderWidth: { type: Number, default: 0.0625 },
    headerBorderColor: { type: String, default: "#262b33" },
    headerShadow: { type: Boolean, default: false },
    headerNavAlign: { type: String, enum: ["left", "center", "right"], default: "right" },
    headerNavSize: { type: Number, default: 0.9375 },
    headerNavGap: { type: Number, default: 1.25 },
    adminBackground: { type: String, default: "#101317" },
    adminPanel: { type: String, default: "#171b21" },
    adminText: { type: String, default: "#e8eaed" },
    adminAccent: { type: String, default: "#8ab4f8" },
    contentBackground: { type: String, default: "#ffffff" },
    contentText: { type: String, default: "#16181d" },
    contentAccent: { type: String, default: "#2b6cb0" },
    footerBackground: { type: String, default: "#0f1115" },
    footerText: { type: String, default: "#c9ced6" },

    // Footer layout
    footerWidth: { type: String, enum: CONTENT_WIDTHS, default: "standard" },
    footerPaddingY: { type: Number, default: 2 },
    footerBorderEnabled: { type: Boolean, default: false },
    footerBorderWidth: { type: Number, default: 0.0625 },
    footerBorderColor: { type: String, default: "#262b33" },
    footerAlign: {
      type: String,
      enum: ["left", "center", "between"],
      default: "between",
    },
    footerFontSize: { type: Number, default: 0.875 },
    footerColumnGap: { type: Number, default: 1.5 },
    footerRowGap: { type: Number, default: 1.25 },

    headingFont: { type: String, default: "system-ui" },
    bodyFont: { type: String, default: "system-ui" },
    faviconUrl: { type: String, default: "" },
    // Per-element text styling for the public header, page body and footer.
    textStyles: { type: Mixed, default: {} },
  },
  { timestamps: true }
);

export const Appearance = model("Appearance", AppearanceSchema);

const MenuChildSchema = new Schema<any>(
  {
    label: { type: String, default: "" },
    href: { type: String, default: "" },
    newTab: { type: Boolean, default: false },
  },
  { _id: false }
);

const MenuLinkSchema = new Schema<any>(
  {
    label: { type: String, default: "" },
    href: { type: String, default: "" },
    newTab: { type: Boolean, default: false },
    // A `label` is not a link itself; it opens a dropdown of its children.
    kind: { type: String, enum: ["link", "label"], default: "link" },
    children: { type: [MenuChildSchema], default: [] },
    showCaret: { type: Boolean, default: true },
  },
  { _id: false }
);

/**
 * A named menu: the site header, or one placed on a page by a menu block.
 *
 * Items are Mixed and normalized in `lib/menu-types.ts`, the same arrangement
 * every builder layout uses — the shape nests and grows, and a normalizer beats
 * a schema at keeping older documents readable.
 */
const MenuSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    /** The header menu. Exactly one menu carries this. */
    isSite: { type: Boolean, default: false },
    items: { type: [Mixed], default: [] },
  },
  { timestamps: true }
);

export const Menu = model("Menu", MenuSchema);

const SocialLinkSchema = new Schema<any>(
  {
    platform: { type: String, default: "" },
    label: { type: String, default: "" },
    href: { type: String, default: "" },
  },
  { _id: false }
);

const SiteContentSchema = new Schema<any>(
  {
    metaTitle: { type: String, default: "Aperture" },
    metaDescription: { type: String, default: "" },
    metaImageUrl: { type: String, default: "" },

    headerBrandText: { type: String, default: "Aperture" },
    headerBrandHref: { type: String, default: "/" },
    headerTagline: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    logoMediaId: { type: String, default: "" },
    logoHeight: { type: Number, default: 40 },
    showLogo: { type: Boolean, default: false },
    showBrandText: { type: Boolean, default: true },

    menuLinks: { type: [MenuLinkSchema], default: [] },

    availabilityEnabled: { type: Boolean, default: false },
    availabilityLabel: { type: String, default: "" },
    signInEnabled: { type: Boolean, default: true },
    signInPlacement: { type: String, default: "header" },
    signInLabel: { type: String, default: "Sign in" },
    availabilityHref: { type: String, default: "" },

    socialLinks: { type: [SocialLinkSchema], default: [] },

    footerBrandText: { type: String, default: "" },
    footerLogoUrl: { type: String, default: "" },
    footerLogoMediaId: { type: String, default: "" },
    footerLogoHeight: { type: Number, default: 32 },
    showFooterLogo: { type: Boolean, default: false },
    footerText: { type: String, default: "" },
    copyright: { type: String, default: "" },

    // Defaults inherited by collections unless a collection overrides them.
    collectionTemplateDefaults: { type: Mixed, default: {} },
    collectionDisplayDefaults: { type: Mixed, default: {} },
    collectionStyleOverrides: { type: Mixed, default: {} },

    safeModeDefault: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SiteContent = model("SiteContent", SiteContentSchema);

/* ------------------------------------------------------------------- Email */

const EmailSettingsSchema = new Schema<any>(
  {
    enabled: { type: Boolean, default: false },
    host: { type: String, default: "" },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    username: { type: String, default: "" },
    password: { type: String, default: "" },
    fromName: { type: String, default: "" },
    fromEmail: { type: String, default: "" },
    replyTo: { type: String, default: "" },
    notificationRecipients: [{ type: String }],
    notifyOnFormSubmission: { type: Boolean, default: true },
    lastVerifiedAt: { type: Date, default: null },
    /*
     * Only the wordings somebody has actually replaced. A template with no
     * entry here follows the copy the app ships with, so improving a default
     * reaches every site that has not overridden it.
     */
    templates: [
      {
        _id: false,
        key: { type: String, required: true },
        subject: { type: String, default: "" },
        body: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

export const EmailSettings = model("EmailSettings", EmailSettingsSchema);

/* --------------------------------------------------------------- Analytics */

const AnalyticsSettingsSchema = new Schema<any>(
  {
    enabled: { type: Boolean, default: true },
    /**
     * Which zone's calendar a "day" follows. Every bucket key and every log
     * file name is derived in this zone, so changing it changes what the
     * boundaries mean — the processor reprocesses from the logs when it does.
     */
    timezone: { type: String, default: "America/New_York" },
    /** Days of raw log files to keep. 0 keeps them forever. */
    retentionDays: { type: Number, default: 400 },
    /** Minutes between scheduled processing runs. */
    intervalMinutes: { type: Number, default: 15 },
    /**
     * Whether the reports open with signed-in traffic filtered out. Both sets
     * of figures are always stored, so this only chooses which is shown first;
     * the view can be switched either way at any time.
     */
    excludeLoggedInByDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const AnalyticsSettings = model("AnalyticsSettings", AnalyticsSettingsSchema);

/**
 * Where the processor left off.
 *
 * `lastFinalizedDay` is the guarantee behind "a finished day is processed once
 * more, then never again": every day after it that has since ended gets one
 * final pass on the next run, and the marker moves up behind them.
 */
const AnalyticsStateSchema = new Schema<any>(
  {
    lastFinalizedDay: { type: String, default: "" },
    lastRunAt: { type: Date, default: null },
    lastRunMs: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    /** The zone the stored summaries were built under. */
    timezone: { type: String, default: "" },
  },
  { timestamps: true }
);

export const AnalyticsState = model("AnalyticsState", AnalyticsStateSchema);

export const ANALYTICS_PERIODS = ["hour", "day", "month", "year"] as const;

const AnalyticsSummarySchema = new Schema<any>(
  {
    period: { type: String, enum: ANALYTICS_PERIODS, required: true },
    /** `2026`, `2026-08`, `2026-08-13`, `2026-08-13T14`. Sorts chronologically. */
    key: { type: String, required: true },
    /** The instant the bucket opens, for charting without parsing keys. */
    startedAt: { type: Date, required: true },

    /* Everyone. */
    visitors: { type: Number, default: 0 },
    visits: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 },
    /** Collection pictures opened full screen. Never folded into page views. */
    imageViews: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    /**
     * Hits identified by address rather than by a returned cookie. A high share
     * means the visitor counts lean on a weaker signal, where people sharing an
     * address and a browser merge into one.
     */
    fallbackHits: { type: Number, default: 0 },
    sources: { type: Mixed, default: [] },
    pages: { type: Mixed, default: [] },
    /** `[{ label, count }]`, by `Collection Name - Image Title`. */
    images: { type: Mixed, default: [] },
    files: { type: Mixed, default: [] },

    /** Distinct visitors who were signed in at some point in this bucket. */
    loggedInVisitors: { type: Number, default: 0 },

    /**
     * The same figures with every signed-in visitor's traffic removed.
     *
     * Stored rather than subtracted at read time because visitors and visits
     * are distinct counts, which do not subtract: a report cannot work out how
     * many unique people are left once some of them are taken away. Absent on
     * summaries written before this existed, where the reader falls back to
     * the unfiltered figures.
     */
    anon: { type: Mixed, default: null },

    timezone: { type: String, default: "" },
    /** Set once the day is over and has had its final pass. */
    finalized: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AnalyticsSummarySchema.index({ period: 1, key: 1 }, { unique: true });
AnalyticsSummarySchema.index({ period: 1, startedAt: 1 });

export const AnalyticsSummary = model("AnalyticsSummary", AnalyticsSummarySchema);

/**
 * The distinct ids seen on one day, kept apart from the summary that reports it.
 *
 * A month's visitor count is not the sum of its days — someone who came on
 * Monday and Thursday is one visitor, not two — so the only way to roll a month
 * or a year up exactly is to union the ids underneath it. They live here rather
 * than on the summary because every chart reads summaries and none of them want
 * to drag thousands of ids along.
 */
const AnalyticsDayIdsSchema = new Schema<any>(
  {
    day: { type: String, required: true, unique: true },
    visitorIds: { type: [String], default: [] },
    visitIds: { type: [String], default: [] },
    /**
     * The subset that was signed in at some point that day. Held as a subset
     * rather than a separate set so a month's anonymous count is the union of
     * its days minus the union of these — exact, and computed the same way at
     * every level.
     */
    loggedInVisitorIds: { type: [String], default: [] },
    loggedInVisitIds: { type: [String], default: [] },
    /**
     * Which anonymous id belonged to which signed-in account. This is the
     * record that ties the two together; it exists so an administrator can see
     * that a given account's traffic is what the filter is removing.
     */
    identities: { type: Mixed, default: [] },
    /** Set when a day exceeded the cap and its ids are a sample, not the set. */
    truncated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const AnalyticsDayIds = model("AnalyticsDayIds", AnalyticsDayIdsSchema);

/* -------------------------------------------------------- People and media */

export { BIO_TYPES };

const BioSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    /*
     * Not an enum: profiles saved under the older three-way split still hold
     * `Author` or `Model`, and validating on read would reject them. They are
     * mapped through `normalizeBioType` wherever the value is used, and rewritten
     * the next time the profile is saved.
     */
    type: { type: String, default: "Person" },
    /*
     * Set on the profile every account carries, empty on a profile created by
     * hand in the admin. It is what keeps a member's name and membership in
     * step with the account behind them.
     */
    userId: { type: String, default: "" },
    /*
     * The levels this member holds, written from the account and never typed.
     * Empty on a profile that belongs to nobody.
     */
    membership: { type: String, default: "" },
    /* What they call themselves, in their own words. Theirs to edit. */
    title: { type: String, default: "" },
    location: { type: String, default: "" },
    description: { type: String, default: "" },
    headshotMediaId: { type: String, default: "" },
    headshotUrl: { type: String, default: "" },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/*
 * One profile per account, enforced here rather than assumed: a stale compiled
 * model once let the link be dropped on write, and nothing above the database
 * noticed until a member had two hundred profiles. Empty and absent `userId`s
 * are outside the index, so profiles created by hand in the admin are unaffected.
 */
BioSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: "string", $gt: "" } },
  }
);

export const Bio = model("Bio", BioSchema);

/**
 * One named link between a member and one or more others.
 *
 * A relationship reads differently from each end — a parent is "Parent of"
 * their children, and the children are "Child of" them — so both wordings are
 * stored. Neither can be derived from the other, which is why the person
 * defining the relationship types both.
 *
 * Stored as one record rather than a pair per link, because the relationship is
 * the thing being named: "Parent of" with three children is one fact about one
 * member, not three facts.
 */
const MemberRelationshipSchema = new Schema<any>(
  {
    /** The account the relationship is stated from. */
    memberId: { type: String, required: true, index: true },
    /** How the others are listed on this member's entry. */
    label: { type: String, required: true },
    /** How this member is listed on each of theirs. */
    reverseLabel: { type: String, default: "" },
    relatedIds: [{ type: String }],
  },
  { timestamps: true }
);

export const MemberRelationship = model(
  "MemberRelationship",
  MemberRelationshipSchema
);

/**
 * A named set of members: a committee, a year group, a working party.
 *
 * Separate from a membership level, which says what somebody may reach, and
 * from a relationship, which says how two people stand to one another. A group
 * says only who is in it.
 */
/**
 * One person's place in one group.
 *
 * The title is what they are *in this group* — chair, treasurer, captain, first
 * violin. Deliberately not their membership level, which says what they may
 * reach across the whole site, and not their profile title, which is theirs and
 * follows them everywhere. The same person can be Chair of one group and an
 * ordinary member of the next.
 */
const GroupMemberSchema = new Schema<any>(
  {
    memberId: { type: String, required: true },
    title: { type: String, default: "" },
  },
  { _id: false }
);

const MemberGroupSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    members: { type: [GroupMemberSchema], default: [] },
    /**
     * Superseded by `members`, which carries a title alongside each id.
     *
     * Kept on the schema so a group saved before titles existed still reads
     * back, and removed from each group the first time it is saved again. Never
     * written.
     */
    memberIds: [{ type: String }],
  },
  { timestamps: true }
);

export const MemberGroup = model("MemberGroup", MemberGroupSchema);

/* ------------------------------------------------------- Member metadata */

/**
 * A set of questions asked of, or kept about, the members holding a role.
 *
 * `managedBy` is the whole distinction. A `member` group is asked of them and
 * answered by them; a `manager` group is kept about them and never shown to
 * them. The access lists below only bear on the second kind — a member always
 * reads and writes their own answers to the first.
 */
const MetadataQuestionSchema = new Schema<any>(
  {
    _id: false,
    /** Minted when the question is first saved; answers are stored by it. */
    id: { type: String, required: true },
    label: { type: String, required: true },
    help: { type: String, default: "" },
    /** short | long | one | many. */
    type: { type: String, default: "short" },
    /** What `one` and `many` offer. Empty for the text types. */
    options: [{ type: String }],
    isRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const MetadataGroupSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    /** `member` — they answer it. `manager` — it is kept about them. */
    managedBy: { type: String, default: "member" },
    /** The membership roles it is asked of, active accounts and inactive alike. */
    roleIds: [{ type: String }],
    questions: { type: [MetadataQuestionSchema], default: [] },
    /*
     * Answered more than once: two emergency contacts, three allergies.
     *
     * The questions are the same each time; only how many times they are asked
     * changes. `maxEntries` is zero for no limit.
     */
    isRepeatable: { type: Boolean, default: false },
    entryLabel: { type: String, default: "" },
    maxEntries: { type: Number, default: 0 },
    /*
     * How the member-data dashboard reads this group.
     *
     * Kept with the questions rather than chosen by whoever opens the
     * dashboard: how a group is usefully read is a property of what it asks —
     * shirt sizes are always a count by size — and it is settled once by the
     * person writing the questions.
     */
    reportGroupBy: { type: String, default: "user" },
    /** Grouping by a question means grouping by its answers, so it names one. */
    reportGroupQuestionId: { type: String, default: "" },
    reportCountBy: { type: String, default: "record" },
    reportCountQuestionId: { type: String, default: "" },
    /** Which number questions are totalled. Empty totals nothing. */
    reportSumIds: [{ type: String }],
    /*
     * Who may read, who may change, and who may see everybody at once.
     *
     * Each is a pair: the management roles that carry it, and the individual
     * accounts named on this group. Reading is implied by editing, and the
     * permission that defines groups carries all three.
     */
    viewRoleIds: [{ type: String }],
    viewUserIds: [{ type: String }],
    editRoleIds: [{ type: String }],
    editUserIds: [{ type: String }],
    reportRoleIds: [{ type: String }],
    reportUserIds: [{ type: String }],
  },
  { timestamps: true }
);

export const MetadataGroup = model("MetadataGroup", MetadataGroupSchema);

/**
 * One member's answers to one group.
 *
 * A document per pair rather than a field on the account: the questions are
 * defined by the site and change, and a member who leaves takes their answers
 * with them without the account schema having to know what was ever asked.
 */
const MetadataAnswerSchema = new Schema<any>(
  {
    userId: { type: String, required: true, index: true },
    groupId: { type: String, required: true, index: true },
    /*
     * One pass through the questions each.
     *
     * A group that does not repeat holds one entry. Answers written before
     * groups could repeat are a bare `values` list, read back as the single
     * entry they always were — see `normalizeEntries`.
     */
    entries: [
      {
        _id: false,
        id: { type: String, default: "" },
        values: [
          {
            _id: false,
            questionId: { type: String, required: true },
            text: { type: String, default: "" },
            choices: [{ type: String }],
          },
        ],
      },
    ],
    /** Who last wrote it: the member themselves, or the manager who did. */
    updatedById: { type: String, default: "" },
  },
  { timestamps: true }
);

// One set of answers per member per group, enforced where it cannot drift.
MetadataAnswerSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export const MetadataAnswer = model("MetadataAnswer", MetadataAnswerSchema);

/* ------------------------------------------------------------ Sponsorships */

/**
 * An organisation or person who gives to a campaign.
 *
 * Everything beyond the name is optional: a sponsor is often entered the day
 * somebody first speaks to them, long before anyone knows their industry or
 * who to ask for.
 */
const SponsorSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    type: { type: String, default: "business" },
    /** Who they are, in the site's own words. */
    description: { type: String, default: "" },
    industry: { type: String, default: "" },
    size: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    website: { type: String, default: "" },
    /** Anything else they are reachable at — social accounts above all. */
    links: [{ _id: false, label: { type: String, default: "" }, href: { type: String, default: "" } }],
    /** Logos cleared for use, so nobody has to ask again before printing one. */
    logos: [
      {
        _id: false,
        label: { type: String, default: "" },
        url: { type: String, default: "" },
        mediaId: { type: String, default: "" },
        /** The one the site shows. At most one per sponsor. */
        isPrimary: { type: Boolean, default: false },
      },
    ],
    contacts: [
      {
        _id: false,
        name: { type: String, default: "" },
        title: { type: String, default: "" },
        email: { type: String, default: "" },
        phone: { type: String, default: "" },
      },
    ],
    notes: { type: String, default: "" },
    /*
     * Nobody is put down as looking after them.
     *
     * Some sponsors are handled by the committee as a whole, or under an
     * arrangement that predates everyone currently on it. Naming a member for
     * those would be wrong rather than merely missing, so the campaigns stop
     * asking.
     */
    isUnassignable: { type: Boolean, default: false },
    /** The tier this sponsor is currently recognised at, if any. */
    recognitionLevelId: { type: String, default: "" },
    /** How this community groups its sponsors. A sponsor can carry several. */
    categoryIds: [{ type: String }],
  },
  { timestamps: true }
);

export const Sponsor = model("Sponsor", SponsorSchema);

/**
 * A tier sponsors are recognised at.
 *
 * Defined by the site rather than fixed by the app, because what the tiers are
 * called — and how many there are — is a decision each community makes.
 */
const RecognitionLevelSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    /** Orders the tiers, highest first. */
    rank: { type: Number, default: 0 },
    /*
     * What a sponsor has to have given to qualify, in whole cents. Zero for a
     * level with no figure attached.
     *
     * A threshold says what the level is worth, not who is at it: a sponsor is
     * still put at a level by hand, because recognition is a decision somebody
     * makes and a sponsor is often held at a level through a quiet year.
     */
    thresholdCents: { type: Number, default: 0 },
    /** What a sponsor at this level receives. */
    benefitIds: [{ type: String }],
    /*
     * A level given quietly: sponsors recognised at it are never named outside
     * the signed-in pages where sponsorships are managed. Some people give on
     * the condition that nobody is told.
     */
    isAnonymous: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const RecognitionLevel = model("RecognitionLevel", RecognitionLevelSchema);

/** A label a site puts on its sponsors, of its own devising. */
const SponsorCategorySchema = new Schema<any>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SponsorCategory = model("SponsorCategory", SponsorCategorySchema);

/** Something a sponsor receives for being recognised at a level. */
const SponsorBenefitSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SponsorBenefit = model("SponsorBenefit", SponsorBenefitSchema);

/** A drive to raise something, over a stretch of time. */
const SponsorshipCampaignSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    /** `active` while it is being worked on, `archived` once it is done.
        Records written before the relabel say `closed`; `campaignStatus` reads
        those as archived. */
    status: { type: String, default: "active" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    /** What the campaign is aiming at, in whole cents. Zero for no target. */
    goalCents: { type: Number, default: 0 },
    /*
     * What the campaign would do with more than it asked for, in order.
     *
     * Each amount is additional — above the goal, and above the tier before it
     * — so a run of them reads as steps rather than as competing totals. The
     * description is the point of the tier: an amount with nothing to spend it
     * on is not a stretch goal, it is a bigger number.
     */
    stretchGoals: [
      {
        _id: false,
        /*
         * Minted when the tier is first saved and kept for its lifetime, so a
         * donation can be applied to one. A position would not do: deleting
         * the first tier would silently move every donation below it up one.
         */
        id: { type: String, default: "" },
        description: { type: String, default: "" },
        amountCents: { type: Number, default: 0 },
        /*
         * A goal of its own rather than one more step above the campaign's.
         *
         * Some things a campaign wants are a separate effort — a bursary
         * fund raised alongside the appeal, not out of it. Money given to one
         * of these is kept out of the campaign's own total, or the appeal
         * would appear to be doing better than it is on money that is spoken
         * for elsewhere.
         */
        isSeparate: { type: Boolean, default: false },
      },
    ],
    /*
     * Who looks after which sponsor, for this campaign only. Held here rather
     * than on the sponsor because the same sponsor can be looked after by
     * different people from one year's campaign to the next.
     */
    assignments: [
      {
        _id: false,
        sponsorId: { type: String, required: true },
        memberIds: [{ type: String }],
        /*
         * Whether the conversation with this sponsor is still being worked,
         * and how it finished when it has: `open`, `closed-no-response`,
         * `closed-declined` or `closed-incomplete`.
         *
         * Not whether they have given, and not the campaign's own status: a
         * sponsor can be closed having given nothing, because they said no.
         * Anything unsaid is open, which is what every assignment made before
         * this existed was; a bare `closed` predates the reasons and reads as
         * declined, which is the word those screens showed for it.
         */
        status: { type: String, default: "open" },
      },
    ],
  },
  { timestamps: true }
);

export const SponsorshipCampaign = model(
  "SponsorshipCampaign",
  SponsorshipCampaignSchema
);

/**
 * One donation, from one sponsor, to one campaign.
 *
 * `valueCents` is what it is worth either way: a monetary donation is the amount,
 * and an in-kind donation is what it stands in for, so a campaign total means the
 * same thing whichever kind it is made of.
 */
const DonationSchema = new Schema<any>(
  {
    campaignId: { type: String, required: true, index: true },
    sponsorId: { type: String, required: true, index: true },
    kind: { type: String, default: "monetary" },
    /** proposed, in-progress, complete, cancelled or never-received. */
    status: { type: String, default: "proposed" },
    date: { type: String, default: "" },
    valueCents: { type: Number, default: 0 },
    description: { type: String, default: "" },
    /*
     * Whether it fills the campaign's goal and earns leaderboard credit.
     *
     * A transfer from another fund, a donation the committee arranged with itself,
     * or money already counted somewhere else is worth recording and would
     * flatter both if it were counted. Everything else is counted, so an
     * existing record and a new one both start true.
     */
    isCounted: { type: Boolean, default: true },
    /*
     * The stretch goal this donation was given for, if it was given for one.
     *
     * An earmark rather than a redirection: the money fills the campaign the
     * same way whatever it is marked for, and this records what the giver
     * meant it to pay for. Empty for a donation to the campaign at large.
     */
    stretchGoalId: { type: String, default: "" },
    /*
     * The same categories a sponsor can be put into, applied to one donation.
     *
     * A sponsor's categories say what kind of organisation they are, which
     * does not change from one donation to the next. These say what kind of
     * donation this was — and the two are not the same question, so a printing
     * firm can give money to one campaign and printing to another without the
     * record having to pretend both were the same sort of thing.
     */
    categoryIds: [{ type: String }],
    /** The members credited with bringing it in. */
    memberIds: [{ type: String }],
  },
  { timestamps: true }
);

export const Donation = model("Donation", DonationSchema);

export const MEDIA_TYPES = ["image", "video", "audio", "file"] as const;
export const MEDIA_PROVIDERS = ["local", "youtube", "vimeo"] as const;
export const MEDIA_USAGE_KINDS = [
  "page",
  "story-feature",
  "story-content",
  "collection",
  "publication",
  "bio-headshot",
  "sponsor-logo",
  "form-content",
  "form-upload",
  "site-logo",
] as const;

export type MediaUsageKind = (typeof MEDIA_USAGE_KINDS)[number];

const MediaUsageSchema = new Schema<any>(
  {
    kind: { type: String, enum: MEDIA_USAGE_KINDS, required: true },
    refId: { type: String, default: "" },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const MediaAssetSchema = new Schema<any>(
  {
    filename: { type: String, default: "" },
    fileName: { type: String, default: "" },
    url: { type: String, default: "" },
    /** Small derivative used by the admin grids; empty when none exists. */
    thumbnailUrl: { type: String, default: "" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    originalName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    title: { type: String, default: "" },
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    captureDate: { type: Date, default: null },
    author: { type: String, default: "" },
    authorBioId: { type: String, default: "" },
    subjectBioId: { type: String, default: "" },
    orientation: { type: String, default: "" },
    isNsfw: { type: Boolean, default: false },
    tags: [{ type: String }],
    mediaType: { type: String, enum: MEDIA_TYPES, default: "image" },
    provider: { type: String, enum: MEDIA_PROVIDERS, default: "local" },
    embedUrl: { type: String, default: "" },
    usage: { type: [MediaUsageSchema], default: [] },
  },
  { timestamps: true }
);

/**
 * The media library is expected to hold thousands of assets, so every filter
 * the admin exposes is backed by an index and applied in the database rather
 * than in the browser.
 */
MediaAssetSchema.index({ createdAt: -1 });
MediaAssetSchema.index({ mediaType: 1, createdAt: -1 });
MediaAssetSchema.index({ "usage.refId": 1 });
MediaAssetSchema.index({ "usage.kind": 1, createdAt: -1 });
// `syncMediaUsage` resolves url-only references back to assets.
MediaAssetSchema.index({ url: 1 });
MediaAssetSchema.index({ tags: 1 });

export const MediaAsset = model("MediaAsset", MediaAssetSchema);

/* --------------------------------------------------- Stories & collections */

/**
 * Who may see one record, in its own right.
 *
 * Menus have always carried this, because a menu is how people find things and
 * restricting the way in has to restrict what it leads to. But content that no
 * menu mentions had nowhere to keep the answer, and so was public by default —
 * which left no way at all to say "members only" about something that is not in
 * the navigation.
 *
 * The two combine in `loadContentAccess`: a record is as restricted as its own
 * rule **and** the way in put together, so adding a public link to a
 * members-only page does not quietly publish it. A record that says nothing —
 * every record that existed before this field — is `public`, which is exactly
 * how it behaved before.
 */
const ContentVisibilitySchema = new Schema<any>(
  {
    mode: { type: String, enum: ["public", "signedIn", "roles"], default: "public" },
    roleIds: { type: [String], default: [] },
  },
  { _id: false }
);

export const STORY_STATUSES = ["draft", "published"] as const;

/**
 * Alt text and captions deliberately live on the `MediaAsset`, not here, so one
 * description follows a file everywhere it is used.
 */
/** Per-document content colour overrides; "" means use the site setting. */
const ColorOverrideSchema = new Schema<any>(
  {
    background: { type: String, default: "" },
    text: { type: String, default: "" },
    accent: { type: String, default: "" },
  },
  { _id: false }
);

const StoryImageSchema = new Schema<any>(
  {
    mediaId: { type: String, default: "" },
    url: { type: String, default: "" },
    size: { type: String, enum: STORY_IMAGE_SIZES, default: "medium" },
    align: { type: String, enum: STORY_IMAGE_ALIGNMENTS, default: "center" },
    /** Which top-level block of the content the image follows; 0 is above it. */
    afterParagraph: { type: Number, default: 0 },
    clickAction: { type: String, enum: MEDIA_CLICK_ACTIONS, default: "none" },
    linkHref: { type: String, default: "" },
    linkNewTab: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const StorySchema = new Schema<any>(
  {
    headline: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    subHeadline: { type: String, default: "" },
    category: { type: String, default: "" },
    location: { type: String, default: "" },
    author: { type: String, default: "" },
    authorBioId: { type: String, default: "" },
    publishDate: { type: Date, default: Date.now },
    status: { type: String, enum: STORY_STATUSES, default: "draft" },

    featureMediaId: { type: String, default: "" },
    featureMediaUrl: { type: String, default: "" },
    featureMediaType: { type: String, default: "image" },
    featureClickAction: { type: String, enum: MEDIA_CLICK_ACTIONS, default: "none" },
    featureLinkHref: { type: String, default: "" },
    featureLinkNewTab: { type: Boolean, default: false },

    // What renders, in what order, and in what type is the template's job.
    templateId: { type: String, default: "" },

    content: { type: String, default: "" },
    storyImages: { type: [StoryImageSchema], default: [] },

    visibility: { type: ContentVisibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Story = model("Story", StorySchema);

const StoryTemplateSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    isDefault: { type: Boolean, default: false },
    layout: { type: [Mixed], default: [] },
    /** Absent means the pre-namespace slot names; see story-template-layout. */
    layoutVersion: { type: Number, default: STORY_TEMPLATE_LAYOUT_VERSION },
    colors: { type: ColorOverrideSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const StoryTemplate = model("StoryTemplate", StoryTemplateSchema);

const GalleryImageSchema = new Schema<any>(
  {
    url: { type: String, default: "" },
    filename: { type: String, default: "" },
    title: { type: String, default: "" },
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    captureDate: { type: Date, default: null },
    tags: [{ type: String }],
    isNsfw: { type: Boolean, default: false },
    orientation: { type: String, default: "" },
  },
  { timestamps: true }
);

export const GalleryImage = model("GalleryImage", GalleryImageSchema);

const CollectionSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    isPublic: { type: Boolean, default: false },

    imageIds: { type: [String], default: [] },
    sortMode: {
      type: String,
      enum: ["createdAt", "captureDate", "originalName", "custom"],
      default: "createdAt",
    },
    sortDirection: { type: String, enum: ["asc", "desc"], default: "desc" },
    customOrder: { type: [String], default: [] },

    // Display / layout. A collection's values are laid over the site defaults,
    // so there is no "use defaults" mode to store.
    // Not an enum: collections saved when `feed` still existed hold it, and
    // validating on read would reject them. `resolveCollectionDisplay` maps
    // anything unrecognised back onto a layout that exists.
    layoutMode: { type: String, default: "grid" },
    displayMode: { type: String, enum: ["all", "lazy", "pagination"], default: "all" },
    pageSize: { type: Number, default: 24 },
    columnsDesktop: { type: Number, default: 3 },
    columnsTablet: { type: Number, default: 2 },
    columnsMobile: { type: Number, default: 1 },
    mosaicSpans: { type: Mixed, default: {} },

    // Metadata placements
    overlaySettings: { type: Mixed, default: {} },
    lightboxSettings: { type: Mixed, default: {} },

    // Sharing / protection. The share control is one copy-link button, so
    // there are no per-network targets to store.
    shareEnabled: { type: Boolean, default: true },
    /** A copy-link button on an opened image, beside its download button. */
    imageShareEnabled: { type: Boolean, default: false },
    /** The collection's name in the corner of an opened image. */
    imageNameEnabled: { type: Boolean, default: false },
    allowDownload: { type: Boolean, default: false },
    allowContextMenu: { type: Boolean, default: false },

    /** Full / wide / standard / narrow, the same scale rows use. */
    pageWidth: { type: String, default: "standard" },
    /** The frame tiles are held to, and how the media meets it. */
    imageAspect: { type: String, default: "1:1" },
    imageFit: { type: String, default: "fill" },

    /** The one image standing for the collection; empty means the first. */
    featureImageId: { type: String, default: "" },

    // Styles
    styleOverrides: { type: Mixed, default: {} },
    /** Category/title/description toggles and their style slots. */
    header: { type: Mixed, default: {} },
    /** Style slot for the copy-link button. */
    share: { type: Mixed, default: {} },
    imageShare: { type: Mixed, default: {} },
    /** Style slots for the page as a whole and for every tile. */
    pageStyle: { type: Mixed, default: {} },
    imageStyle: { type: Mixed, default: {} },
    /** Wording and dress of the link back to the gallery. */
    imageExitLabel: { type: String, default: "View more images" },
    imageExitStyle: { type: Mixed, default: {} },
    /** The box around an opened image and its metadata. */
    imageContentStyle: { type: Mixed, default: {} },

    // Held apart from `isPublic`, which is this kind's published/draft axis.
    // A collection can be finished and live and still be for members only.
    visibility: { type: ContentVisibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Collection = model("Collection", CollectionSchema);

/* ---------------------------------------------------------------- Builders */

const SitePageSchema = new Schema<any>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    isHome: { type: Boolean, default: false },
    layout: { type: [Mixed], default: [] },
    colors: { type: ColorOverrideSchema, default: () => ({}) },

    visibility: { type: ContentVisibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const SitePage = model("SitePage", SitePageSchema);

const FormDefinitionSchema = new Schema<any>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    /**
     * `form` collects answers; `test` marks them.
     *
     * The same record either way — a test reuses the fields, the styles and
     * the submission pipeline whole. What differs is that it carries an answer
     * key, and that its questions live in `test` rather than in `layout`,
     * since a test is a list and not a page.
     */
    kind: { type: String, enum: ["form", "test"], default: "form" },
    layout: { type: [Mixed], default: [] },
    settings: { type: Mixed, default: {} },
    /** Questions, variants, the answer key and how a sitting varies. */
    test: { type: Mixed, default: {} },
    /** Which fields the full entry shows, and in what order. */
    submissionLayout: { type: [Mixed], default: [] },
    /**
     * Which fields appear as columns in the submissions list, in order.
     *
     * Separate from `submissionLayout`: a row has space for two or three
     * answers and the whole entry has space for forty, so what belongs in one
     * is rarely what belongs in the other. Empty means unconfigured, which the
     * list reads as "the first few fields" rather than "none".
     */
    submissionColumns: { type: [Mixed], default: [] },

    visibility: { type: ContentVisibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const FormDefinition = model("FormDefinition", FormDefinitionSchema);

/**
 * What a marked submission scored.
 *
 * Stored rather than recomputed: the key can be edited afterwards, and a grade
 * that silently changes when somebody fixes a typo in an answer is not a
 * record of anything. `sitting` says which paper was given, so a review can
 * still read back the questions that were actually asked.
 */
const TestGradeSchema = new Schema<any>(
  {
    scored: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    right: { type: Number, default: 0 },
    marked: { type: Number, default: 0 },
    questions: { type: [Mixed], default: [] },
  },
  { _id: false }
);

const FormSubmissionSchema = new Schema<any>(
  {
    formId: { type: String, required: true },
    formTitle: { type: String, default: "" },
    data: { type: Mixed, default: {} },
    fields: { type: [Mixed], default: [] },
    status: { type: String, enum: ["new", "read", "archived"], default: "new" },
    /** Set only for a test. Absent on every ordinary submission. */
    grade: { type: TestGradeSchema, default: undefined },
    /** Which question and which variant of it was served, in order. */
    sitting: { type: [Mixed], default: [] },
  },
  { timestamps: true }
);

FormSubmissionSchema.index({ formId: 1, createdAt: -1 });

export const FormSubmission = model("FormSubmission", FormSubmissionSchema);

export const ZINE_KINDS = ["zine", "presentation", "post"] as const;

const ZineSchema = new Schema<any>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    kind: { type: String, enum: ZINE_KINDS, default: "zine" },
    presentationSize: { type: Mixed, default: { width: 1920, height: 1080 } },
    postViews: { type: [Mixed], default: [] },
    /**
     * Which of `postViews` this post is. A post has several named shapes but
     * is published as one of them; without this everything falls back to the
     * first preset, so a post edited as landscape still rendered square.
     */
    postView: { type: String, default: "" },
    /** Named page layouts, each owning the blocks the pages using it show. */
    pageTemplates: { type: [Mixed], default: [] },
    /** A publication kept as a starting point rather than published. */
    isTemplate: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    listed: { type: Boolean, default: true },
    transition: { type: String, enum: ["none", "fade", "slide", "flip"], default: "fade" },
    slideshow: { type: Mixed, default: { enabled: false, intervalMs: 6000, loop: true } },
    audio: { type: Mixed, default: {} },
    pages: { type: [Mixed], default: [] },
    repeatedBlocks: { type: [Mixed], default: [] },
    coverMediaId: { type: String, default: "" },
    coverUrl: { type: String, default: "" },
    publishedAt: { type: Date, default: null },

    visibility: { type: ContentVisibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Zine = model("Zine", ZineSchema);

/* ---------------------------------------------------------- Design library */

const FontFamilySchema = new Schema<any>(
  {
    family: { type: String, required: true, unique: true },
    category: { type: String, default: "sans-serif" },
    variants: { type: [String], default: ["400"] },
    /** The hosted stylesheet, for a Google family. Empty for an uploaded one. */
    cssUrl: { type: String, default: "" },
    /**
     * Uploaded files, one per weight and slant.
     *
     * A family with any of these is served from `@font-face` rules built in
     * `lib/site-fonts.ts` rather than from `cssUrl`; families added before
     * uploads existed have none and are unaffected.
     */
    faces: {
      type: [
        {
          _id: false,
          url: { type: String, default: "" },
          weight: { type: String, default: "400" },
          style: { type: String, default: "normal" },
          format: { type: String, default: "" },
          originalName: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const FontFamily = model("FontFamily", FontFamilySchema);

const CustomStyleSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    style: { type: Mixed, default: {} },
    hoverEnabled: { type: Boolean, default: false },
    hoverStyle: { type: Mixed, default: {} },
    transitionDuration: { type: Number, default: 200 },
  },
  { timestamps: true }
);

export const CustomStyle = model("CustomStyle", CustomStyleSchema);

const CustomShapeSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    viewBox: { type: String, default: "0 0 100 100" },
    paths: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const CustomShape = model("CustomShape", CustomShapeSchema);

/* ----------------------------------------------------------- Documentation */

/**
 * A documentation set: the thing a reader arrives at.
 *
 * Documentation is a *grouping* of documents in an order — a user guide, an API
 * reference — not a loose pile of pages. The set owns the ordering, the
 * navigation and the template; a page belongs to exactly one.
 */
const DocumentationSchema = new Schema<any>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    description: { type: String, default: "" },
    /** Position among the site's sets. */
    order: { type: Number, default: 0 },
    /** Every page in the set renders through this. */
    templateId: { type: String, default: "" },

    visibility: { type: ContentVisibilitySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Documentation = model("Documentation", DocumentationSchema);

/**
 * One document — one page, one markdown file.
 *
 * Named `DocPage` rather than `Document` because Mongoose already owns that
 * word. It is a "document" everywhere a person reads it.
 */
const DocPageSchema = new Schema<any>(
  {
    /** The set this page belongs to. A page outside a set is unreachable. */
    documentationId: { type: String, required: true },

    title: { type: String, required: true },
    /** Unique within its set, not across the site. */
    slug: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    tags: [{ type: String }],

    /**
     * Pages nest inside their set, and the slug stays flat within it — so
     * `/docs/guide/install` never changes when the page is moved.
     */
    parentId: { type: String, default: "" },
    order: { type: Number, default: 0 },

    /** Markdown-shaped blocks; see `lib/doc-layout.ts`. */
    content: { type: [Mixed], default: [] },
    /** Front-matter keys the importer did not claim, kept for export. */
    frontMatter: { type: Mixed, default: {} },
    sourceFilename: { type: String, default: "" },
  },
  { timestamps: true }
);

// A set's tree is always read as "the pages of this set, in order".
DocPageSchema.index({ documentationId: 1, parentId: 1, order: 1 });
// Slugs are unique per set, which is what lets two sets both have an "Overview".
DocPageSchema.index({ documentationId: 1, slug: 1 }, { unique: true });

export const DocPage = model("DocPage", DocPageSchema);

const DocTemplateSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    isDefault: { type: Boolean, default: false },
    layout: { type: [Mixed], default: [] },
    colors: { type: ColorOverrideSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const DocTemplate = model("DocTemplate", DocTemplateSchema);

const CustomPageBlockSchema = new Schema<any>(
  {
    // The name is the block's identity: saving under an existing one replaces it.
    name: { type: String, required: true },
    /** Key into the curated icon set, shown in the builder's block list. */
    icon: { type: String, default: "" },
    // Only container blocks are saved as reusable page blocks.
    block: { type: Mixed, required: true },
  },
  { timestamps: true }
);

export const CustomPageBlock = model("CustomPageBlock", CustomPageBlockSchema);

/* ---------------------------------------------------------------- Calendar */

const CalendarEventSchema = new Schema<any>(
  {
    // A wall-clock date, not an instant — see lib/calendar.ts for why these are
    // `YYYY-MM-DD` / `HH:MM` strings rather than Date fields.
    date: { type: String, required: true },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    name: { type: String, default: "" },
    description: { type: String, default: "" },
    location: { type: String, default: "" },
    linkText: { type: String, default: "" },
    linkUrl: { type: String, default: "" },
    status: { type: String, enum: CALENDAR_EVENT_STATUSES, default: "draft" },
    category: { type: String, default: "" },
    who: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    /** Collects a Yes or No from members, through the RSVP popup. */
    rsvpEnabled: { type: Boolean, default: false },
    /** Lets a manager record who actually turned up. */
    attendanceEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The month view is always a range scan over `date`, then a sort by start time.
CalendarEventSchema.index({ date: 1, startTime: 1 });

export const CalendarEvent = model("CalendarEvent", CalendarEventSchema);

/**
 * One member answer to one event. Yes or No, and nothing else — an RSVP that
 * asked for more would be a form, which the site already has.
 */
const EventRsvpSchema = new Schema<any>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "CalendarEvent", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    response: { type: String, enum: RSVP_RESPONSES, required: true },
  },
  { timestamps: true }
);

// One answer per member per event; changing your mind updates it in place.
EventRsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });

export const EventRsvp = model("EventRsvp", EventRsvpSchema);

/**
 * Who actually turned up, as recorded by someone holding the permission.
 *
 * Separate from the RSVP: saying yes and being there are different facts, and a
 * community that tracks attendance needs to see where they disagree.
 */
const EventAttendanceSchema = new Schema<any>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "CalendarEvent", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    present: { type: Boolean, default: false },
    /** Who last changed it, so a disputed record has an author. */
    recordedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    recordedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

EventAttendanceSchema.index({ eventId: 1, userId: 1 }, { unique: true });

export const EventAttendance = model("EventAttendance", EventAttendanceSchema);

const CalendarSettingsSchema = new Schema<any>(
  {
    /**
     * The IANA zone the stored wall-clock times are expressed in. Empty means
     * "whatever the server runs in"; it changes how today is resolved, not the
     * stored strings.
     */
    timeZone: { type: String, default: "" },
    /** Managed vocabularies the event form picks from. */
    categories: { type: [String], default: [] },
    who: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    /** The Calendar Style a block wears when it names none. */
    defaultStyleId: { type: String, default: "" },
    /**
     * The Calendar Style the admin screen wears.
     *
     * Its own setting rather than the site default: the management screen is
     * read to work on the events, not to admire them, and a style built for a
     * dark public page can make a working grid hard to read. Empty keeps the
     * plain admin look it has always had.
     */
    adminStyleId: { type: String, default: "" },
    /**
     * The site's own calendar page at `/calendar` — whether it exists, what it
     * says, and how it displays. Mixed and normalized on read, the same way a
     * page block stores its display.
     */
    page: { type: Mixed, default: {} },
  },
  { timestamps: true }
);

export const CalendarSettings = model("CalendarSettings", CalendarSettingsSchema);

const CalendarTemplateSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    /** `event` arranges an event box; `lightbox` arranges the detail panel. */
    kind: { type: String, enum: CALENDAR_TEMPLATE_KINDS, default: "event" },
    /** A page layout whose calendar slots are filled from the event. */
    layout: { type: [Mixed], default: [] },
  },
  { timestamps: true }
);

export const CalendarTemplate = model("CalendarTemplate", CalendarTemplateSchema);

const CalendarStyleSchema = new Schema<any>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    /**
     * One style per box of the calendar, plus the event box and lightbox, whose
     * contents and appearance both vary by view and screen size. Mixed because
     * the shape is normalized in `lib/calendar-style.ts` rather than here.
     */
    parts: { type: Mixed, default: {} },
    eventBox: { type: Mixed, default: {} },
    lightbox: { type: Mixed, default: {} },
  },
  { timestamps: true }
);

export const CalendarStyle = model("CalendarStyle", CalendarStyleSchema);
