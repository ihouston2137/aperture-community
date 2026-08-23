"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Quill from "quill";
import "quill/dist/quill.snow.css";

import { REM_BASE, normalizeRichTextSpaces } from "@/lib/rich-text";

/**
 * One rich-text menu for the whole app: page blocks, form blocks, story
 * content and publication text all get the same toolbar.
 *
 * Quill is driven directly rather than through `react-quill-new`. That wrapper
 * treats `value` as controlled and reloads the whole document whenever the prop
 * stops matching the editor, which moves the caret; and its teardown explicitly
 * leaves an external toolbar container alone, so React's development-mode double
 * mount left a discarded editor still listening on the toolbar buttons. Two
 * instances then fought over one toolbar: formats would turn on but never off,
 * and the visible colour picker belonged to the dead editor.
 *
 * Here the toolbar and editor elements are created and removed by this
 * component, so a remount always starts from nothing.
 */

/** Font sizes are authored and stored in rem so text scales with the viewport. */
const SIZE_STEP = 0.125;
const MIN_SIZE = 0.5;
const MAX_SIZE = 6;
/** What an unstyled run renders at, and where stepping starts from. */
const BASE_SIZE = 1;

/** Built into an element this component owns, so Quill never touches React's DOM. */
const TOOLBAR_HTML = `
  <span class="ql-formats">
    <button type="button" class="ql-bold"></button>
    <button type="button" class="ql-italic"></button>
    <button type="button" class="ql-underline"></button>
    <button type="button" class="ql-strike"></button>
  </span>
  <span class="ql-formats">
    <select class="ql-color"></select>
    <select class="ql-background"></select>
  </span>
  <span class="ql-formats">
    <select class="ql-align"></select>
  </span>
  <span class="ql-formats">
    <button type="button" class="ql-list" value="ordered"></button>
    <button type="button" class="ql-list" value="bullet"></button>
  </span>
  <span class="ql-formats">
    <button type="button" class="ql-blockquote"></button>
    <button type="button" class="ql-link"></button>
  </span>
  <span class="ql-formats">
    <button type="button" class="ql-clean"></button>
  </span>
`;

/** Reads a Quill `size` format back to a rem number, tolerating legacy px. */
function parseSize(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^\s*([\d.]+)\s*(rem|px)\s*$/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2].toLowerCase() === "px" ? amount / REM_BASE : amount;
}

function roundSize(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  fonts = [],
  minHeight = 12,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  fonts?: string[];
  /** rem */
  minHeight?: number;
}) {
  const toolbarHost = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);

  // Read inside the editor's callbacks, which outlive the render that made them.
  // Kept current in an effect rather than during render, which React forbids.
  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  useEffect(() => {
    onChangeRef.current = onChange;
    placeholderRef.current = placeholder;
  }, [onChange, placeholder]);
  /** The last HTML this editor produced, so its own value coming back is a no-op. */
  const emittedRef = useRef(value);
  const initialValueRef = useRef(value);

  const [ready, setReady] = useState(false);
  const [font, setFont] = useState("");
  /** `null` means the selection inherits its size rather than setting one. */
  const [size, setSize] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let toolbarEl: HTMLDivElement | null = null;
    let editorEl: HTMLDivElement | null = null;

    // Quill touches `document` on import, so it can only load in the browser.
    void (async () => {
      const { default: QuillCtor } = await import("quill");
      if (cancelled || !toolbarHost.current || !editorHost.current) return;

      // Font family and size ship as inline styles with the whitelist removed,
      // so the toolbar can apply any design-library font and any rem value.
      // Quill's defaults are class attributors with fixed whitelists, which
      // silently drop anything else.
      const registry = QuillCtor as unknown as {
        import: (path: string) => { whitelist: string[] | null };
        register: (target: unknown, overwrite: boolean) => void;
      };
      const fontStyle = registry.import("attributors/style/font");
      fontStyle.whitelist = null;
      registry.register(fontStyle, true);
      const sizeStyle = registry.import("attributors/style/size");
      sizeStyle.whitelist = null;
      registry.register(sizeStyle, true);

      toolbarEl = document.createElement("div");
      toolbarEl.className = "rte-quill-toolbar";
      toolbarEl.innerHTML = TOOLBAR_HTML;
      toolbarHost.current.appendChild(toolbarEl);

      editorEl = document.createElement("div");
      editorHost.current.appendChild(editorEl);

      const quill = new QuillCtor(editorEl, {
        theme: "snow",
        placeholder: placeholderRef.current,
        modules: { toolbar: { container: toolbarEl } },
      });

      quill.setContents(
        quill.clipboard.convert({ html: initialValueRef.current || "" }),
        "silent"
      );

      quill.on("text-change", () => {
        // Quill turns every space into `&nbsp;` on the way out, which stops the
        // text wrapping. Undoing it here rather than in the parent keeps the
        // emitted value equal to `emittedRef`, so the sync effect below stays
        // quiet and the caret is never disturbed.
        const html = normalizeRichTextSpaces(quill.getSemanticHTML());
        emittedRef.current = html;
        onChangeRef.current(html);
      });

      // Keeps the font and size controls showing the formatting at the cursor.
      quill.on("editor-change", () => {
        // `getFormat()` with no argument dereferences the selection, which is
        // null while the editor is unfocused, and throws rather than returning
        // nothing. A throw here would abort Quill's remaining listeners.
        const range = quill.getSelection();
        // No selection means focus just left, so leave the toolbar showing the
        // formatting the user is about to change.
        if (!range) return;
        const format = quill.getFormat(range);
        setFont(typeof format.font === "string" ? format.font : "");
        setSize(parseSize(format.size));
      });

      quillRef.current = quill;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      quillRef.current = null;
      setReady(false);
      // Removing the elements takes Quill's listeners, pickers and tooltip with
      // them; nothing of this editor survives into the next mount.
      toolbarEl?.remove();
      editorEl?.remove();
    };
  }, []);

  // The value is otherwise uncontrolled. This only fires when something outside
  // replaces it, such as the builder switching to a different block.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill || value === emittedRef.current) return;
    emittedRef.current = value;
    const selection = quill.getSelection();
    quill.setContents(quill.clipboard.convert({ html: value || "" }), "silent");
    if (selection) quill.setSelection(selection.index, selection.length, "silent");
  }, [value]);

  useEffect(() => {
    const quill = quillRef.current;
    if (quill) quill.root.dataset.placeholder = placeholder ?? "";
  }, [placeholder, ready]);

  /** Quill drops its selection when the toolbar takes focus; `focus()` restores it. */
  const applyFormat = useCallback((name: string, next: string | false) => {
    const quill = quillRef.current;
    if (!quill) return;
    quill.focus();
    quill.format(name, next, "user");
  }, []);

  const stepSize = (direction: 1 | -1) => {
    const next = roundSize(
      Math.min(MAX_SIZE, Math.max(MIN_SIZE, (size ?? BASE_SIZE) + direction * SIZE_STEP))
    );
    applyFormat("size", `${next}rem`);
    // Formatting a collapsed cursor emits no change event, so set it here too.
    setSize(next);
  };

  const changeFont = (next: string) => {
    applyFormat("font", next || false);
    setFont(next);
  };

  return (
    <div
      className="rich-text-editor"
      style={{ "--rte-min-height": `${minHeight}rem` } as React.CSSProperties}
    >
      <div className="rte-toolbar">
        <span className="rte-group">
          <select
            className="rte-font-select"
            aria-label="Font"
            value={font}
            disabled={!ready}
            onChange={(event) => changeFont(event.target.value)}
          >
            <option value="">Default font</option>
            {fonts.map((family) => (
              <option key={family} value={family} style={{ fontFamily: `"${family}", system-ui` }}>
                {family}
              </option>
            ))}
            {/* Content authored before a font was removed from the library
                still needs something to display. */}
            {font && !fonts.includes(font) ? <option value={font}>{font}</option> : null}
          </select>
        </span>

        <span className="rte-group rte-size">
          <button
            type="button"
            className="rte-size-step"
            aria-label="Decrease font size"
            disabled={!ready || (size ?? BASE_SIZE) <= MIN_SIZE}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepSize(-1)}
          >
            −
          </button>
          <span
            className="rte-size-value"
            data-inherited={size === null ? "true" : undefined}
            title={size === null ? "Inherited size" : "Font size"}
          >
            {size ?? BASE_SIZE}
            <small>rem</small>
          </span>
          <button
            type="button"
            className="rte-size-step"
            aria-label="Increase font size"
            disabled={!ready || (size ?? BASE_SIZE) >= MAX_SIZE}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => stepSize(1)}
          >
            +
          </button>
        </span>

        {/* Quill's own controls are built into a child of this host, which this
            component creates and removes. */}
        <div className="rte-toolbar-host" ref={toolbarHost} />
      </div>

      <div className="rte-editor-host" ref={editorHost} />
    </div>
  );
}
