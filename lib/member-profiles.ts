import { createHash } from "node:crypto";

import { connectDB } from "./db";
import { getRoleSummaries, sortRoles, type RoleSummary } from "./members";
import { clearMediaUsage } from "./media-usage-sync";
import { Bio, MediaAsset, Story, User } from "./models";
import { slugify, uniqueSlug } from "./slug";

/**
 * The profile every account on the site carries.
 *
 * Its name and membership are derived, not typed: the name is the member's
 * first name and last initial, the membership is the levels they hold. Both
 * are rewritten whenever the account behind them changes, so a level granted
 * in the admin shows on the profile without anyone retyping it. Title,
 * location, description and headshot are the member's own and are never
 * touched here.
 */

/** "Ian Houston" becomes "Ian H" — a name to be known by, not a full record. */
export function memberProfileName(user: {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
}): string {
  const first = (user.firstName ?? "").trim();
  const initial = (user.lastName ?? "").trim().slice(0, 1).toUpperCase();

  if (first && initial) return `${first} ${initial}`;
  if (first) return first;

  // An account named before first and last names existed, or one with only an
  // address to go on.
  const fallback = (user.name ?? "").trim();
  if (fallback) return fallback;

  // `name` is required on the profile, so this can never come back empty.
  return (user.email ?? "").split("@")[0]?.trim() || "Member";
}

/**
 * The account, reduced to five characters that mean nothing on their own.
 *
 * It makes the slug unique without the surname being in the URL: two members
 * called Ian H get different addresses, and neither address says who they are.
 *
 * Deliberately hashed from the account id rather than the email address. Both
 * are unique to the person and equally opaque once hashed, but an address can
 * change — and a slug that moved every time somebody switched email would break
 * every link to their profile.
 */
function accountHash(userId: string): string {
  return createHash("sha256").update(String(userId)).digest("hex").slice(0, 5);
}

/** `ian-h-3f9ac`: the name they go by, then the part that keeps it unique. */
export function memberProfileSlug(user: {
  _id?: unknown;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
}): string {
  const first = slugify((user.firstName ?? "").trim()) || slugify(memberProfileName(user));
  const initial = slugify((user.lastName ?? "").trim().slice(0, 1));
  const hash = accountHash(String(user._id ?? ""));

  return [first || "member", initial, hash].filter(Boolean).join("-");
}

/** The levels they hold, in the order the admin shows them. */
export function memberProfileMembership(
  roleIds: string[],
  roles: RoleSummary[]
): string {
  const held = roles.filter(
    (role) => role.kind === "community" && roleIds.includes(role._id)
  );
  return sortRoles(held)
    .map((role) => role.name)
    .join(", ");
}

/**
 * Whether this account is one that must never carry a member profile.
 *
 * The seed account and nothing else. It is the installer's way in — it belongs
 * to whoever set the site up rather than to a person in the community, and a
 * profile for it would put "Site Administrator" in the directory.
 *
 * Holding the Administrator role is not enough. The people who run a community
 * are usually in it: a chair who administers the site still has a photograph, a
 * biography and a place in the directory, and taking their profile away because
 * of what they are allowed to edit was the wrong reading of what the role says.
 */
async function isExcludedAccount(user: any): Promise<boolean> {
  const seedEmail = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(
    seedEmail && String(user.email ?? "").trim().toLowerCase() === seedEmail
  );
}

/**
 * Creates the profile for one account if it has none, and brings its derived
 * fields up to date either way. Safe to call whenever an account changes.
 *
 * The seed account is staff rather than a member, so one is never created for
 * it — but if somebody has deliberately given it a profile it is kept in step
 * like any other.
 */
export async function syncMemberProfile(userId: string): Promise<void> {
  if (!userId) return;
  await connectDB();

  const user = await User.findById(userId).lean<any>();
  if (!user) return;

  const roles = await getRoleSummaries();
  const name = memberProfileName(user);
  const membership = memberProfileMembership(
    (user.roleIds ?? []).map(String),
    roles
  );
  const desired = memberProfileSlug(user);

  const existing = await Bio.findOne({ userId: String(user._id) });
  if (existing) {
    // Only the derived fields. What the member wrote about themselves stays.
    existing.name = name;
    existing.type = "Member";
    // Membership used to be held in `title`, before a title of their own
    // existed. A title that still reads as the derived value was never typed
    // by anybody, so it is cleared rather than left looking like a job.
    if (existing.title && existing.title === existing.membership) {
      existing.title = "";
    }
    if (!existing.membership && existing.title === membership) {
      existing.title = "";
    }
    existing.membership = membership;
    if (existing.slug !== desired) {
      existing.slug = await uniqueSlug(Bio, desired, "member", String(existing._id));
    }
    await existing.save();
    return;
  }

  if (await isExcludedAccount(user)) return;

  await Bio.create({
    userId: String(user._id),
    name,
    slug: await uniqueSlug(Bio, desired, "member"),
    type: "Member",
    membership,
    title: "",
    location: "",
    description: "",
    headshotMediaId: "",
    headshotUrl: "",
    isPrimary: false,
  });
}

/* --------------------------------------------------------------- Cleaning up

   Two rules about the data itself, enforced rather than assumed: a member has
   exactly one profile, and the account the site was seeded with has none. */

/** Everything on the site that credits a profile. */
async function referencedBioIds(bioIds: string[]): Promise<Set<string>> {
  if (bioIds.length === 0) return new Set();

  const [media, stories] = await Promise.all([
    MediaAsset.find({
      $or: [{ authorBioId: { $in: bioIds } }, { subjectBioId: { $in: bioIds } }],
    })
      .select("authorBioId subjectBioId")
      .lean<any[]>(),
    Story.find({ authorBioId: { $in: bioIds } })
      .select("authorBioId")
      .lean<any[]>(),
  ]);

  const used = new Set<string>();
  for (const asset of media) {
    if (asset.authorBioId) used.add(String(asset.authorBioId));
    if (asset.subjectBioId) used.add(String(asset.subjectBioId));
  }
  for (const story of stories) {
    if (story.authorBioId) used.add(String(story.authorBioId));
  }
  return used;
}

/** Moves every credit from the discarded profiles onto the one being kept. */
async function repointCredits(fromIds: string[], toId: string): Promise<void> {
  if (fromIds.length === 0) return;

  await Promise.all([
    MediaAsset.updateMany(
      { authorBioId: { $in: fromIds } },
      { $set: { authorBioId: toId } }
    ),
    MediaAsset.updateMany(
      { subjectBioId: { $in: fromIds } },
      { $set: { subjectBioId: toId } }
    ),
    Story.updateMany(
      { authorBioId: { $in: fromIds } },
      { $set: { authorBioId: toId } }
    ),
  ]);
}

/** Whether a member has put anything of their own on a profile. */
function hasOwnContent(bio: any): boolean {
  return Boolean(
    bio.headshotUrl ||
      bio.headshotMediaId ||
      String(bio.location ?? "").trim() ||
      String(bio.description ?? "").trim()
  );
}

/**
 * Fills the keeper's empty fields from the copies being discarded, oldest
 * first. Anything already on the keeper wins — this only rescues what would
 * otherwise be deleted.
 */
function carryOwnContent(
  keeper: any,
  losers: any[]
): Record<string, string> | null {
  const carried: Record<string, string> = {};

  const text = (value: unknown) => String(value ?? "").trim();
  if (!text(keeper.location)) {
    const found = losers.find((bio) => text(bio.location));
    if (found) carried.location = text(found.location);
  }
  if (!text(keeper.description)) {
    const found = losers.find((bio) => text(bio.description));
    if (found) carried.description = text(found.description);
  }
  if (!keeper.headshotUrl && !keeper.headshotMediaId) {
    const found = losers.find((bio) => bio.headshotUrl || bio.headshotMediaId);
    if (found) {
      carried.headshotUrl = String(found.headshotUrl ?? "");
      carried.headshotMediaId = String(found.headshotMediaId ?? "");
    }
  }

  return Object.keys(carried).length > 0 ? carried : null;
}

/**
 * Puts the one-profile-per-account rule into the database itself.
 *
 * The collection carried a plain `userId_1` index before the rule existed, and
 * MongoDB will not redefine an index in place — so the old one is dropped and
 * rebuilt unique. Only ever called after duplicates have been merged, since the
 * build fails while any remain.
 */
async function ensureUniqueAccountIndex(): Promise<void> {
  try {
    const indexes = await Bio.collection.indexes();
    const current = indexes.find((index) => index.name === "userId_1");
    if (current?.unique) return;

    if (current) await Bio.collection.dropIndex("userId_1");
    await Bio.collection.createIndex(
      { userId: 1 },
      {
        name: "userId_1",
        unique: true,
        partialFilterExpression: { userId: { $type: "string", $gt: "" } },
      }
    );
  } catch (error) {
    // Worth knowing about, but not worth failing the page that triggered it.
    console.error("Could not enforce one profile per account:", error);
  }
}

/** The accounts that must never carry a member profile. */
async function excludedUserIds(): Promise<Set<string>> {
  // The seed account alone — see `isExcludedAccount`. An administrator who is
  // also a member of the community keeps their profile like anybody else.
  const seedEmail = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!seedEmail) return new Set();

  const users = await User.find({ email: seedEmail }).select("_id").lean<any[]>();
  return new Set(users.map((user) => String(user._id)));
}

/**
 * Reduces the profile data to what it is supposed to be.
 *
 * Duplicates are merged rather than dropped: whatever credited a discarded
 * profile is moved onto the one kept, so no story or photograph loses its
 * author. An administrator's profile is deleted outright unless something
 * credits it, in which case it is unlinked from the account and left as an
 * ordinary person — the credit is somebody's work and is not the site's to
 * erase.
 */
export async function pruneMemberProfiles(): Promise<{
  merged: number;
  unlinked: number;
  removed: number;
  orphaned: number;
}> {
  await connectDB();

  const outcome = { merged: 0, unlinked: 0, removed: 0, orphaned: 0 };

  // A member profile with no account behind it cannot be matched to anyone or
  // kept in sync, so it is not a member profile at all. One credited by a story
  // or a photograph becomes an ordinary person and keeps the credit; the rest
  // go.
  const orphans = await Bio.find({
    type: "Member",
    $or: [{ userId: { $exists: false } }, { userId: { $in: ["", null] } }],
  })
    .select("_id")
    .lean<any[]>();

  if (orphans.length > 0) {
    const orphanIds = orphans.map((bio) => String(bio._id));
    const creditedOrphans = await referencedBioIds(orphanIds);

    const disposable = orphanIds.filter((id) => !creditedOrphans.has(id));
    for (const id of disposable) await clearMediaUsage(id);
    if (disposable.length > 0) {
      await Bio.deleteMany({ _id: { $in: disposable } });
    }
    if (creditedOrphans.size > 0) {
      await Bio.updateMany(
        { _id: { $in: [...creditedOrphans] } },
        { $set: { type: "Person", userId: "" } }
      );
    }

    outcome.orphaned = disposable.length;
    outcome.unlinked += creditedOrphans.size;
  }

  const bios = await Bio.find({ userId: { $nin: ["", null] } })
    .sort({ createdAt: 1 })
    .lean<any[]>();

  if (bios.length === 0) return outcome;

  const referenced = await referencedBioIds(bios.map((bio) => String(bio._id)));

  const groups = new Map<string, any[]>();
  for (const bio of bios) {
    const key = String(bio.userId);
    const group = groups.get(key);
    if (group) group.push(bio);
    else groups.set(key, [bio]);
  }

  // One profile per member. Oldest first already, so an equal pair keeps the
  // original.
  const survivors: any[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      survivors.push(group[0]);
      continue;
    }

    const keeper = [...group].sort(
      (a, b) =>
        Number(referenced.has(String(b._id))) - Number(referenced.has(String(a._id))) ||
        Number(hasOwnContent(b)) - Number(hasOwnContent(a))
    )[0];

    const losers = group.filter((bio) => String(bio._id) !== String(keeper._id));

    // Credits move to the survivor, and so does anything the member wrote on a
    // copy that is about to go: a duplicate is an accident of the data, not a
    // reason to lose what somebody typed.
    const carried = carryOwnContent(keeper, losers);
    if (carried) await Bio.findByIdAndUpdate(keeper._id, carried);

    await repointCredits(
      losers.map((bio) => String(bio._id)),
      String(keeper._id)
    );
    for (const loser of losers) await clearMediaUsage(String(loser._id));
    await Bio.deleteMany({ _id: { $in: losers.map((bio) => bio._id) } });

    outcome.merged += losers.length;
    survivors.push(keeper);
  }

  // The seed account carries none.
  const excluded = await excludedUserIds();
  for (const bio of survivors) {
    if (!excluded.has(String(bio.userId))) continue;

    if (referenced.has(String(bio._id))) {
      await Bio.findByIdAndUpdate(bio._id, { userId: "", type: "Person" });
      outcome.unlinked += 1;
    } else {
      await clearMediaUsage(String(bio._id));
      await Bio.findByIdAndDelete(bio._id);
      outcome.removed += 1;
    }
  }

  await ensureUniqueAccountIndex();
  return outcome;
}

/**
 * Brings every account's profile into line in one pass: creates the missing
 * ones, and rewrites the derived fields of the ones that have drifted.
 *
 * The seed account gets none. Written as three reads and a write per
 * profile that actually changed, rather than a sync per account, so opening the
 * profiles screen on a site with hundreds of members stays cheap.
 */
export async function ensureMemberProfiles(): Promise<void> {
  await connectDB();
  // Nothing below can put the data right if a member already has two profiles.
  await pruneMemberProfiles();

  const [users, bios, roles, excluded] = await Promise.all([
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email roleIds")
      .lean<any[]>(),
    Bio.find({ userId: { $nin: ["", null] } }).lean<any[]>(),
    getRoleSummaries(),
    excludedUserIds(),
  ]);

  const byUser = new Map(bios.map((bio) => [String(bio.userId), bio]));
  const takenSlugs = new Set(
    (await Bio.find().select("slug").lean<any[]>()).map((bio) => String(bio.slug))
  );

  for (const user of users) {
    const id = String(user._id);
    const roleIds = (user.roleIds ?? []).map(String);
    const existing = byUser.get(id);

    if (excluded.has(id)) continue;

    const name = memberProfileName(user);
    const membership = memberProfileMembership(roleIds, roles);
    let slug = memberProfileSlug(user);

    if (existing) {
      // A title still reading as the derived membership predates members
      // having a title of their own, so it is cleared on the way past.
      const strayTitle =
        Boolean(existing.title) &&
        (existing.title === existing.membership ||
          (!existing.membership && existing.title === membership));

      const stale =
        existing.name !== name ||
        existing.membership !== membership ||
        strayTitle ||
        existing.type !== "Member" ||
        existing.slug !== slug;
      if (!stale) continue;

      // Somebody else already holds the address this one wants.
      if (existing.slug !== slug && takenSlugs.has(slug)) slug = existing.slug;
      takenSlugs.delete(String(existing.slug));
      takenSlugs.add(slug);

      await Bio.findByIdAndUpdate(existing._id, {
        name,
        membership,
        type: "Member",
        slug,
        ...(strayTitle ? { title: "" } : {}),
      });
      continue;
    }

    if (takenSlugs.has(slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    takenSlugs.add(slug);

    await Bio.create({
      userId: id,
      name,
      slug,
      type: "Member",
      membership,
      title: "",
      location: "",
      description: "",
      headshotMediaId: "",
      headshotUrl: "",
      isPrimary: false,
    });
  }
}

/**
 * The profile belonging to one account, created on the spot if there is none.
 *
 * Comes back `null` for an Administrator with no profile, which is what the
 * dashboard reads to decide whether there is anything to edit.
 */
export async function getMemberProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  await connectDB();

  let bio = await Bio.findOne({ userId }).lean<any>();
  if (!bio) {
    await syncMemberProfile(userId);
    bio = await Bio.findOne({ userId }).lean<any>();
  }
  return bio;
}
