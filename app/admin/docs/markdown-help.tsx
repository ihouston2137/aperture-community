"use client";

import { useEffect, useState } from "react";

import { DocContent, Inline } from "@/components/doc-blocks";
import { ModalPortal } from "@/components/modal-portal";
import { parseMarkdownBlocks } from "@/lib/doc-markdown";

/**
 * What this editor's markdown understands, with the result beside it.
 *
 * Every "result" here is produced by running the example through the very
 * parser and renderer the document uses — nothing is described in prose or
 * mocked up. A cheat sheet written by hand drifts the first time the grammar
 * changes, and a wrong cheat sheet is worse than none: somebody types what it
 * told them to and gets something else.
 *
 * The grammar is deliberately small, so the sheet is deliberately complete.
 * Anything not on it is not supported, which is a thing worth being able to
 * find out.
 */

/** Inline marks, which live inside a block's text. */
const INLINE_EXAMPLES: { code: string; note?: string }[] = [
  { code: "**bold**" },
  { code: "_italic_", note: "`*italic*` does the same." },
  { code: "***both***" },
  { code: "`code`", note: "Backticks keep everything inside them literal." },
  { code: "~~struck through~~" },
  { code: "[a link](https://example.com)" },
  { code: "[a page](/docs/handbook)", note: "A path stays on the site." },
  { code: "![alt text](/uploads/media/badge.png)" },
];

/** Whole blocks, each one a line or more of its own. */
const BLOCK_EXAMPLES: { title: string; code: string; note?: string }[] = [
  {
    title: "Headings",
    code: "# Heading one\n## Heading two\n### Heading three",
    note: "Up to six hashes. The outline and the table of contents are built from these, so use them in order.",
  },
  {
    title: "Paragraphs",
    code: "One paragraph.\n\nAnother, after a blank line.",
    note: "A blank line ends a paragraph. A single line break inside one becomes a line break, not a new paragraph.",
  },
  {
    title: "Bulleted list",
    code: "- First\n- Second\n  - Nested, by two spaces\n- Third",
  },
  {
    title: "Numbered list",
    code: "1. First\n2. Second\n3. Third",
    note: "`1)` works as well as `1.`",
  },
  {
    title: "Task list",
    code: "- [x] Done\n- [ ] Still to do",
  },
  {
    title: "Quote",
    code: "> Somebody else's words.",
  },
  {
    title: "Code block",
    code: "```js\nconst answer = 42;\n```",
    note: "The word after the fence names the language. Three backticks, or three tildes if the code itself holds backticks.",
  },
  {
    title: "Table",
    code: "| Item | Cost |\n| --- | ---: |\n| Paper | 12 |\n| Ink | 40 |",
    note: "The second row sets the columns. A colon on the right of its dashes right-aligns that column; one on each side centres it.",
  },
  {
    title: "Divider",
    code: "---",
    note: "Three or more dashes, asterisks or underscores on a line of their own.",
  },
  {
    title: "Image on its own",
    code: '![The 2026 team](/uploads/media/team.jpg "Hover text")',
    note: "An image alone on a line becomes a figure. The same thing inside a sentence stays inline.",
  },
];

export function MarkdownHelpButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Markdown help
      </button>

      {open ? (
        <ModalPortal>
          <div
            className="style-modal-backdrop"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              className="style-modal is-wide"
              role="dialog"
              aria-modal="true"
              aria-label="Markdown help"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <div className="style-modal-form">
                <div className="style-modal-header">
                  <strong>Markdown help</strong>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="style-modal-body">
                  <p className="help-text">
                    Everything this editor understands, and nothing it does not
                    — each result below is the example run through the same
                    parser the document uses.
                  </p>

                  <h4 className="inspector-title">Inside a line</h4>
                  <ul className="md-help">
                    {INLINE_EXAMPLES.map((entry) => (
                      <li key={entry.code} className="md-help-row">
                        <code className="md-help-code">{entry.code}</code>
                        <div className="md-help-result">
                          <Inline text={entry.code} />
                        </div>
                        {entry.note ? (
                          <p className="help-text md-help-note">
                            <Inline text={entry.note} />
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  <h4 className="inspector-title">Whole blocks</h4>
                  <ul className="md-help">
                    {BLOCK_EXAMPLES.map((entry) => (
                      <li key={entry.title} className="md-help-row">
                        <div className="md-help-block">
                          <span className="field-label">{entry.title}</span>
                          <pre className="md-help-code">{entry.code}</pre>
                        </div>
                        <div className="md-help-result">
                          <DocContent blocks={parseMarkdownBlocks(entry.code)} />
                        </div>
                        {entry.note ? (
                          <p className="help-text md-help-note">
                            <Inline text={entry.note} />
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  <h4 className="inspector-title">At the very top</h4>
                  <p className="help-text">
                    A block fenced by <code>---</code> before anything else sets
                    the page&rsquo;s own fields rather than appearing in it:
                  </p>
                  <pre className="md-help-code">
                    {'---\ntitle: Getting started\nsummary: What to read first\n---'}
                  </pre>

                  <h4 className="inspector-title">Raw HTML</h4>
                  <p className="help-text">
                    A line starting with <code>&lt;</code> is kept as written
                    and passed through untouched. Useful for the one thing
                    markdown cannot say, and worth avoiding otherwise — it is
                    the only part of a document the outline cannot read.
                  </p>
                </div>

                <div className="style-modal-footer">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
