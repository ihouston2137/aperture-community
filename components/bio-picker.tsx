"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { ModalPortal } from "./modal-portal";

export type BioOption = { _id: string; name: string; title?: string };

/** Enough to scan; a longer list means the name has not been typed yet. */
const MAX_SHOWN = 40;

/** Tall enough to be worth scrolling, short enough to fit beside a field. */
const LIST_MAX_HEIGHT = 224;

/**
 * Where the list sits, given as the edge it is fixed to.
 *
 * A list that opens upwards is held by its **bottom**, not its top. Its height
 * changes as the typing narrows the matches, and one held by the top would
 * keep its top edge and shrink away from the field — leaving the names
 * floating somewhere above the box they belong to.
 */
type Anchor = {
  left: number;
  width: number;
  maxHeight: number;
} & ({ top: number; bottom?: undefined } | { bottom: number; top?: undefined });

/**
 * Picks one person — a profile, or a member — by typing their name.
 *
 * Every member of the site carries a profile, so these lists run to hundreds of
 * entries — far past what a `<select>` can be scrolled through usefully. The
 * field shows the chosen name and filters as it is typed, and the value it
 * carries is the id.
 *
 * Give it `name` to use it inside a plain form, or `value` and `onChange` to
 * drive it from state. It reports the id, never the text: two members can go by
 * the same name, which is the whole reason they are chosen by id.
 *
 * The list is portalled to the body and positioned against the field rather
 * than nested inside it. A dialog body scrolls, and anything scrollable clips
 * what overflows it — a picker in the last field of a dialog would open into
 * the clipped area and look as though it had found nobody.
 */
export function BioPicker({
  options,
  name,
  value,
  defaultValue = "",
  onChange,
  emptyLabel = "None",
  placeholder = "Type a name",
  disabled = false,
}: {
  options: BioOption[];
  /** Renders a hidden input under this name, for uncontrolled form use. */
  name?: string;
  /** Controlled selection. Leave unset to let the field hold its own. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const field = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const [own, setOwn] = useState(defaultValue);
  const selected = value ?? own;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, BioOption>();
    for (const option of options) map.set(option._id, option);
    return map;
  }, [options]);

  const selectedName = byId.get(selected)?.name ?? "";

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options.slice(0, MAX_SHOWN);

    const scored: { option: BioOption; score: number }[] = [];
    for (const option of options) {
      const label = option.name.toLowerCase();
      // A name typed from the start beats one matched in the middle, so "ian"
      // offers Ian before Adrian.
      const score = label.startsWith(term)
        ? 0
        : label.split(/\s+/).some((word) => word.startsWith(term))
          ? 1
          : label.includes(term)
            ? 2
            : -1;
      if (score >= 0) scored.push({ option, score });
    }

    scored.sort(
      (a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name)
    );
    return scored.slice(0, MAX_SHOWN).map((entry) => entry.option);
  }, [options, query]);

  const total = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options.length;
    return options.filter((option) => option.name.toLowerCase().includes(term)).length;
  }, [options, query]);

  /** Where the list should sit: under the field, or above it when there is no room. */
  const measure = useCallback(() => {
    const box = field.current?.getBoundingClientRect();
    if (!box) return;

    const below = window.innerHeight - box.bottom - 8;
    const above = box.top - 8;
    const dropDown = below >= Math.min(LIST_MAX_HEIGHT, above);
    const maxHeight = Math.min(LIST_MAX_HEIGHT, dropDown ? below : above);

    setAnchor({
      left: box.left,
      width: box.width,
      maxHeight,
      // Fixed to the edge nearest the field, so the list stays against it
      // however tall it happens to be at the moment.
      ...(dropDown
        ? { top: box.bottom + 4 }
        : { bottom: window.innerHeight - box.top + 4 }),
    });
  }, []);

  // The field can move under a list that is already open — the dialog behind it
  // scrolls, the window resizes, a chip added above it pushes it down — so its
  // position is followed, not taken once.
  useEffect(() => {
    if (!open) return;
    measure();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (field.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", measure);
    // Captured, so a scroll inside a dialog body counts and not just the page.
    window.addEventListener("scroll", measure, true);

    /*
     * Scrolling and resizing are not the only ways a field moves. In a dialog
     * that grows as it is filled in — a chip added above this one, an error
     * appearing at the top — nothing scrolls and nothing resizes, and the list
     * would be left behind where the field used to be.
     */
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer && field.current) {
      observer.observe(field.current);
      if (document.body) observer.observe(document.body);
    }

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  }, [open, measure]);

  function choose(id: string) {
    if (value === undefined) setOwn(id);
    onChange?.(id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, matches.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Index 0 is the "none" row, so the options start one along.
      if (active === 0) choose("");
      else if (matches[active - 1]) choose(matches[active - 1]._id);
    }
  }

  return (
    <div className="bio-picker" ref={field}>
      {name ? <input type="hidden" name={name} value={selected} /> : null}

      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={selectedName || placeholder}
        value={open ? query : selectedName}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        /* Choosing somebody closes the list but leaves the box focused, so a
           second click on it fires no focus event. Without this, adding two
           people in a row means clicking a field that does nothing. */
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />

      {open && anchor ? (
        <ModalPortal>
          <ul
            className="bio-picker-list"
            id={listId}
            role="listbox"
            ref={list}
            style={{
              left: anchor.left,
              top: anchor.top,
              bottom: anchor.bottom,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
            }}
          >
            <li
              role="option"
              aria-selected={selected === ""}
              className={`bio-picker-option${active === 0 ? " is-active" : ""}`}
              onMouseEnter={() => setActive(0)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose("")}
            >
              {emptyLabel}
            </li>

            {matches.map((option, index) => (
              <li
                key={option._id}
                role="option"
                aria-selected={option._id === selected}
                className={`bio-picker-option${
                  active === index + 1 ? " is-active" : ""
                }`}
                onMouseEnter={() => setActive(index + 1)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option._id)}
              >
                <span>{option.name}</span>
                {option.title ? (
                  <span className="bio-picker-title">{option.title}</span>
                ) : null}
              </li>
            ))}

            {matches.length === 0 ? (
              <li className="bio-picker-empty">
                {options.length === 0
                  ? "Nobody to choose from."
                  : "Nobody matches that."}
              </li>
            ) : total > matches.length ? (
              <li className="bio-picker-empty">
                {total - matches.length} more — keep typing to narrow it down.
              </li>
            ) : null}
          </ul>
        </ModalPortal>
      ) : null}
    </div>
  );
}
