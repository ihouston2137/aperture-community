"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { isMenuGroup, type MenuBlockLayout, type MenuItem } from "@/lib/menu-types";
import type { PageBlock } from "@/lib/page-layout";

import { styleSlotProps } from "./block-primitives";

/**
 * A named menu placed on a page.
 *
 * The items arrive already resolved and already filtered to what the viewer may
 * see — the block never decides that, so a restricted link is not in the markup
 * to be found. What it decides is the shape: an open list, or a button that
 * drops one down.
 */
export function MenuBlockView({
  block,
  items,
  interactive = true,
}: {
  block: PageBlock;
  /** Empty when no menu is chosen, or when nothing in it is visible. */
  items: MenuItem[];
  interactive?: boolean;
}) {
  const layout: MenuBlockLayout = block.menuLayout === "dropdown" ? "dropdown" : "list";
  const direction = block.menuDirection === "horizontal" ? "horizontal" : "vertical";

  const listStyle = styleSlotProps(block, "listStyle");
  const linkStyle = styleSlotProps(block, "linkStyle");
  const buttonStyle = styleSlotProps(block, "buttonStyle");

  if (items.length === 0) {
    // On the canvas the block has to occupy space to be placed and styled; on a
    // page an empty menu is nothing at all.
    return interactive ? null : (
      <span className="pb-menu-empty">Menu</span>
    );
  }

  const body = (
    <ul
      className={`pb-menu-list ${listStyle.className}`.trim()}
      style={listStyle.style}
      data-direction={direction}
    >
      {items.map((item) => (
        <li key={item.id} className="pb-menu-item">
          {isMenuGroup(item) ? (
            <>
              <span className="pb-menu-group-label">{item.label}</span>
              <ul className="pb-menu-sublist">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <MenuLink item={child} className={linkStyle.className} style={linkStyle.style} interactive={interactive} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <MenuLink item={item} className={linkStyle.className} style={linkStyle.style} interactive={interactive} />
          )}
        </li>
      ))}
    </ul>
  );

  if (layout === "list") return <div className="pb-menu">{body}</div>;

  return (
    <MenuDropdown
      label={block.menuButtonText || "Menu"}
      className={buttonStyle.className}
      style={buttonStyle.style}
      interactive={interactive}
    >
      {body}
    </MenuDropdown>
  );
}

function MenuLink({
  item,
  className,
  style,
  interactive,
}: {
  item: MenuItem;
  className: string;
  style: React.CSSProperties | undefined;
  interactive: boolean;
}) {
  const props = {
    className: `pb-menu-link ${className}`.trim(),
    style,
    target: item.newTab ? "_blank" : undefined,
    rel: item.newTab ? "noreferrer" : undefined,
  };

  // The builder canvas must not navigate away from itself.
  if (!interactive) return <span {...props}>{item.label}</span>;

  return (
    <Link href={item.href || "/"} {...props}>
      {item.label}
    </Link>
  );
}

function MenuDropdown({
  label,
  className,
  style,
  interactive,
  children,
}: {
  label: string;
  className: string;
  style: React.CSSProperties | undefined;
  interactive: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="pb-menu is-dropdown" ref={root} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className={`pb-menu-button ${className}`.trim()}
        style={style}
        aria-expanded={open}
        onClick={() => interactive && setOpen((current) => !current)}
      >
        {label}
        <span className="pb-menu-caret" aria-hidden="true" />
      </button>

      {/* Kept mounted and hidden rather than unmounted, so the links inside stay
          reachable to assistive tech and to in-page search. */}
      <div className="pb-menu-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
