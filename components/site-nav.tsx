"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

import type { GroupDisplay } from "@/lib/menu-types";

/**
 * Client behaviour for the header navigation: the mobile hamburger panel and
 * the dropdown menus.
 *
 * Both take their content as `children`, so the real chrome can pass
 * `next/link` anchors from a server component and the admin preview can pass
 * inert ones. One set of markup and classes serves both.
 */

/**
 * True while the hamburger panel is open, which only happens at mobile widths.
 * The dropdowns inside behave differently there: they expand in place rather
 * than floating, so they are not dismissed by clicking elsewhere.
 */
const MobilePanelContext = createContext(false);

export function SiteNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const navId = useId();
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /**
   * Publishes the header's height so the mobile panel can sit directly beneath
   * it and still reach the bottom of the screen. Measured rather than assumed
   * because the height moves with the logo size, padding and nav font.
   */
  useEffect(() => {
    const header = nav.current?.closest(".site-header");
    if (!(header instanceof HTMLElement)) return;

    const apply = () =>
      header.style.setProperty("--site-header-height", `${header.offsetHeight}px`);

    apply();
    // The panel is out of flow, so resizing it cannot feed back into this.
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Hidden above the mobile breakpoint, where the links show in full. */}
      <button
        type="button"
        className="site-nav-toggle"
        aria-expanded={open}
        aria-controls={navId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="site-nav-burger" aria-hidden="true" />
      </button>

      <nav
        id={navId}
        ref={nav}
        className="site-nav"
        data-open={open ? "true" : "false"}
        // Following a link closes the panel. Opening a dropdown inside it must
        // not, so only anchors count.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <MobilePanelContext value={open}>{children}</MobilePanelContext>
      </nav>
    </>
  );
}

/**
 * A group inside a dropdown.
 *
 * Two shapes, chosen by the author. A heading keeps everything on screen at
 * once; a flyout gives the group its own panel and keeps the parent short.
 *
 * The flyout opens on a press rather than on hover, like the dropdown above
 * it. Hover would mean steering a pointer down a corridor without leaving it,
 * which is the part of deep menus everybody hates, and it would mean nothing
 * at all on a phone.
 *
 * Inside the hamburger panel it is always a heading whatever was chosen: there
 * is no room to fly out to and nothing to fly out over.
 */
export function SiteNavSubmenu({
  label,
  display,
  showCaret = true,
  children,
}: {
  label: string;
  display: GroupDisplay;
  showCaret?: boolean;
  children: React.ReactNode;
}) {
  const inPanel = useContext(MobilePanelContext);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const asHeading = display === "inline" || inPanel;

  useEffect(() => {
    if (asHeading || !open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [asHeading, open]);

  if (asHeading) {
    return (
      <div className="site-nav-section">
        <span className="site-nav-section-label">{label}</span>
        <div className="site-nav-section-items">{children}</div>
      </div>
    );
  }

  return (
    <div className="site-nav-flyout" ref={root} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="site-nav-flyout-label"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        {showCaret ? <span className="site-nav-flyout-caret" aria-hidden="true" /> : null}
      </button>
      <div className="site-nav-panel site-nav-flyout-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export function SiteNavMenu({
  label,
  showCaret = true,
  children,
}: {
  label: string;
  showCaret?: boolean;
  children: React.ReactNode;
}) {
  const inPanel = useContext(MobilePanelContext);

  // Closed until asked for: as a layer floating over the page, a dropdown opens
  // when its label is clicked and not before.
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // The hamburger panel is the exception. There the dropdowns are inline, part
  // of the menu rather than over it, so they open with the panel and close with
  // it. Adjusted during render rather than in an effect, so there is no flash of
  // the wrong state.
  const [panelWas, setPanelWas] = useState(inPanel);
  if (inPanel !== panelWas) {
    setPanelWas(inPanel);
    setOpen(inPanel);
  }

  useEffect(() => {
    // Inside the panel a dropdown is inline, not a layer over the page, so
    // clicking elsewhere is not a dismissal.
    if (!open || inPanel) return;

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
  }, [open, inPanel]);

  return (
    <div className="site-nav-menu" ref={root} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="site-nav-label"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        {showCaret ? <span className="site-nav-caret" aria-hidden="true" /> : null}
      </button>

      {/* Kept mounted and hidden rather than unmounted, so a link inside stays
          reachable to assistive tech and to in-page search. */}
      <div className="site-nav-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
