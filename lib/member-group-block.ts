export type MemberGroupBlockSettings = {
  groupId: string;
  layout: "cards" | "list";
  showRole: boolean;
  showHeadshot: boolean;
};

export function normalizeMemberGroupBlock(value: unknown): MemberGroupBlockSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    groupId: typeof raw.groupId === "string" ? raw.groupId.trim() : "",
    layout: raw.layout === "list" ? "list" : "cards",
    showRole: raw.showRole !== false,
    showHeadshot: raw.showHeadshot !== false,
  };
}

export type MemberGroupView = {
  id: string;
  name: string;
  members: { id: string; name: string; role: string; headshotUrl: string }[];
};
