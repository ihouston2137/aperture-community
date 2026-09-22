"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Deck, slideDimensions } from "@/lib/presentation";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { Surface, PresentationNavigation } from "./slide-surface";
export function PresentationPlayer({
  deck,
  initialIndex = 0,
  onExit,
}: {
  deck: Deck;
  initialIndex?: number;
  onExit?: () => void;
}) {
  const [index, setIndex] = useState(
    deck.slides[initialIndex]?.hidden ? Math.max(0, deck.slides.findIndex(slide => !slide.hidden)) : Math.min(initialIndex, deck.slides.length - 1),
  );
  const [backStack, setBackStack] = useState<number[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(deck.audioAutoplay !== false);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [navigation, setNavigation] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const navigationRequest = useRef(0);
  const pendingTarget = useRef<number | null>(null);
  const [previous, setPrevious] = useState<number | null>(null);
  const [running, setRunning] = useState(!!deck.autoPlay);
  const [paused, setPaused] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioError, setAudioError] = useState("");
  const background = useRef<HTMLAudioElement>(null),
    pageAudio = useRef<HTMLAudioElement>(null),
    exitButton = useRef<HTMLButtonElement>(null);
  const currentIndex = useRef(index);
  const timerState = useRef({ index: -1, remaining: 0 });
  const page = deck.slides[index],
    dimensions = slideDimensions(deck);
  const go = useCallback(
    async (next: number, direct = false) => {
      let target = Math.max(0, Math.min(deck.slides.length - 1, next));
      if (!direct) {
        const direction = next >= currentIndex.current ? 1 : -1;
        while (deck.slides[target]?.hidden) {
          target += direction;
          if (target < 0 || target >= deck.slides.length) return;
        }
      }
      if (target === currentIndex.current || pendingTarget.current === target)
        return;
      const request = ++navigationRequest.current;
      pendingTarget.current = target;
      setLoading(true);
      // Neighboring pages stay mounted and decoded before their transition begins.
      const node = stage.current?.querySelector<HTMLElement>(
        `[data-player-page="${target}"]`,
      );
      const images = Array.from(node?.querySelectorAll("img") || []);
      images.forEach((img) => {
        img.loading = "eager";
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([
          ...images.map((img) => img.decode()),
          document.fonts.ready,
        ]),
        new Promise((resolve) => {
          timeout = setTimeout(resolve, 2500);
        }),
      ]);
      clearTimeout(timeout);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (request !== navigationRequest.current) return;
      setDirection(target > currentIndex.current ? "forward" : "backward");
      setPrevious(currentIndex.current);
      currentIndex.current = target;
      setIndex(target);
      pendingTarget.current = null;
      setLoading(false);
    },
    [deck.slides],
  );
  useEffect(
    () => () => {
      navigationRequest.current++;
    },
    [],
  );
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current)
        await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setAudioError("Full screen is unavailable in this browser.");
    }
  }
  async function exitPresentation() {
    if (document.fullscreenElement === root.current)
      await document.exitFullscreen();
    if (onExit) onExit();
    else window.location.assign("/");
  }
  function togglePlayback() {
    setRunning(!running);
    setPaused(running);
  }
  useEffect(() => {
    if (menu)
      root.current
        ?.querySelector<HTMLButtonElement>("[role=menuitem]")
        ?.focus();
  }, [menu]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let lastEvent = 0,
      lastNavigation = -Infinity,
      total = 0;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || (e.target as Element).closest("video,audio,[role=menu]"))
        return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastEvent > 180) total = 0;
      const quiet = now - lastEvent > 180;
      lastEvent = now;
      if (
        now - lastNavigation < 700 ||
        (!quiet && lastNavigation > 0 && now - lastNavigation < 1100)
      )
        return;
      total +=
        (e.deltaY || e.deltaX) *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (Math.abs(total) < 30) return;
      void go(currentIndex.current + (total > 0 ? 1 : -1));
      total = 0;
      lastNavigation = now;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [go]);
  useEffect(() => {
    exitButton.current?.focus();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setPrevious(null), 650);
    return () => clearTimeout(timer);
  }, [index]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.target as Element).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "Escape" && menu) {
        e.preventDefault();
        setMenu(null);
        root.current?.focus();
        return;
      }
      if (e.key === "Escape" && onExit && !document.fullscreenElement) {
        e.preventDefault();
        onExit();
      } else if (["ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        go(currentIndex.current + 1);
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        go(currentIndex.current - 1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    const audio = background.current;
    if (!audio) return;
    audio.volume = deck.audioVolume ?? 0.8;
    if (paused || !audioEnabled || !!page.audioUrl) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => setAudioBlocked(true));
    return () => audio.pause();
  }, [deck.audioUrl, deck.audioVolume, audioEnabled, page.audioUrl, paused]);
  useEffect(() => {
    const audio = pageAudio.current;
    if (!audio) return;
    if (paused) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => setAudioBlocked(true));
    return () => audio.pause();
  }, [index, page.audioUrl, paused]);
  useEffect(() => {
    if (!running || paused || page.hidden) return;
    if (timerState.current.index !== index)
      timerState.current = {
        index,
        remaining: (page.duration ?? deck.duration ?? 5) * 1000,
      };
    const started = performance.now();
    let elapsed = timerState.current.remaining === 0,
      complete = !page.waitForAudio || !page.audioUrl;
    const audio = pageAudio.current;
    if (audio?.ended) complete = true;
    const advance = () => {
      if (!elapsed || !complete) return;
      const next = deck.slides.findIndex((slide, i) => i > index && !slide.hidden);
      if (next >= 0) go(next);
      else if (deck.loop && deck.slides.some(slide => !slide.hidden)) go(deck.slides.findIndex(slide => !slide.hidden), true);
      else {
        setRunning(false);
        setPaused(true);
      }
    };
    const ended = () => {
      complete = true;
      advance();
    };
    const failed = () => {
      setAudioError(
        "Page audio could not play. Continuing with the page duration.",
      );
      ended();
    };
    audio?.addEventListener("ended", ended);
    audio?.addEventListener("error", failed);
    if (audio?.error) complete = true;
    const timer = setTimeout(() => {
      elapsed = true;
      advance();
    }, timerState.current.remaining);
    return () => {
      clearTimeout(timer);
      timerState.current.remaining = Math.max(
        0,
        timerState.current.remaining - (performance.now() - started),
      );
      audio?.removeEventListener("ended", ended);
      audio?.removeEventListener("error", failed);
    };
  }, [
    index,
    running,
    paused,
    page.hidden,
    page.duration,
    page.waitForAudio,
    page.audioUrl,
    deck.duration,
    deck.slides,
    deck.loop,
    go,
  ]);
  async function enableAudio() {
    setAudioEnabled(true);
    setAudioBlocked(false);
    setAudioError("");
    for (const audio of [background.current, pageAudio.current])
      if (audio)
        try {
          await audio.play();
        } catch {
          setAudioError(
            "Audio is unavailable. Check the media file or continue manually.",
          );
        }
  }
  const effect = page.transition || deck.transition || "cut";
  return (
    <PresentationNavigation.Provider value={id => { const target = deck.slides.findIndex(slide => slide.id === id); if (target >= 0) { setBackStack(stack => [...stack, index]); void go(target, true); } }}><div
      ref={root}
      tabIndex={-1}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest("[role=menu]")) setMenu(null);
      }}
      className="deck-presentation"
      role={onExit ? "dialog" : undefined}
      aria-modal={onExit ? true : undefined}
      aria-label={onExit ? "Presentation preview" : deck.title}
    >
      {page.hidden && page.showBack && backStack.length > 0 && <button className="pub-back" onClick={() => { const target = backStack.at(-1)!; setBackStack(stack => stack.slice(0, -1)); void go(target, true); }}>{page.backLabel || "Back"}</button>}
      {navigation && (
        <div
          className="deck-present-controls deck-navigation-island"
          role="toolbar"
          aria-label="Presentation navigation"
        >
          <button
            className="btn"
            ref={exitButton}
            title="Exit presentation"
            aria-label="Exit presentation"
            onClick={exitPresentation}
          >
            <X aria-hidden="true" />
          </button>
          <button
            className="btn"
            title="Previous page"
            aria-label="Previous page"
            disabled={!deck.slides.some((slide, i) => i < index && !slide.hidden)}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span aria-label="Current page">
            {page.hidden ? "-" : deck.slides.slice(0, index + 1).filter(slide => !slide.hidden).length} / {deck.slides.filter(slide => !slide.hidden).length}
          </span>
          <button
            className="btn"
            title="Next page"
            aria-label="Next page"
            disabled={!deck.slides.some((slide, i) => i > index && !slide.hidden)}
            onClick={() => go(index + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <button
            className="btn"
            title={running ? "Pause" : "Play"}
            aria-label={running ? "Pause autoplay" : "Start autoplay"}
            onClick={togglePlayback}
          >
            {running ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
          </button>
          {(audioBlocked || !audioEnabled) && deck.audioUrl && (
            <button
              className="btn"
              title="Enable audio"
              aria-label="Enable audio"
              onClick={enableAudio}
            >
              <Volume2 aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {(audioError || loading) && (
        <div className="deck-playback-notice" role="status">
          {audioError || "Loading page..."}
        </div>
      )}
      {menu && (
        <div
          className="deck-context-menu deck-player-menu"
          role="menu"
          aria-label="Presentation options"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 250)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 170)),
          }}
          onClick={() => setMenu(null)}
          onContextMenu={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (["ArrowUp", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              );
              const i = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              items[
                (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) %
                  items.length
              ]?.focus();
            }
          }}
        >
          <button role="menuitem" onClick={() => setNavigation(!navigation)}>
            {navigation ? "Hide navigation" : "Show navigation"}
          </button>
          <button role="menuitem" onClick={togglePlayback}>
            {running ? "Pause presentation" : "Play presentation"}
          </button>
          <button role="menuitem" onClick={toggleFullscreen}>
            {fullscreen ? "Exit full screen" : "Enter full screen"}
          </button>
        </div>
      )}
      {deck.audioUrl && (
        <audio
          ref={background}
          src={protectedMediaUrl(deck.audioUrl)}
          loop={deck.audioLoop !== false}
          preload="auto"
          aria-label="Presentation audio"
          onError={() => setAudioError("Presentation audio could not play.")}
        />
      )}
      {page.audioUrl && (
        <audio
          key={page.id}
          ref={pageAudio}
          src={protectedMediaUrl(page.audioUrl)}
          preload="auto"
          aria-label="Page audio"
        />
      )}
      <div
        ref={stage}
        className="deck-present-stage deck-playback-stage"
        style={
          {
            "--slide-aspect": dimensions.width / dimensions.height,
          } as React.CSSProperties
        }
      >
        {[
          ...new Set([
            index - 1,
            index,
            index + 1,
            ...(previous === null ? [] : [previous]),
          ]),
        ]
          .filter((i) => i >= 0 && i < deck.slides.length)
          .map((i) => {
            const active = i === index,
              outgoing = i === previous && effect !== "cut";
            return (
              <div
                key={deck.slides[i].id}
                data-player-page={i}
                data-active={active ? "true" : "false"}
                style={
                  active && previous === null
                    ? { animation: "none" }
                    : undefined
                }
                aria-hidden={!active}
                inert={!active}
                className={`deck-transition-layer ${active ? `deck-transition-${effect} deck-flip-${direction}` : outgoing ? "deck-previous-page" : "deck-preloaded-page"}`}
              >
                <Surface
                  slide={deck.slides[i]}
                  dimensions={dimensions}
                  interactive={active}
                  preload
                />
              </div>
            );
          })}
      </div>
    </div></PresentationNavigation.Provider>
  );
}
