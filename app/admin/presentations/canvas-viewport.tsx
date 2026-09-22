"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function CanvasViewport({
  width,
  height,
  children,
  controlsTarget,
  onMarquee,
}: {
  width: number;
  height: number;
  children: ReactNode;
  controlsTarget?: HTMLElement | null;
  onMarquee?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pointerInside = useRef(false);
  const [size, setSize] = useState({ width: 1000, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [space, setSpace] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    pan: { x: number; y: number };
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const fit = Math.max(
    0.02,
    Math.min((size.width - 96) / width, (size.height - 176) / height),
  );
  const scale = fit * zoom;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(e.target as Element).closest(
          "input,textarea,select,[contenteditable=true]",
        ) &&
        (!(e.target as Element).closest("button") || pointerInside.current)
      ) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", up);
    };
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? element.clientHeight : 1);
      setZoom((z) =>
          Math.max(0.1, Math.min(10, z * Math.exp(-delta * 0.002))),
        );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function point(clientX: number, clientY: number) {
    const rect = host.current!.getBoundingClientRect();
    return {
      x:
        (clientX - rect.left - (size.width - width * scale) / 2 - pan.x) /
        scale,
      y:
        (clientY - rect.top - (size.height - height * scale) / 2 - 40 - pan.y) /
        scale,
    };
  }
  return (
    <div
      ref={host}
      onPointerEnter={() => {
        pointerInside.current = true;
      }}
      onPointerLeave={() => {
        pointerInside.current = false;
      }}
      className={`deck-viewport${space ? " is-panning" : ""}`}
      aria-label="Page canvas"
      onPointerDownCapture={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.target as Element).closest(".deck-viewport-tools")) return;
        if (
          e.button === 0 &&
          e.shiftKey &&
          !(e.target as Element).closest("[data-slide-object]")
        ) {
          e.preventDefault();
          e.stopPropagation();
          marqueeStart.current = point(e.clientX, e.clientY);
          setMarquee({ ...marqueeStart.current, width: 0, height: 0 });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (e.button !== 0 && e.button !== 1) return;
        if (
          e.button === 1 ||
          space ||
          !(e.target as Element).closest("[data-slide-object]")
        ) {
          e.preventDefault();
          e.stopPropagation();
          drag.current = { x: e.clientX, y: e.clientY, pan };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMoveCapture={(e) => {
        if (marqueeStart.current) {
          e.stopPropagation();
          const p = point(e.clientX, e.clientY),
            start = marqueeStart.current;
          setMarquee({
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            width: Math.abs(p.x - start.x),
            height: Math.abs(p.y - start.y),
          });
          return;
        }
        if (!drag.current) return;
        e.stopPropagation();
        setPan({
          x: drag.current.pan.x + e.clientX - drag.current.x,
          y: drag.current.pan.y + e.clientY - drag.current.y,
        });
      }}
      onPointerUpCapture={(e) => {
        if (marqueeStart.current) {
          e.stopPropagation();
          if (marquee) onMarquee?.(marquee);
          marqueeStart.current = null;
          setMarquee(null);
        }
        if (drag.current) {
          e.stopPropagation();
          drag.current = null;
        }
      }}
      onClick={(e) => {
        if (e.shiftKey) e.stopPropagation();
      }}
      onPointerCancel={() => {
        marqueeStart.current = null;
        setMarquee(null);
        drag.current = null;
      }}
    >
      {controlsTarget &&
        createPortal(
          <div
            className="deck-viewport-tools"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-sm"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))}
            >
              -
            </button>
            <output aria-label="Canvas zoom">{Math.round(scale * 100)}%</output>
            <button
              type="button"
              className="btn btn-sm"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(10, z * 1.2))}
            >
              +
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            >
              Fit page
            </button>
          </div>,
          controlsTarget,
        )}
      <div
        className="deck-pan-world"
        style={{
          width,
          height,
          transform: `translate(${(size.width - width * scale) / 2 + pan.x}px, ${(size.height - height * scale) / 2 + 40 + pan.y}px) scale(${scale})`,
        }}
      >
        {children}
        {marquee && (
          <div
            className="deck-marquee"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}
      </div>
    </div>
  );
}
