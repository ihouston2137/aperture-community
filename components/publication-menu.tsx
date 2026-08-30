"use client";

import { useEffect, useState } from "react";

import { downloadPublicationPdf } from "./publication-export";

/**
 * The right-click menu over a published publication.
 *
 * A publication read on the site is a thing being *watched* rather than a page
 * being browsed, and the three things somebody wants of it — fill the screen,
 * put the chrome away, take a copy — have nowhere else to live: a toolbar
 * would sit on top of the very thing it is meant to leave alone.
 *
 * The menu is opened from a listener on the viewer rather than from a
 * transparent sheet laid over the pages. A sheet that could catch a right-click
 * would also catch every left-click, and a publication's blocks can be links —
 * so the press is caught as it bubbles up instead, which reaches a right-click
 * anywhere over the publication, images included, and lets an ordinary click
 * through untouched. While the menu is open a transparent sheet *is* laid over
 * everything, which is what closes it wherever the next press lands.
 */
export function PublicationMenu({
  hostRef,
  fileName,
  navVisible,
  onToggleNav,
  slideshow,
  playing,
  onTogglePlay,
}: {
  /** The element to fill the screen with, and the one right-clicks come from. */
  hostRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
  navVisible: boolean;
  onToggleNav: () => void;
  /** Whether this publication advances on its own at all. */
  slideshow: boolean;
  playing: boolean;
  onTogglePlay: () => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      setAt({ x: event.clientX, y: event.clientY });
    };

    host.addEventListener("contextmenu", onContextMenu);
    return () => host.removeEventListener("contextmenu", onContextMenu);
  }, [hostRef]);

  // Leaving full screen by pressing escape is not a click on anything, so the
  // label has to follow the browser rather than the button.
  useEffect(() => {
    const onChange = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!at) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at]);

  async function toggleFullScreen() {
    const host = hostRef.current;
    if (!host) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.requestFullscreen();
    } catch {
      // A browser that refuses — an iframe without the permission, most often
      // — leaves the publication exactly as it was, which is the right outcome.
    }
  }

  async function download() {
    setBusy("Preparing…");
    try {
      await downloadPublicationPdf(fileName, setBusy);
      setAt(null);
    } catch (caught) {
      setBusy(caught instanceof Error ? caught.message : "Could not make a PDF.");
      return;
    }
    setBusy("");
  }

  if (!at) return null;

  /*
   * Kept inside the window. A menu opened near the right or bottom edge would
   * otherwise run off it, and a menu you have to scroll to is not a menu.
   */
  const width = 15;
  const height = 9;
  const remToPx = 16;
  const left = Math.min(at.x, window.innerWidth - width * remToPx - 8);
  const top = Math.min(at.y, window.innerHeight - height * remToPx - 8);

  return (
    <>
      {/* The sheet that closes it: transparent, over everything, and only
          here while the menu is open. */}
      <div
        className="pub-menu-sheet"
        onPointerDown={() => setAt(null)}
        onContextMenu={(event) => {
          // A second right-click moves the menu rather than opening the
          // browser's on top of it.
          event.preventDefault();
          setAt({ x: event.clientX, y: event.clientY });
        }}
      />

      <div
        className="pub-menu"
        role="menu"
        style={{ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }}
      >
        {/* First, because on a publication that plays it is the thing most
            often reached for — and the menu is within reach when the bar at
            the foot has been put away. */}
        {slideshow ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePlay();
              setAt(null);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
        ) : null}

        <button type="button" role="menuitem" onClick={toggleFullScreen}>
          {fullScreen ? "Leave full screen" : "Open full screen"}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onToggleNav();
            setAt(null);
          }}
        >
          {navVisible ? "Hide the navigation bar" : "Show the navigation bar"}
        </button>
        <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={download}>
          {busy || "Download as a PDF"}
        </button>
      </div>
    </>
  );
}
