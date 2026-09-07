"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type Quill from "quill";
import "quill/dist/quill.snow.css";

import { formatColor, parseColor } from "@/lib/color";
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

/**
 * The colour swatches. Quill's palette, kept because it is a good one.
 *
 * Quill's own colour controls are not used at all now — its picker is built
 * from a `<select>` whose first swatch it marks `selected` with no value,
 * which the toolbar reads as "remove this format". Black in the text palette
 * and white in the highlight one therefore cleared the colour instead of
 * setting it, and there was no way to reach a colour outside the grid or to
 * make any of them see-through. The control below does all three.
 */
const COLOR_SWATCHES = [
  "#000000", "#e60000", "#ff9900", "#ffff00", "#008a00", "#0066cc", "#9933ff",
  "#ffffff", "#facccc", "#ffebcc", "#ffffcc", "#cce8cc", "#cce0f5", "#ebd6ff",
  "#bbbbbb", "#f06666", "#ffc266", "#ffff66", "#66b966", "#66a3e0", "#c285ff",
  "#888888", "#a10000", "#b26b00", "#b2b200", "#006100", "#0047b2", "#6b24b2",
  "#444444", "#5c0000", "#663d00", "#666600", "#003700", "#002966", "#3d1466",
];

/** Built into an element this component owns, so Quill never touches React's DOM. */
const TOOLBAR_HTML = `
  <span class="ql-formats">
    <button type="button" class="ql-bold"></button>
    <button type="button" class="ql-italic"></button>
    <button type="button" class="ql-underline"></button>
    <button type="button" class="ql-strike"></button>
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

/**
 * One colour control: the swatches and any other colour, under one button.
 *
 * Two controls for one decision was one too many — a grid of swatches beside a
 * custom picker asks somebody to choose how to choose. The palette is the quick
 * answer and the rest of the panel is the exact one, and they set the same
 * thing, so they belong behind the same button.
 *
 * The value is written the way the rest of the admin writes colours: a plain
 * hex string while it is opaque, `rgba()` as soon as it is not — so a custom
 * colour that lands on a swatch still lights that swatch up.
 */
function ColorControl({
  label,
  glyph,
  swatches,
  value,
  open,
  disabled,
  onOpen,
  onClose,
  onChange,
}: {
  label: string;
  glyph: string;
  swatches: string[];
  value: string;
  open: boolean;
  disabled: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}) {
  const { hex, alpha } = parseColor(value, "#000000");
  const percent = Math.round(alpha * 100);

  return (
    <span className="rte-color">
      <button
        type="button"
        className={`rte-color-trigger${open ? " is-open" : ""}`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        /*
         * The press is stopped from moving the focus, which is what keeps the
         * editor's selection alive — the colour has to land on the words that
         * were selected when the button was reached for.
         */
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? onClose() : onOpen())}
      >
        <span className="rte-color-glyph">{glyph}</span>
        {/* Checkerboard behind the bar, so a see-through colour looks it. */}
        <span className="rte-color-bar">
          <span style={{ background: value || "transparent" }} />
        </span>
      </button>

      {open ? (
        <>
          {/* The next press anywhere else closes the panel. */}
          <span className="rte-color-sheet" onPointerDown={onClose} />

          <span className="rte-color-panel">
            <span className="rte-color-swatches">
              {swatches.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`rte-color-swatch${
                    swatch === value ? " is-current" : ""
                  }`}
                  style={{ background: swatch }}
                  title={swatch}
                  aria-label={swatch}
                  onMouseDown={(event) => event.preventDefault()}
                  // Swatches keep whatever opacity is set, so the palette and
                  // the slider are one control rather than two that undo each
                  // other.
                  onClick={() => onChange(formatColor(swatch, alpha))}
                />
              ))}
            </span>

            {/*
              No `preventDefault` from here down. It would keep the selection,
              but it also cancels the gestures these inputs are made of — a
              range slider that cannot be dragged is a transparency control
              that does nothing. The selection is held and restored by the
              caller instead.
            */}
            <label className="rte-color-row">
              <span>Any colour</span>
              <input
                type="color"
                value={hex}
                onChange={(event) => onChange(formatColor(event.target.value, alpha))}
              />
              <input
                type="text"
                className="rte-color-value"
                value={value}
                placeholder="#000000"
                aria-label={`${label} value`}
                onChange={(event) => onChange(event.target.value.trim())}
              />
            </label>

            <label className="rte-color-row">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={percent}
                onChange={(event) => onChange(formatColor(hex, Number(event.target.value) / 100))}
              />
              <output>{percent}%</output>
            </label>

            <button
              type="button"
              className="btn btn-sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange("")}
            >
              No colour
            </button>
          </span>
        </>
      ) : null}
    </span>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  fonts = [],
  minHeight = 12,
  toolbarHost: externalToolbarHost = undefined,
  bare = false,
  autoFocus = false,
  onBlur,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  fonts?: string[];
  /** rem */
  minHeight?: number;
  /**
   * Where the toolbar is put, when it belongs somewhere other than above the
   * writing area — a bar over a canvas, say, shared by whatever is being
   * edited at the time. The element itself rather than a ref, so React
   * re-renders this editor when the bar arrives and the portal has a node to
   * aim at without an effect to notice one.
   *
   * The element is still created and removed by this component. That is the
   * whole reason the toolbar is a portal and not a container somebody else
   * owns: the discarded-editor-still-listening problem described above comes
   * back the moment teardown stops taking the toolbar with it.
   */
  toolbarHost?: HTMLElement | null;
  /** No frame and no min-height: the editor is standing in for the block itself. */
  bare?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const toolbarHost = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);

  // Read inside the editor's callbacks, which outlive the render that made them.
  // Kept current in an effect rather than during render, which React forbids.
  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  const onBlurRef = useRef(onBlur);
  const autoFocusRef = useRef(autoFocus);
  useEffect(() => {
    onChangeRef.current = onChange;
    placeholderRef.current = placeholder;
    onBlurRef.current = onBlur;
  }, [onChange, placeholder, onBlur]);
  /** The last HTML this editor produced, so its own value coming back is a no-op. */
  const emittedRef = useRef(value);
  const initialValueRef = useRef(value);

  const [ready, setReady] = useState(false);
  const [font, setFont] = useState("");
  /** `null` means the selection inherits its size rather than setting one. */
  const [size, setSize] = useState<number | null>(null);
  /**
   * The colour at the caret, for the custom control.
   *
   * Quill's swatches cover the palette; this covers everything else — a brand
   * colour that is not one of thirty-five, and any degree of transparency,
   * which a swatch cannot express at all. Held per target because text and
   * highlight are set independently.
   */
  const [colors, setColors] = useState({ color: "", background: "" });
  const [colorOpen, setColorOpen] = useState<"color" | "background" | null>(null);
  /**
   * Where the caret was when the colour panel was opened.
   *
   * The panel's own inputs take the focus — they have to, or a slider cannot
   * be dragged — so the range they will colour is remembered on the way in and
   * put back before each change.
   */
  const colorRange = useRef<{ index: number; length: number } | null>(null);

  /*
   * Whether the toolbar has somewhere to be.
   *
   * Quill is built around its toolbar element, so there is nothing to build
   * until that element is on the page. In place, it always is; portalled, it
   * arrives on the render after the host's ref is read, and this holds the
   * editor back until then rather than letting it start without one.
   */
  const toolbarReady = externalToolbarHost !== undefined ? externalToolbarHost !== null : true;

  useEffect(() => {
    if (!toolbarReady) return;

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

      /*
       * One toolbar in the host, always.
       *
       * This editor creates and removes its own, which is what keeps a
       * discarded editor from being left listening on the buttons of a live
       * one. Where the toolbar is portalled somewhere shared — the bar above a
       * publication canvas — a torn-down editor that somehow failed to take
       * its toolbar with it would show as a second row of controls beside the
       * real one. Anything already here cannot belong to this editor, which
       * has not built its toolbar yet, so it goes.
       */
      toolbarHost.current.replaceChildren();

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
        setColors({
          color: typeof format.color === "string" ? format.color : "",
          background: typeof format.background === "string" ? format.background : "",
        });
      });

      if (onBlurRef.current) {
        // `selection-change` with a null range is Quill's "focus has left".
        quill.on("selection-change", (range, previous) => {
          if (range === null && previous !== null) onBlurRef.current?.();
        });
      }

      quillRef.current = quill;
      setReady(true);
      // The caret starts in the words rather than nowhere: this editor is
      // opened by double-clicking the text it is standing in for, and that
      // gesture means "let me type here".
      if (autoFocusRef.current) quill.focus();
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
  }, [toolbarReady]);

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

  /** Remembers the words being coloured, before the panel takes the focus. */
  const openColors = (target: "color" | "background") => {
    colorRange.current = quillRef.current?.getSelection() ?? colorRange.current;
    setColorOpen(target);
  };

  /**
   * Sets a colour, or clears it when the value is empty.
   *
   * The remembered range is put back first: by the time this runs the focus is
   * in a slider or a colour input, and Quill would otherwise have nothing to
   * apply the colour to.
   */
  const applyColor = (target: "color" | "background", next: string) => {
    const quill = quillRef.current;
    if (!quill) return;

    const range = colorRange.current;
    if (range) quill.setSelection(range.index, range.length, "silent");
    quill.format(target, next || false, "user");

    setColors((current) => ({ ...current, [target]: next }));
  };

  const toolbar = (
    <div className={`rte-toolbar${bare ? " is-detached" : ""}`}>
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

      {/* Beside the swatches rather than instead of them: the palette is the
          quick answer and this is the exact one. */}
      <span className="rte-group">
        <ColorControl
          label="Text colour"
          glyph="A"
          swatches={COLOR_SWATCHES}
          value={colors.color}
          open={colorOpen === "color"}
          disabled={!ready}
          onOpen={() => openColors("color")}
          onClose={() => setColorOpen(null)}
          onChange={(next) => applyColor("color", next)}
        />
        <ColorControl
          label="Highlight"
          glyph="▮"
          swatches={COLOR_SWATCHES}
          value={colors.background}
          open={colorOpen === "background"}
          disabled={!ready}
          onOpen={() => openColors("background")}
          onClose={() => setColorOpen(null)}
          onChange={(next) => applyColor("background", next)}
        />
      </span>
    </div>
  );

  return (
    <div
      className={`rich-text-editor${bare ? " is-bare" : ""}`}
      style={{ "--rte-min-height": `${minHeight}rem` } as React.CSSProperties}
    >
      {/*
        The toolbar goes wherever it was asked to go, and is still made and
        unmade here. A portal moves where React puts the node without moving
        who owns it, which is exactly the distinction that matters: an editor
        being torn down still takes its toolbar with it, so a discarded one can
        never be left listening on buttons the next editor is using.

        Rendered in place when nowhere else is named, and skipped entirely
        until the host exists — a portal needs a node, and the bar above a
        canvas is mounted by the time this editor is opened.
      */}
      {externalToolbarHost === undefined
        ? toolbar
        : externalToolbarHost && createPortal(toolbar, externalToolbarHost)}

      <div className="rte-editor-host" ref={editorHost} />
    </div>
  );
}
