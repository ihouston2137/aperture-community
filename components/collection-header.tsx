import {
  styleSlotProps,
  type CollectionHeader as HeaderSettings,
} from "@/lib/display-templates";

/**
 * The category, title and description above a collection's gallery.
 *
 * Shared by the public page and the editor preview so what an editor arranges
 * is literally what a reader gets. Each part is independently switchable and
 * carries its own style slot from the central style editor.
 */
export function CollectionHeader({
  header,
  category,
  name,
  description,
}: {
  header: HeaderSettings;
  category: string;
  name: string;
  description: string;
}) {
  const parts = [
    header.showCategory && category
      ? { key: "category", tag: "p" as const, slot: header.category, value: category }
      : null,
    header.showTitle && name
      ? { key: "title", tag: "h1" as const, slot: header.title, value: name }
      : null,
    header.showDescription && description
      ? { key: "description", tag: "p" as const, slot: header.description, value: description }
      : null,
  ].filter((part) => part !== null);

  if (parts.length === 0) return null;

  return (
    <header className="collection-header">
      {parts.map((part) => {
        const styled = styleSlotProps(part.slot);
        const Tag = part.tag;
        return (
          <Tag
            key={part.key}
            data-collection-header={part.key}
            className={styled.className || undefined}
            style={styled.style}
          >
            {part.value}
          </Tag>
        );
      })}
    </header>
  );
}
