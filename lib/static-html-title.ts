import { defaultTreeAdapter, parse } from "parse5";

/** Parse as HTML so entities decode and title-like text inside scripts/comments is ignored. */
export function staticHtmlTitle(html: string, fallback: string): string {
  const document = parse(html);
  const root = document.childNodes.find(node => defaultTreeAdapter.isElementNode(node) && node.tagName === "html");
  if (!root || !defaultTreeAdapter.isElementNode(root)) return fallback;
  const head = root.childNodes.find(node => defaultTreeAdapter.isElementNode(node) && node.tagName === "head");
  if (!head || !defaultTreeAdapter.isElementNode(head)) return fallback;
  const title = head.childNodes.find(node => defaultTreeAdapter.isElementNode(node) && node.tagName === "title");
  if (!title || !defaultTreeAdapter.isElementNode(title)) return fallback;
  return title.childNodes.filter(defaultTreeAdapter.isTextNode).map(node => node.value).join("")
    .replace(/[\t\n\f\r ]+/g, " ").trim() || fallback;
}
