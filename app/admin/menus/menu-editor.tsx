"use client";

import { useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import {
  MENU_ITEM_VISIBILITY_MODES,
  MENU_TARGET_LABELS,
  MENU_TARGET_TYPES,
  MENU_VISIBILITY_LABELS,
  blankMenuItem,
  type MenuContentType,
  type MenuItem,
  type MenuRecord,
  type MenuTargetType,
  type MenuVisibility,
  type MenuVisibilityMode,
} from "@/lib/menu-types";
import type { RoleKind } from "@/lib/permissions";

import { deleteMenuAction, saveMenuAction } from "./actions";

export type TargetOption = { _id: string; label: string; href: string };
export type MenuRoleOption = { _id: string; name: string; kind: RoleKind };

export function MenuEditor({
  menu,
  targets,
  roles,
}: {
  menu: MenuRecord;
  /** Published content, per type, for the link picker. */
  targets: Record<MenuContentType, TargetOption[]>;
  roles: MenuRoleOption[];
}) {
  const [name, setName] = useState(menu.name);
  const [items, setItems] = useState<MenuItem[]>(menu.items);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", menu._id);
      formData.set("name", name);
      formData.set("items", JSON.stringify(items));

      const outcome = await saveMenuAction(formData);
      setResult({
        ok: outcome.ok,
        message: outcome.ok ? "Menu saved." : outcome.error ?? "Could not save that.",
      });
    });
  }

  function remove() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", menu._id);
      const outcome = await deleteMenuAction(formData);
      if (outcome && !outcome.ok) {
        setResult({ ok: false, message: outcome.error ?? "Could not delete that." });
      }
    });
  }

  const patch = (index: number, changes: Partial<MenuItem>) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...changes } : item))
    );

  const move = (index: number, by: number) =>
    setItems((current) => {
      const next = [...current];
      const to = index + by;
      if (to < 0 || to >= next.length) return current;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  return (
    <>
      {result ? (
        <div className={`admin-notice${result.ok ? "" : " is-error"}`}>
          {result.message}
        </div>
      ) : null}

      <Panel title="Menu">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="menu-name">Name</label>
            <input
              id="menu-name"
              type="text"
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              readOnly={menu.isSite}
            />
            {menu.isSite ? (
              <span className="help-text">
                This is the header menu; its name is fixed.
              </span>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Items">
        <p className="help-text" style={{ marginTop: "-0.35rem" }}>
          A link points at published content or a web address. A group is not a
          link itself — it opens the items beneath it. Whoever cannot see an item
          cannot reach what it points at either.
        </p>

        {items.length === 0 ? (
          <p className="help-text">Nothing here yet. Add the first item below.</p>
        ) : null}

        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            targets={targets}
            roles={roles}
            first={index === 0}
            last={index === items.length - 1}
            onChange={(changes) => patch(index, changes)}
            onMove={(by) => move(index, by)}
            onRemove={() =>
              setItems((current) => current.filter((_, i) => i !== index))
            }
          />
        ))}

        <div className="admin-list-actions" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setItems((current) => [...current, blankMenuItem("link")])}
          >
            Add link
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setItems((current) => [...current, blankMenuItem("label")])}
          >
            Add group
          </button>
        </div>
      </Panel>

      <div className="admin-list-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save menu"}
        </button>
        {menu.isSite ? null : (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={pending}
            onClick={remove}
          >
            Delete menu
          </button>
        )}
      </div>
    </>
  );
}

function ItemRow({
  item,
  targets,
  roles,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  item: MenuItem;
  targets: Record<MenuContentType, TargetOption[]>;
  roles: MenuRoleOption[];
  first: boolean;
  last: boolean;
  onChange: (changes: Partial<MenuItem>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const isGroup = item.kind === "label";

  const patchChild = (index: number, changes: Partial<MenuItem>) =>
    onChange({
      children: item.children.map((child, i) =>
        i === index ? { ...child, ...changes } : child
      ),
    });

  return (
    <div className="menu-row">
      <div className="menu-row-top">
        <span className="badge">{isGroup ? "group" : "link"}</span>
        <div className="admin-list-actions" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label="Move down"
          >
            ↓
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div className="field-grid">
        <div className="field">
          <label>Label</label>
          <input
            type="text"
            value={item.label}
            onChange={(changeEvent) => onChange({ label: changeEvent.target.value })}
            placeholder={isGroup ? "Group name" : "Leave blank to use the page title"}
          />
        </div>
      </div>

      {isGroup ? (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={item.showCaret}
              onChange={(changeEvent) => onChange({ showCaret: changeEvent.target.checked })}
            />
            Show the dropdown arrow
          </label>

          <VisibilityField
            visibility={item.visibility}
            roles={roles}
            note="Hiding a group hides everything inside it."
            onChange={(visibility) => onChange({ visibility })}
          />

          <div className="menu-children">
            <p className="help-text">Items in this group</p>
            {item.children.map((child, index) => (
              <div key={child.id} className="menu-child-row">
                <div className="field-grid">
                  <div className="field">
                    <label>Label</label>
                    <input
                      type="text"
                      value={child.label}
                      onChange={(changeEvent) =>
                        patchChild(index, { label: changeEvent.target.value })
                      }
                    />
                  </div>
                </div>

                <TargetFields
                  item={child}
                  targets={targets}
                  onChange={(changes) => patchChild(index, changes)}
                />

                <VisibilityField
                  visibility={child.visibility}
                  roles={roles}
                  note="Narrowed further by the group above."
                  onChange={(visibility) => patchChild(index, { visibility })}
                />

                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    onChange({ children: item.children.filter((_, i) => i !== index) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                onChange({ children: [...item.children, blankMenuItem("link")] })
              }
            >
              Add item
            </button>
          </div>
        </>
      ) : (
        <>
          <TargetFields item={item} targets={targets} onChange={onChange} />
          <VisibilityField
            visibility={item.visibility}
            roles={roles}
            note="Also decides who may open what this points at."
            onChange={(visibility) => onChange({ visibility })}
          />
        </>
      )}
    </div>
  );
}

/** What a link points at: a published record, or a typed web address. */
function TargetFields({
  item,
  targets,
  onChange,
}: {
  item: MenuItem;
  targets: Record<MenuContentType, TargetOption[]>;
  onChange: (changes: Partial<MenuItem>) => void;
}) {
  const options =
    item.targetType === "url" ? [] : targets[item.targetType as MenuContentType] ?? [];

  return (
    <div className="field-grid">
      <div className="field">
        <label>Points at</label>
        <select
          value={item.targetType}
          onChange={(changeEvent) =>
            // Changing the kind of target abandons the old choice rather than
            // holding an id that means nothing in the new list.
            onChange({
              targetType: changeEvent.target.value as MenuTargetType,
              targetId: "",
              href: "",
            })
          }
        >
          {MENU_TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {MENU_TARGET_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {item.targetType === "url" ? (
        <div className="field">
          <label>Web address</label>
          <input
            type="text"
            value={item.href}
            onChange={(changeEvent) => onChange({ href: changeEvent.target.value })}
            placeholder="https://example.org"
          />
        </div>
      ) : (
        <div className="field">
          <label>{MENU_TARGET_LABELS[item.targetType]}</label>
          <select
            value={item.targetId}
            onChange={(changeEvent) => onChange({ targetId: changeEvent.target.value })}
          >
            <option value="">Choose one…</option>
            {options.map((option) => (
              <option key={option._id} value={option._id}>
                {option.label}
              </option>
            ))}
          </select>
          {options.length === 0 ? (
            <span className="help-text">
              Nothing published of this kind yet.
            </span>
          ) : null}
        </div>
      )}

      {item.targetType === "url" ? (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={item.newTab}
            onChange={(changeEvent) => onChange({ newTab: changeEvent.target.checked })}
          />
          Open in a new tab
        </label>
      ) : null}
    </div>
  );
}

/** Who may see this item, and therefore reach what it points at. */
function VisibilityField({
  visibility,
  roles,
  note,
  onChange,
}: {
  visibility: MenuVisibility;
  roles: MenuRoleOption[];
  note: string;
  onChange: (visibility: MenuVisibility) => void;
}) {
  const community = roles.filter((role) => role.kind === "community");
  const management = roles.filter((role) => role.kind === "management");

  const toggle = (roleId: string, on: boolean) =>
    onChange({
      mode: "roles",
      roleIds: on
        ? [...new Set([...visibility.roleIds, roleId])]
        : visibility.roleIds.filter((id) => id !== roleId),
    });

  return (
    <div className="field" style={{ marginTop: "0.6rem" }}>
      <label>Visible to</label>
      <select
        value={visibility.mode}
        onChange={(changeEvent) =>
          onChange({
            mode: changeEvent.target.value as MenuVisibilityMode,
            roleIds: visibility.roleIds,
          })
        }
      >
        {MENU_ITEM_VISIBILITY_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {MENU_VISIBILITY_LABELS[mode]}
          </option>
        ))}
      </select>
      <span className="help-text">{note}</span>

      {visibility.mode === "roles" ? (
        <>
          {community.length > 0 ? (
            <>
              <span className="field-label" style={{ marginTop: "0.5rem" }}>
                Membership levels
              </span>
              <div className="chip-picker">
                {community.map((role) => (
                  <label key={role._id} className="chip-option">
                    <input
                      type="checkbox"
                      checked={visibility.roleIds.includes(role._id)}
                      onChange={(changeEvent) =>
                        toggle(role._id, changeEvent.target.checked)
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </>
          ) : null}

          {management.length > 0 ? (
            <>
              <span className="field-label" style={{ marginTop: "0.5rem" }}>
                Management roles
              </span>
              <div className="chip-picker">
                {management.map((role) => (
                  <label key={role._id} className="chip-option">
                    <input
                      type="checkbox"
                      checked={visibility.roleIds.includes(role._id)}
                      onChange={(changeEvent) =>
                        toggle(role._id, changeEvent.target.checked)
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </>
          ) : null}

          {visibility.roleIds.length === 0 ? (
            <span className="help-text">
              Naming no roles would hide this from everyone, so it saves as
              visible to all until you choose some.
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
