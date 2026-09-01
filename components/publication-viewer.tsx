"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  /**
   * Where a link came from, so a hidden page can offer the way back.
   *
   * A stack rather than one value, because a hidden page may link to another:
   * an appendix that refers to a second appendix should come back through both
   * rather than jumping over the first. Reset by ordinary paging, since
   * stepping off a hidden page is leaving it rather than returning from it.
   */
  const [cameFrom, setCameFrom] = useState<number[]>([]);
  const [scale, setScale] = useState(1);
  // Enabled says it *can* advance on its own; autoplay says it does so
  // without being asked.
  const [playing, setPlaying] = useState(slideshow.enabled && slideshow.autoplay);
  /** Put away from the right-click menu, and brought back the same way. */
  const [navHidden, setNavHidden] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /** The pages somebody actually pages through. */
  const browsable = useMemo(
    () => pages.map((page, at) => (page.hidden ? -1 : at)).filter((at) => at >= 0),
    [pages]
  );

  /**
   * One step along the browse order, skipping anything hidden.
   *
   * Walks the real array rather than an index into a filtered copy, so a
   * reader standing on a hidden page can still step off it — forward goes to
   * the next visible page after where that page sits, back to the one before.
   * Being unreachable by paging is not the same as being a trap.
   *
   * A publication whose every page is hidden stays where it is, which beats
   * looping forever looking for somewhere to go.
   */
  const step = useCallback(
    (from: number, direction: 1 | -1) => {
      if (browsable.length === 0) return from;

      for (let at = from + direction; at >= 0 && at < pages.length; at += direction) {
        if (!pages[at].hidden) return at;
      }

      if (!slideshow.loop) {
        // Off the end: stay on the last page there is to browse, which is what
        // stopping at the end has always meant here.
        const edge = direction === 1 ? browsable[browsable.length - 1] : browsable[0];
        return pages[from]?.hidden ? edge : from;
      }

      return direction === 1 ? browsable[0] : browsable[browsable.length - 1];
    },
    [browsable, pages, slideshow.loop]
  );

  const goTo = useCallback(
    (next: number) => {
      if (pages.length === 0) return;
      // Paging away is leaving, not returning: the trail back belongs to the
      // link that made it, and following the arrows off a hidden page is not
      // following that link back.
      setCameFrom([]);
      setIndex(next);
    },
    [pages.length]
  );

  /** Follows a link, remembering where it was followed from. */
  const navigateTo = useCallback(
    (target: number, from: number) => {
      setCameFrom((trail) => (pages[target]?.hidden ? [...trail, from] : []));
      setIndex(target);
    },
    [pages]
  );

  const goBack = useCallback(() => {
    setCameFrom((trail) => {
      const to = trail[trail.length - 1];
      if (to === undefined) return trail;
      setIndex(to);
      return trail.slice(0, -1);
    });
  }, []);

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

  /*
   * Advances on its own, but never off a page somebody was linked to.
   *
   * A hidden page is somewhere a reader chose to go; sliding out from under
   * them after four seconds would undo the choice. The show waits there until
   * they leave, by the back button or by an arrow.
   */
  useEffect(() => {
    if (!playing || browsable.length < 2 || pages[index]?.hidden) return;
    const timer = setInterval(() => setIndex(step(index, 1)), slideshow.intervalMs);
    return () => clearInterval(timer);
  }, [playing, index, pages, browsable.length, slideshow.intervalMs, step]);

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
    if (!host || browsable.length < 2) return;

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

      goTo(step(index, travel > 0 ? 1 : -1));
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [index, goTo, step, browsable.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape retraces a link before it does anything else: on a page reached
      // that way it is the gesture everybody tries first.
      if (event.key === "Escape" && cameFrom.length > 0) {
        goBack();
        return;
      }
      if (event.key === "ArrowRight" || event.key === " ") goTo(step(index, 1));
      if (event.key === "ArrowLeft") goTo(step(index, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo, step, goBack, cameFrom.length]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = audio.volume;
  }, [audio.volume]);

  if (pages.length === 0) {
    return <div className="empty-state">This publication has no pages yet.</div>;
  }

  const pageAudio = pages[index]?.audioUrl;

  /** Where this page sits in the browse order, or null if it is outside it. */
  const browsePosition = pages[index]?.hidden
    ? null
    : browsable.indexOf(index) + 1;

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
            // Read by the PDF capture, which leaves these out: a printed copy
            // has no links, so a page reachable only by one has no place in
            // the run of pages somebody turns.
            data-unlisted={page.hidden ? "true" : undefined}
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
                    // Through `navigateTo`, which is what remembers the way
                    // back — a hidden page has no other way out.
                    if (target >= 0) navigateTo(target, index);
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

      {/* The way back off a linked page.
          Its own control rather than a place in the nav bar: it belongs to the
          page somebody was sent to, comes and goes with that page, and reads
          as the answer to "how do I get out of here" only if it is somewhere
          the eye lands first. */}
      {!navHidden && pages[index]?.hidden && pages[index].showBack && cameFrom.length > 0 ? (
        <button type="button" className="pub-back" onClick={goBack}>
          <IconView name="ChevronLeft" width="1rem" height="1rem" />
          {pages[index].backLabel || "Back"}
        </button>
      ) : null}

      {showControls && !navHidden && browsable.length > 1 ? (
        <div className="pub-controls">
          {/* Arrows rather than the ‹ › glyphs, which at this size read as
              punctuation instead of something to press. */}
          <button type="button" onClick={() => goTo(step(index, -1))} aria-label="Previous page">
            <IconView name="ChevronLeft" width="1.25rem" height="1.25rem" />
          </button>
          <span style={{ color: "#fff", alignSelf: "center", fontSize: "0.8125rem" }}>
            {/* Counted over what can be browsed, so the total matches what the
                arrows can actually reach. A hidden page is not in that run and
                has no number in it — saying so beats naming a position the
                reader cannot get back to by counting. */}
            {browsePosition === null
              ? `— / ${browsable.length}`
              : `${browsePosition} / ${browsable.length}`}
          </span>
          <button type="button" onClick={() => goTo(step(index, 1))} aria-label="Next page">
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
