"use client";

import { useState } from "react";

/** A file-name-safe scrap of a page or layout name. */
function slugPart(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Captures the rendered stage one page at a time and hands the frames to the
 * export endpoints. `html-to-image` and `jspdf` are imported lazily so they
 * only load when someone actually exports.
 */
export function PublicationExport({
  audioUrl,
  fileName,
  pageIndex,
  pageName,
  inline = false,
  onPrepare,
  onDone,
}: {
  audioUrl?: string;
  fileName: string;
  /** Which page a single-image export should take, and what to call it. */
  pageIndex?: number;
  pageName?: string;
  /** In a toolbar rather than floating over a preview. */
  inline?: boolean;
  /**
   * Called before anything is captured, for surfaces that have to put the
   * pages on screen first — the editor shows one page at a time, so it mounts
   * a hidden stage carrying them all.
   */
  onPrepare?: () => Promise<void> | void;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /** Wraps an export so the caller can stage the pages and clean up after. */
  async function withPages(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (onPrepare) await onPrepare();
      await run();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      onDone?.();
      setBusy(false);
    }
  }

  /** The authored canvas size, which is the page's own layout box. */
  function pageSize(node: HTMLElement) {
    // `offsetWidth` rather than `getBoundingClientRect`, which would report the
    // stage's on-screen size after it has been scaled down to fit the viewport.
    return { width: node.offsetWidth || 1920, height: node.offsetHeight || 1080 };
  }

  async function capturePages(): Promise<string[]> {
    const { toPng } = await import("html-to-image");
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".pub-page"));

    const frames: string[] = [];
    for (const [index, node] of nodes.entries()) {
      setMessage(`Rendering page ${index + 1} of ${nodes.length}…`);
      const { width, height } = pageSize(node);

      frames.push(
        await toPng(node, {
          cacheBust: true,
          pixelRatio: 1,
          // Captured at the authored size, not at whatever the stage has been
          // scaled to on screen.
          width,
          height,
          /*
           * Applied to the clone, so the live page is never touched.
           *
           * Every page but the current one is hidden by opacity, and by a
           * transform when the transition slides or flips. Setting opacity on
           * the real node started a 450ms fade that the capture did not wait
           * for, which is why every page after the first came out blank.
           */
          style: {
            opacity: "1",
            visibility: "visible",
            transform: "none",
            transition: "none",
          },
        })
      );
    }
    return frames;
  }

  /** The page on screen, saved on its own. */
  async function exportPng() {
    await withPages(async () => {
      const { toPng } = await import("html-to-image");
      /*
       * Whatever is being looked at, which the caller knows better than the DOM
       * does: the editor stages every page off-screen and says which one is
       * selected, while the preview simply shows one at a time.
       */
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(".pub-page"));
      const node =
        (pageIndex !== undefined ? nodes[pageIndex] : undefined) ??
        nodes.find((item) => !item.classList.contains("is-hidden")) ??
        nodes[0];
      if (!node) {
        setError("There is nothing to export.");
        return;
      }


      const { width, height } = pageSize(node);
      const frame = await toPng(node, {
        cacheBust: true,
        pixelRatio: 1,
        width,
        height,
        style: { opacity: "1", visibility: "visible", transform: "none", transition: "none" },
      });

      const link = document.createElement("a");
      link.href = frame;
      // Named for the publication and the page, so a folder of exports still
      // says what each picture is.
      const suffix = slugPart(pageName) || String(nodes.indexOf(node) + 1);
      link.download = `${fileName}-${suffix}.png`;
      link.click();
      setMessage("Image downloaded.");
    });
  }

  async function exportMp4() {
    await withPages(async () => {
      const frames = await capturePages();
      if (frames.length === 0) {
        setError("There is nothing to export.");
        return;
      }

      setMessage("Encoding video…");
      const response = await fetch("/api/admin/zines/export-mp4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, audioUrl, fps: 1 }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? "Export failed.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.mp4`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Video downloaded.");
    });
  }

  async function exportPdf() {
    await withPages(async () => {
      const frames = await capturePages();
      if (frames.length === 0) {
        setError("There is nothing to export.");
        return;
      }

      const { jsPDF } = await import("jspdf");
      const first = document.querySelector<HTMLElement>(".pub-page");
      // The publication's authored dimensions, so the PDF page is the shape the
      // editor set rather than a paper size.
      const { width, height } = first
        ? pageSize(first)
        : { width: 1920, height: 1080 };

      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
        // A PDF page is measured in points, so the canvas has to be converted:
        // at the usual 96dpi, 1080 canvas pixels is 810pt. Without this hotfix
        // jsPDF scales the other way and the page comes out a third too large.
        hotfixes: ["px_scaling"],
      });

      frames.forEach((frame, index) => {
        if (index > 0) pdf.addPage([width, height], width >= height ? "landscape" : "portrait");
        pdf.addImage(frame, "PNG", 0, 0, width, height);
      });

      pdf.save(`${fileName}.pdf`);
      setMessage("PDF downloaded.");
    });
  }

  return (
    <div
      style={
        inline
          ? { display: "flex", gap: "0.25rem", alignItems: "center" }
          : {
              position: "fixed",
              top: "1rem",
              right: "1rem",
              zIndex: 10,
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              background: "rgba(0,0,0,0.6)",
              borderRadius: "999px",
              padding: "0.35rem 0.75rem",
            }
      }
    >
      {message ? (
        <span className={inline ? "help-text" : undefined} style={inline ? undefined : { color: "#fff", fontSize: "0.75rem" }}>
          {message}
        </span>
      ) : null}
      {error ? <span style={{ color: "#f28b82", fontSize: "0.75rem" }}>{error}</span> : null}
      <button type="button" className="btn btn-sm" disabled={busy} onClick={exportPng}>
        Export PNG
      </button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={exportPdf}>
        Export PDF
      </button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={exportMp4}>
        Export MP4
      </button>
    </div>
  );
}
