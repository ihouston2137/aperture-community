import { connectDB } from "./db";
import { toGroupSummary } from "./member-group-types";
import type { MemberGroupView } from "./member-group-block";
import { memberProfileName } from "./member-profiles";
import { Bio, MemberGroup, User } from "./models";

/** Only the profile display name, group role and headshot leave the server. */
export async function loadMemberGroupViews(ids?: string[]): Promise<Record<string, MemberGroupView>> {
  if (ids && ids.length === 0) return {};
  await connectDB();
  const filter = ids ? { _id: { $in: ids.filter(id => /^[a-f\d]{24}$/i.test(id)) } } : {};
  const records = await MemberGroup.find(filter).sort({ name: 1 }).lean();
  const groups = records.map(toGroupSummary);
  const memberIds = [...new Set(groups.flatMap(group => group.memberIds))].filter(id => /^[a-f\d]{24}$/i.test(id));
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: memberIds }, isActive: { $ne: false }, membershipStatus: "active" })
      .select("firstName lastName name").lean<{ _id: unknown; firstName?: string; lastName?: string; name?: string }[]>(),
    Bio.find({ userId: { $in: memberIds } }).select("userId name headshotUrl")
      .lean<{ userId: string; name?: string; headshotUrl?: string }[]>(),
  ]);
  const byUser = new Map(users.map(user => [String(user._id), user]));
  const byProfile = new Map(profiles.map(profile => [String(profile.userId), profile]));
  return Object.fromEntries(groups.map(group => [group._id, {
    id: group._id,
    name: group.name,
    members: group.members.flatMap(member => {
      const user = byUser.get(member.memberId);
      if (!user) return [];
      const profile = byProfile.get(member.memberId);
      return [{ id: member.memberId, name: profile?.name || memberProfileName(user), role: member.title, headshotUrl: profile?.headshotUrl || "" }];
    }),
  }]));
}
