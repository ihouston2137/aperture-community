import { answerText, isAnswered, normalizeEntries, type MetadataEntry, type MetadataGroupSummary } from "./metadata-types";

export function metadataDashboardSummary(group: MetadataGroupSummary, savedEntries: MetadataEntry[]) {
  const entries = normalizeEntries(savedEntries, group);
  const rows = entries.length ? entries : [{ id: "empty", values: [] }];
  const items = rows.flatMap((entry, index) => group.questions.map(field => ({
    id: `${entry.id}:${field.id}`,
    label: field.label,
    entryLabel: group.isRepeatable ? `${group.entryLabel || "Entry"} ${index + 1}` : "",
    complete: isAnswered(field, entry.values),
    value: answerText(field, entry.values),
  })));
  const complete = items.filter(item => item.complete).length;
  const total = items.length;
  return {
    complete,
    total,
    percent: total ? Math.round(complete / total * 100) : 0,
    items: items.filter(item => group.dashboardItems === "all"
      || (group.dashboardItems === "complete" && item.complete)
      || (group.dashboardItems === "incomplete" && !item.complete)),
  };
}
