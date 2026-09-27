import { normalizeMemberGroupBlock, type MemberGroupBlockSettings, type MemberGroupView } from "@/lib/member-group-block";
import { protectedMediaUrl } from "@/lib/protected-media-url";

export function MemberGroupBlock({ settings, group, interactive }: {
  settings?: MemberGroupBlockSettings;
  group?: MemberGroupView;
  interactive: boolean;
}) {
  const display = normalizeMemberGroupBlock(settings);
  if (!group) return interactive ? null : <div className="pb-empty-drop">Select a member group</div>;
  if (!group.members.length) return interactive ? null : <div className="pb-empty-drop">This group has no active members.</div>;
  return <ul className={`pb-member-group is-${display.layout}`} aria-label={group.name}>
    {group.members.map(member => <li key={member.id} className="pb-member-group-person">
      {display.showHeadshot && (member.headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pb-member-group-headshot" src={protectedMediaUrl(member.headshotUrl)} alt="" loading="lazy" width={96} height={96} />
      ) : <span className="pb-member-group-headshot is-placeholder" aria-hidden="true">{member.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>)}
      <div className="pb-member-group-details">
        <strong className="pb-member-group-name">{member.name}</strong>
        {display.showRole && member.role && <span className="pb-member-group-role">{member.role}</span>}
      </div>
    </li>)}
  </ul>;
}
