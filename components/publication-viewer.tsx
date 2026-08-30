"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  effectiveBackground,
  inheritedBlocks,
  type AudioSettings,
  type PublicationBlock,
  type PublicationPage,
  type PublicationPageTemplate,
  type SlideshowSettings,
  type Transition,
} from "@/lib/publication-layout";
import { protectedMediaUrl } from "@/lib/protected-media-url";

import { IconView } from "./icons";
import { PublicationMenu } from "./publication-menu";

import {
  PublicationBlockView,
  publicationBlockStyle,
  type PublicationSources,
} from "./publication-blocks";

/**
 * Renders a publication at its authored canvas size and scales the whole stage
 * to the viewport. Because everything inside is positioned in canvas units and
 * text is sized in rem against a scaled root, relative sizing is preserved at
 * every screen size — the same maths the admin preview uses.
 */
export function PublicationViewer({
  pages,
  repeatedBlocks = [],
  pageTemplates = [],
  canvas,
  transition,
  slideshow,
  audio,
  sources,
  showControls = true,
  fileName,
}: {
  pages: PublicationPage[];
  /** Drawn on every page, underneath that page's own blocks. */
  repeatedBlocks?: PublicationBlock[];
  /** Layouts a page can be built on; its blocks draw beneath the page's. */
  pageTemplates?: PublicationPageTemplate[];
  canvas: { width: number; height: number };
  transition: Transition;
  slideshow: SlideshowSettings;
  audio: AudioSettings;
  sources: PublicationSources;
  showControls?: boolean;
  /** What a downloaded PDF is called. Absent turns the menu's download off. */
  fileName?: string;
}) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  // Enabled says it *can* advance on its own; autoplay says it does so
  // without being asked.
  const [playing, setPlaying] = useState(slideshow.enabled && slideshow.autoplay);
  /** Put away from the right-click menu, and brought back the same way. */
  const [navHidden, setNavHidden] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const goTo = useCallback(
    (next: number) => {
      if (pages.length === 0) return;
      if (next < 0) return setIndex(slideshow.loop ? pages.length - 1 : 0);
      if (next >= pages.length) return setIndex(slideshow.loop ? 0 : pages.length - 1);
      setIndex(next);
    },
    [pages.length, slideshow.loop]
  );

  // Fit the canvas inside the viewport without cropping.
  useLayoutEffect(() => {
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      const { clientWidth, clientHeight } = host;
      setScale(Math.min(clientWidth / canvas.width, clientHeight / canvas.height));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [canvas.width, canvas.height]);

  useEffect(() => {
    if (!playing || pages.length < 2) return;
    const timer = setInterval(() => goTo(index + 1), slideshow.intervalMs);
    return () => clearInterval(timer);
  }, [playing, index, pages.length, slideshow.intervalMs, goTo]);

  /*
   * The wheel turns the page.
   *
   * Throttled, because one flick of a wheel or one swipe on a trackpad sends a
   * burst of events and a publication that jumped five pages at a time would be
   * unusable. Bound with `passive: false` on the element rather than through a
   * React prop, so the browser's own scroll can be prevented — a stage that
   * fills the window has nothing to scroll, and the page behind it moving
   * instead is the wrong answer.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || pages.length < 2) return;

    let settledAt = 0;
    const onWheel = (event: WheelEvent) => {
      const travel = Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
      if (travel === 0) return;

      event.preventDefault();

      const now = Date.now();
      if (now - settledAt < 350) return;
      settledAt = now;

      goTo(index + (travel > 0 ? 1 : -1));
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [index, goTo, pages.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") goTo(index + 1);
      if (event.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = audio.volume;
  }, [audio.volume]);

  if (pages.length === 0) {
    return <div className="empty-state">This publication has no pages yet.</div>;
  }

  const pageAudio = pages[index]?.audioUrl;

  return (
    <div className="pub-viewer" ref={hostRef}>
      <div
        className="pub-stage"
        style={{
          width: `${canvas.width}px`,
          height: `${canvas.height}px`,
          transform: `scale(${scale})`,
          // rem inside the stage resolves against this font size, so text
          // scales with the canvas instead of the browser default.
          fontSize: `${16}px`,
        }}
      >
        {pages.map((page, pageIndex) => {
          // A page's own background, or its layout's when it has none.
          const background = effectiveBackground(page, pageTemplates);
          return (
          <div
            key={page.id}
            className={`pub-page${pageIndex === index ? "" : " is-hidden"}${
              // Under the page being turned and the one it uncovers: covered
              // rather than turned, and hidden so a page with a transparent
              // background does not show the whole pile through it.
              transition === "flip" && pageIndex > index + 1 ? " is-buried" : ""
            }`}
            data-transition={transition}
            style={
              transition === "slide"
                ? { transform: `translateX(${(pageIndex - index) * 100}%)` }
                : transition === "flip"
                  ? {
                      /*
                       * Read, or turned over. A page ahead of the reader lies
                       * flat on the pile; one behind them has been turned the
                       * whole way, which is what carries it out of sight —
                       * ninety degrees only ever stood it on its edge.
                       */
                      transform: `rotateY(${pageIndex < index ? -180 : 0}deg)`,
                      /*
                       * Earlier pages sit above later ones, always. The page
                       * being turned is therefore above the one it uncovers
                       * for the whole of the turn, and the turned ones above
                       * it are invisible anyway — their backs are to us.
                       */
                      zIndex: pages.length - pageIndex,
                    }
                  : undefined
            }
            aria-hidden={pageIndex !== index}
          >
            {background.backgroundType === "color" ? (
              <div className="pub-bg" style={{ background: background.backgroundColor }} />
            ) : null}

            {background.backgroundType === "image" && background.backgroundMediaUrl ? (
              <div className={`pub-bg${background.kenBurns ? " is-ken-burns" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={protectedMediaUrl(background.backgroundMediaUrl)}
                  alt=""
                  style={{
                    objectFit: background.backgroundFit,
                    objectPosition: `${50 + background.backgroundOffsetX}% ${
                      50 + background.backgroundOffsetY
                    }%`,
                  }}
                />
              </div>
            ) : null}

            {background.backgroundType === "video" && background.backgroundMediaUrl ? (
              <div className="pub-bg">
                <video
                  src={protectedMediaUrl(background.backgroundMediaUrl)}
                  autoPlay
                  muted={background.videoMuted}
                  loop={background.videoLoop}
                  playsInline
                  style={{ objectFit: background.backgroundFit }}
                />
              </div>
            ) : null}

            {[...inheritedBlocks(page, repeatedBlocks, pageTemplates), ...page.blocks].map((block) => (
              <div key={block.id} className="pub-block" style={publicationBlockStyle(block)}>
                <PublicationBlockView
                  block={block}
                  sources={sources}
                  onNavigate={(pageId) => {
                    const target = pages.findIndex((candidate) => candidate.id === pageId);
                    if (target >= 0) setIndex(target);
                  }}
                />
              </div>
            ))}
          </div>
          );
        })}
      </div>

      {audio.url ? (
        <audio
          ref={audioRef}
          src={protectedMediaUrl(audio.url)}
          autoPlay={audio.autoplay}
          loop={audio.loop}
        />
      ) : null}

      {/* Page audio replaces the global track while that page is showing. */}
      {pageAudio ? <audio key={pageAudio} src={protectedMediaUrl(pageAudio)} autoPlay /> : null}

      {fileName ? (
        <PublicationMenu
          hostRef={hostRef}
          fileName={fileName}
          navVisible={!navHidden}
          onToggleNav={() => setNavHidden((current) => !current)}
          slideshow={slideshow.enabled}
          playing={playing}
          onTogglePlay={() => setPlaying((current) => !current)}
        />
      ) : null}

      {showControls && !navHidden && pages.length > 1 ? (
        <div className="pub-controls">
          {/* Arrows rather than the ‹ › glyphs, which at this size read as
              punctuation instead of something to press. */}
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous page">
            <IconView name="ChevronLeft" width="1.25rem" height="1.25rem" />
          </button>
          <span style={{ color: "#fff", alignSelf: "center", fontSize: "0.8125rem" }}>
            {index + 1} / {pages.length}
          </span>
          <button type="button" onClick={() => goTo(index + 1)} aria-label="Next page">
            <IconView name="ChevronRight" width="1.25rem" height="1.25rem" />
          </button>
          {slideshow.enabled ? (
            <button type="button" onClick={() => setPlaying((current) => !current)}>
              {playing ? "Pause" : "Play"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
