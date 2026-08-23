"use client";

import { useState } from "react";

import { StyleFields } from "@/components/style-editor";
import {
  DOC_BOX_ELEMENTS,
  DOC_ELEMENT_GROUPS,
  DOC_ELEMENT_LABELS,
  DOC_NAV_MODES,
  DOC_NAV_MODE_LABELS,
  DOC_TABLE_MODES,
  DOC_TABLE_MODE_LABELS,
  type DocElement,
  type DocElementStyles,
} from "@/lib/doc-style";
import {
  DOC_SLOT_LABELS,
  type DocPartSlot,
  type DocTemplateBlock,
} from "@/lib/doc-template-layout";
import type { PageBlock } from "@/lib/page-layout";
import type { StyleValues } from "@/lib/style-values";

import { CheckField, NumField, SelectField, TextField } from "./settings-fields";
import { blockStyleTarget, type OpenStyleEditor } from "./story-block-inspector";

/**
 * Settings for one documentation slot.
 *
 * The body slot carries a style per element kind, because a document's parts are
 * generated from markdown and have no blocks of their own to select — a heading
 * is a heading because the source said so, not because someone placed one.
 */
export function DocSlotInspector({
  block,
  update,
  onEditStyle,
  fonts,
}: {
  block: DocTemplateBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
  fonts: string[];
}) {
  const setElement = (element: DocElement, patch: Partial<StyleValues>) => {
    const styles: DocElementStyles = block.elementStyles ?? {};
    update({
      elementStyles: {
        ...styles,
        [element]: { ...(styles[element] ?? {}), ...patch },
      },
    } as Partial<PageBlock>);
  };

  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">{DOC_SLOT_LABELS[block.type]}</h4>

        <TextField
          label="Label"
          value={block.label ?? ""}
          onChange={(value) => update({ label: value } as Partial<PageBlock>)}
        />

        {block.type === "docToc" ? (
          <>
            <NumField
              label="Depth"
              value={block.depth ?? 0}
              min={0}
              max={6}
              onChange={(value) => update({ depth: value } as Partial<PageBlock>)}
            />
            <span className="help-text">0 shows the whole hierarchy.</span>
            <CheckField
              label="Only this document's branch"
              value={Boolean(block.branchOnly)}
              onChange={(value) => update({ branchOnly: value } as Partial<PageBlock>)}
            />
            <SelectField
              label="On a narrow screen"
              value={block.navMode ?? "dropdown"}
              options={DOC_NAV_MODES.map((mode) => ({
                value: mode,
                label: DOC_NAV_MODE_LABELS[mode],
              }))}
              onChange={(value) => update({ navMode: value } as Partial<PageBlock>)}
            />
            <span className="help-text">
              A sidebar is most of a phone&rsquo;s width, so collapsing it keeps the
              reading at the top of the screen.
            </span>
          </>
        ) : null}

        {block.type === "docOnThisPage" ? (
          <NumField
            label="Deepest heading"
            value={block.maxLevel ?? 3}
            min={1}
            max={6}
            onChange={(value) => update({ maxLevel: value } as Partial<PageBlock>)}
          />
        ) : null}

        {block.type === "docUpdated" ? (
          <SelectField
            label="Date format"
            value={block.dateFormat ?? "long"}
            options={[
              { value: "long", label: "August 21, 2026" },
              { value: "short", label: "Aug 21, 2026" },
              { value: "year", label: "2026" },
            ]}
            onChange={(value) => update({ dateFormat: value } as Partial<PageBlock>)}
          />
        ) : null}

        {block.type === "docContent" ? (
          <>
            <NumField
              label="Space between blocks"
              value={block.blockSpacing ?? 0}
              min={0}
              max={8}
              step={0.25}
              onChange={(value) => update({ blockSpacing: value } as Partial<PageBlock>)}
            />
            <span className="help-text">0 uses the stylesheet&rsquo;s own rhythm.</span>
            <SelectField
              label="Tables on a narrow screen"
              value={block.tableMode ?? "stack"}
              options={DOC_TABLE_MODES.map((mode) => ({
                value: mode,
                label: DOC_TABLE_MODE_LABELS[mode],
              }))}
              onChange={(value) => update({ tableMode: value } as Partial<PageBlock>)}
            />
            <span className="help-text">
              A stacked row repeats each column heading beside its value, so the
              table still reads as data rather than a run of loose strings.
            </span>
          </>
        ) : null}
      </div>

      {/* Every slot carries its own container style, opened through the shared
          popup like any other block. */}
      <div className="inspector-section">
        <h4 className="inspector-title">Slot style</h4>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onEditStyle(blockStyleTarget(block, "Slot style"), update)}
        >
          Edit style…
        </button>
        <p className="help-text">
          {block.styleSlug
            ? `Using the “${block.styleSlug}” named style.`
            : "Dresses the slot as a whole."}
        </p>
      </div>

      {/* The parts inside a slot. A contents tree and a pagination pair are each
          several elements, and dressing the slot as a whole cannot reach them. */}
      {block.type === "docToc" ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Contents parts</h4>
          <PartStyleButton
            label="Link"
            note="Every link in the tree, at every depth."
            slot="linkStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
          <PartStyleButton
            label="Dropdown control"
            note="The closed bar the contents fold into on a narrow screen."
            slot="dropdownStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
          <PartStyleButton
            label="Dropdown panel"
            note="The box that control opens."
            slot="panelStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
          {(block.navMode ?? "dropdown") !== "dropdown" ? (
            <span className="help-text">
              The contents are set to stay a plain list, so the dropdown styles
              have nothing to dress until that changes.
            </span>
          ) : null}
        </div>
      ) : null}

      {block.type === "docPrevNext" ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Button style</h4>
          <PartStyleButton
            label="Buttons"
            note="Both halves of the pair, so the foot of the page stays even."
            slot="buttonStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
        </div>
      ) : null}

      {block.type === "docContent" ? (
        <>
          <div className="inspector-section">
            <h4 className="inspector-title">Document elements</h4>
            <span className="help-text">
              Each part of the body, styled where it is generated rather than
              where it is placed.
            </span>
          </div>

          {DOC_ELEMENT_GROUPS.map((group) => (
            <div key={group.label} className="inspector-section">
              <h4 className="inspector-title">{group.label}</h4>
              {group.elements.map((element) => (
                <ElementRow
                  key={element}
                  element={element}
                  values={block.elementStyles?.[element] ?? {}}
                  fonts={fonts}
                  onChange={(patch) => setElement(element, patch)}
                />
              ))}
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}

/** One element, collapsed until opened — seventeen expanded at once is unusable. */
function ElementRow({
  element,
  values,
  fonts,
  onChange,
}: {
  element: DocElement;
  values: StyleValues;
  fonts: string[];
  onChange: (patch: Partial<StyleValues>) => void;
}) {
  const [open, setOpen] = useState(false);
  const touched = Object.keys(values).length > 0;

  return (
    <div className="calendar-slot">
      <button
        type="button"
        className="calendar-slot-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{DOC_ELEMENT_LABELS[element]}</span>
        {touched ? <span className="badge">set</span> : null}
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="calendar-slot-body">
          <StyleFields
            values={values}
            fonts={fonts}
            // Boxes rather than text, so typography would have nothing to act on.
            showTypography={!DOC_BOX_ELEMENTS.includes(element)}
            onChange={onChange}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One part of a slot, styled through the shared popup.
 *
 * The popup writes straight back to the block under the given keys, which is
 * why the slot names have to match the ones `normalizeDocTemplateBlock` reads.
 */
function PartStyleButton({
  label,
  note,
  slot,
  block,
  update,
  onEditStyle,
}: {
  label: string;
  note: string;
  slot: DocPartSlot;
  block: DocTemplateBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
}) {
  const slugKey = `${slot}Slug` as const;
  const slug = block[slugKey];
  const values = block[slot];
  const styled = Boolean(slug) || Object.keys(values ?? {}).length > 0;

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onEditStyle(
            {
              title: `${label} style`,
              slugKey,
              valuesKey: slot,
              slug,
              values,
              // The panel is a box around the links; the rest carry text of
              // their own, so typography has something to act on.
              showTypography: slot !== "panelStyle",
            },
            update
          )
        }
      >
        Edit style…
      </button>
      <span className="help-text">
        {slug ? `Using the “${slug}” named style.` : styled ? "Styled on this slot." : note}
      </span>
      {styled ? (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            update({ [slugKey]: "", [slot]: undefined } as Partial<PageBlock>)
          }
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
