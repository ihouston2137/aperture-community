"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ModalPortal } from "@/components/modal-portal";
import {
  CONTENT_AUDIENCE_LABELS,
  CONTENT_STATE_LABELS,
  CONTENT_TYPES,
  contentTypeMeta,
  type ContentAudience,
} from "@/lib/content-access";
import { PUBLICATION_KINDS } from "@/lib/publication-layout";
import {
  MENU_VISIBILITY_LABELS,
  MENU_VISIBILITY_MODES,
  type MenuContentType,
  type MenuVisibility,
  type MenuVisibilityMode,
} from "@/lib/menu-types";
import type { RoleKind } from "@/lib/permissions";
import type { CatalogueEntry } from "@/lib/site-map";
import {
  NODE_H,
  NODE_W,
  canDropUnder,
  dropIndexAt,
  findNode,
  layoutTree,
  moveInTree,
  type SiteNode,
} from "@/lib/site-tree";

import {
  addGroupAction,
  createContentAction,
  createPageAction,
  detachNodeAction,
  linkContentAction,
  moveNodeAction,
  setContentVisibilityAction,
  setVisibilityAction,
} from "./actions";

/**
 * The site as a flow diagram you can work in.
 *
 * The hierarchy on this canvas is the site header menu, so rearranging it
 * rearranges the site's navigation — there is no second structure kept in step
 * with the first. The home page is the root because that is where a visitor
 * starts; everything else hangs off it in the order the header shows.
 *
 * Three things are deliberate about how it moves.
 *
 * **Positions are computed, never stored.** A node has no coordinates of its
 * own; `layoutTree` derives the whole picture from the tree every time it
 * changes. So the diagram can never drift out of agreement with the site, and
 * there is no saved layout to migrate when the shape changes underneath it.
 *
 * **A drop is applied twice.** The canvas moves the node the moment you let go,
 * so the diagram settles immediately; the server then does the same move
 * against the stored menu and has the final say. If it refuses, the old tree
 * goes back and it says why.
 *
 * **The wheel scrolls and ctrl-wheel zooms**, which is what the browser already
 * means by those gestures — a trackpad pinch arrives as ctrl-wheel, so pinching
 * zooms without anything special. Plain-wheel zoom would make the page fight
 * the canvas for every scroll.
 */

/**
 * A role the visibility rules can name.
 *
 * `kind` is carried because the two kinds are not interchangeable to the person
 * choosing: a membership level is what a member *is*, a management role is what
 * a member *does*. The rules do not care which grants the access — but somebody
 * picking who a section is for is answering one of those two questions, not
 * both at once, so the picker keeps them apart.
 */
export type CanvasRole = { _id: string; name: string; kind: RoleKind };

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;

type View = { x: number; y: number; scale: number };
type Message = { ok: boolean; text: string } | null;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function SiteCanvas({
  root,
  orphans,
  roles,
  canArrange,
  canAddPages,
  creatableTypes,
}: {
  root: SiteNode;
  orphans: CatalogueEntry[];
  roles: CanvasRole[];
  canArrange: boolean;
  /** Whether "new page here" is offered: pages.manage plus the draft grant. */
  canAddPages: boolean;
  /** The kinds this person may start something new of. */
  creatableTypes: MenuContentType[];
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement | null>(null);

  const [tree, setTree] = useState(root);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState("home");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  /**
   * The server is the record.
   *
   * Between letting go of a node and the save coming back, `tree` is the
   * canvas's own optimistic copy. Once the page has re-rendered with a fresh
   * `root`, that copy is thrown away and the server's answer takes over —
   * adjusted during render rather than in an effect, so the diagram never
   * paints the stale shape for a frame first.
   */
  const [renderedRoot, setRenderedRoot] = useState(root);
  if (root !== renderedRoot) {
    setRenderedRoot(root);
    setTree(root);
  }

  const placement = useMemo(() => layoutTree(tree), [tree]);
  const placed = useMemo(
    () => new Map(placement.nodes.map((entry) => [entry.node.id, entry])),
    [placement]
  );

  const selected = findNode(tree, selectedId) ?? tree;

  /* ------------------------------------------------------------ Viewport */

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      // Keep whatever is under the pointer under the pointer.
      const ratio = scale / current.scale;
      return {
        scale,
        x: px - (px - current.x) * ratio,
        y: py - (py - current.y) * ratio,
      };
    });
  }, []);

  const fit = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;

    // Never enlarged past life size: a three-node site blown up to fill the
    // frame reads as a mistake rather than as a small site.
    const scale = clamp(
      Math.min(rect.width / placement.width, rect.height / placement.height),
      MIN_SCALE,
      1
    );
    setView({
      scale,
      x: (rect.width - placement.width * scale) / 2,
      y: Math.max(0, (rect.height - placement.height * scale) / 2),
    });
  }, [placement.width, placement.height]);

  // Fitted once, on the first paint that has a frame to measure. Not on every
  // change: re-fitting after a drag would throw away where somebody had panned.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    fit();
  }, [fit]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // The wheel zooms, whether or not ctrl is held — a trackpad pinch arrives
      // as ctrl-wheel, so pinching lands here too and means the same thing.
      // Panning is dragging; there is nothing on this canvas to scroll past.
      zoomAt(Math.exp(-event.deltaY * 0.0022), event.clientX, event.clientY);
    };

    // Not passive: the canvas has to be able to keep the page from scrolling
    // out from under a gesture aimed at the diagram.
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ------------------------------------------------------------ Dragging */

  type Drag = {
    id: string;
    /** Canvas units, so the ghost tracks the pointer at any zoom. */
    dx: number;
    dy: number;
    x: number;
    y: number;
    moved: boolean;
  };

  const [drag, setDrag] = useState<Drag | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return { x: 0, y: 0 };
      const rect = frame.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale,
      };
    },
    [view]
  );

  /** The node under a canvas point, ignoring the one being dragged. */
  const nodeAt = useCallback(
    (x: number, y: number, ignoreId: string): SiteNode | null => {
      for (const entry of placement.nodes) {
        if (entry.node.id === ignoreId) continue;
        if (
          x >= entry.x &&
          x <= entry.x + NODE_W &&
          y >= entry.y &&
          y <= entry.y + NODE_H
        ) {
          return entry.node;
        }
      }
      return null;
    },
    [placement]
  );

  const draggedNode = drag ? findNode(tree, drag.id) : null;
  const hoverTarget =
    drag && draggedNode && drag.moved
      ? nodeAt(drag.x, drag.y, drag.id)
      : null;
  const hoverVerdict =
    draggedNode && hoverTarget ? canDropUnder(draggedNode, hoverTarget) : null;

  // Window-level, so a drag that leaves the frame — which is most of them —
  // still tracks and still finishes.
  useEffect(() => {
    if (!drag && !pan) return;

    const onMove = (event: PointerEvent) => {
      if (pan) {
        setView((current) => ({
          ...current,
          x: current.x + event.movementX,
          y: current.y + event.movementY,
        }));
        return;
      }
      const point = toCanvas(event.clientX, event.clientY);
      setDrag((current) =>
        current ? { ...current, x: point.x, y: point.y, moved: true } : current
      );
    };

    const onUp = () => {
      setPan(null);
      setDrag((current) => {
        if (current) finishDrag(current);
        return null;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, pan, toCanvas, tree, placement]);

  function finishDrag(current: Drag) {
    const moving = findNode(tree, current.id);
    if (!moving) return;

    // Barely moved: that was a click on the node, not a drag of it.
    if (!current.moved) {
      setSelectedId(current.id);
      return;
    }

    const target = nodeAt(current.x, current.y, current.id);
    if (!target) return;

    const verdict = canDropUnder(moving, target);
    if (!verdict.allowed) {
      setMessage({ ok: false, text: verdict.reason });
      return;
    }

    const index = dropIndexAt(target, placed, current.x, current.id);
    const previous = tree;
    setTree(moveInTree(tree, current.id, target.id, index));
    setMessage(null);

    startTransition(async () => {
      const outcome = await moveNodeAction(current.id, target.id, index);
      if (!outcome.ok) {
        setTree(previous);
        setMessage({ ok: false, text: outcome.error ?? "That move was refused." });
        return;
      }
      setMessage({
        ok: true,
        text: `“${moving.label}” now sits under “${target.label}”.`,
      });
      router.refresh();
    });
  }

  /* ------------------------------------------------------------- Changes */

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setMessage(null);
    startTransition(async () => {
      const outcome = await work();
      setMessage({
        ok: outcome.ok,
        text: outcome.ok ? done : outcome.error ?? "That could not be done.",
      });
      if (outcome.ok) router.refresh();
    });
  }

  /* ------------------------------------------------------------ Rendering */

  const scaleLabel = `${Math.round(view.scale * 100)}%`;

  return (
    <div className="canvas-shell">
      <div className="canvas-bar">
        <div className="canvas-bar-group">
          <button
            type="button"
            className="btn btn-sm"
            onClick={(event) => zoomAt(1 / 1.2, event.clientX, event.clientY)}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="canvas-zoom" aria-live="polite">
            {scaleLabel}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={(event) => zoomAt(1.2, event.clientX, event.clientY)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" className="btn btn-sm" onClick={fit}>
            Fit
          </button>
        </div>

        <p className="canvas-hint help-text">
          Drag the background to move · scroll or pinch to zoom
          {canArrange ? " · drag a node onto a group to move it" : ""}
        </p>

        {pending ? <span className="canvas-saving help-text">Saving…</span> : null}
      </div>

      {message ? (
        <p className={`canvas-message${message.ok ? " is-ok" : " is-error"}`} role="status">
          {message.text}
        </p>
      ) : null}

      {/* The diagram and the thing you have selected in it, side by side. The
          inspector is a column rather than a band underneath so that selecting
          a node does not push the graph you are reading off the screen. */}
      <div className="canvas-split">
        <div
          ref={frameRef}
          className={`canvas-frame${pan ? " is-panning" : ""}`}
          onPointerDown={(event) => {
            // Only a press on the background pans; a press on a node is that
            // node's own gesture and stops before it reaches here.
            if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains("canvas-stage")) {
              return;
            }
            setSelectedId("home");
            setPan({ x: event.clientX, y: event.clientY });
          }}
        >
          <div
            className="canvas-stage"
            style={{
              width: placement.width,
              height: placement.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          >
            <svg
              className="canvas-edges"
              width={placement.width}
              height={placement.height}
              aria-hidden="true"
            >
              {placement.edges.map((edge) => {
                // An S-curve rather than an elbow: it reads as flow, and it makes
                // which child belongs to which parent legible where they crowd.
                const midY = (edge.y1 + edge.y2) / 2;
                return (
                  <path
                    key={edge.id}
                    className="canvas-edge"
                    d={`M ${edge.x1} ${edge.y1} C ${edge.x1} ${midY}, ${edge.x2} ${midY}, ${edge.x2} ${edge.y2}`}
                  />
                );
              })}
            </svg>

            {placement.nodes.map((entry) => {
              const node = entry.node;
              const isDragging = drag?.id === node.id && drag.moved;
              const isTarget = hoverTarget?.id === node.id;
              const draggable = canArrange && node.editable && node.kind !== "home";

              return (
                <div
                  key={node.id}
                  className={[
                    "canvas-node",
                    `is-${node.kind}`,
                    `is-${node.audience}`,
                    `is-${node.state}`,
                    node.id === selectedId ? "is-selected" : "",
                    isDragging ? "is-dragging" : "",
                    isTarget && hoverVerdict?.allowed ? "is-drop-ok" : "",
                    isTarget && hoverVerdict && !hoverVerdict.allowed ? "is-drop-no" : "",
                    node.danglingLink ? "is-dangling" : "",
                    draggable ? "is-draggable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: entry.x,
                    top: entry.y,
                    width: NODE_W,
                    height: NODE_H,
                    transform:
                      isDragging && drag
                        ? `translate(${drag.x - entry.x - NODE_W / 2}px, ${
                            drag.y - entry.y - NODE_H / 2
                          }px)`
                        : undefined,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(node.id);
                    if (!draggable) return;
                    const point = toCanvas(event.clientX, event.clientY);
                    setDrag({
                      id: node.id,
                      dx: point.x - entry.x,
                      dy: point.y - entry.y,
                      x: point.x,
                      y: point.y,
                      moved: false,
                    });
                  }}
                >
                  <div className="canvas-node-head">
                    <span className="canvas-node-kind">{kindLabel(node)}</span>
                    <span className={`canvas-dot is-${node.audience}`} title={audienceTitle(node.audience)} />
                    <span className={`canvas-dot is-${node.state}`} title={CONTENT_STATE_LABELS[node.state]} />
                  </div>
                  <strong className="canvas-node-title">{node.label}</strong>
                  <span className="canvas-node-meta">{node.meta}</span>
                  {node.hiddenChildren > 0 ? (
                    <span className="canvas-node-hidden">
                      +{node.hiddenChildren} not shown to you
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="canvas-side">
          <NodePanel
            key={`${selected.id}:${selected.visibility.mode}:${selected.visibility.roleIds.join(",")}`}
            node={selected}
            roles={roles}
            canArrange={canArrange}
            canAddPages={canAddPages}
            pending={pending}
            onAddGroup={(label) =>
              run(() => addGroupAction("home", label), "Group added.")
            }
            onCreatePage={(title) =>
              run(
                () => createPageAction(selected.id === "home" ? "home" : selected.id, title),
                "Page created as a draft and added to the navigation."
              )
            }
            onDetach={() =>
              run(() => detachNodeAction(selected.id), "Taken out of the navigation.")
            }
            onVisibility={(mode, roleIds) =>
              run(
                () => setVisibilityAction(selected.id, mode, roleIds),
                "Who can see this link has been changed."
              )
            }
            onContentVisibility={(targetType, targetId, mode, roleIds) =>
              run(
                () => setContentVisibilityAction(targetType, targetId, mode, roleIds),
                "Who can see this content has been changed."
              )
            }
          />
        </aside>
      </div>

      <ContentTray
        orphans={orphans}
        tree={tree}
        roles={roles}
        canArrange={canArrange}
        creatableTypes={creatableTypes}
        pending={pending}
        onLink={(parentId, entry) =>
          run(
            () => linkContentAction(parentId, entry.type, entry._id, entry.label),
            `“${entry.label}” is now in the navigation.`
          )
        }
        onCreate={(type, title, kind) =>
          run(() => createContentAction(type, title, kind), `“${title}” created as a draft.`)
        }
        onContentVisibility={(entry, mode, roleIds) =>
          run(
            () => setContentVisibilityAction(entry.type, entry._id, mode, roleIds),
            `Who can see “${entry.label}” has been changed.`
          )
        }
      />

    </div>
  );
}

/* ----------------------------------------------------------- The inspector */

function NodePanel({
  node,
  roles,
  canArrange,
  canAddPages,
  pending,
  onAddGroup,
  onCreatePage,
  onDetach,
  onVisibility,
  onContentVisibility,
}: {
  node: SiteNode;
  roles: CanvasRole[];
  canArrange: boolean;
  canAddPages: boolean;
  pending: boolean;
  onAddGroup: (label: string) => void;
  onCreatePage: (title: string) => void;
  onDetach: () => void;
  onVisibility: (mode: string, roleIds: string[]) => void;
  onContentVisibility: (
    targetType: MenuContentType,
    targetId: string,
    mode: string,
    roleIds: string[]
  ) => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  // Seeded from the rule as stored, not from `audience` — that is the narrowed
  // answer, so it cannot tell "anyone signed in" from "these roles" and knows
  // no role ids at all. Reopening a restricted group used to offer to save it
  // back as signed-in-only with its roles dropped.
  const holdsItems = node.kind === "home" || node.kind === "group";
  const meta = node.targetType ? contentTypeMeta(node.targetType) : null;

  /**
   * This item asks for nothing, but is reached through a group that does.
   *
   * Worth saying out loud, because the control below edits this item's own rule
   * and would otherwise read "Everyone" directly under an audience of
   * "Restricted" — which looks like a contradiction rather than inheritance.
   */
  const inherited = node.visibility.mode === "public" && node.audience === "protected";

  return (
    <section className="member-card manager-card canvas-panel">
      <div className="manager-card-head">
        <h2 className="member-card-title">{node.label}</h2>
        <span className="help-text">
          {kindLabel(node)}
          {meta ? ` · ${meta.noun}` : ""}
        </span>
      </div>

      <dl className="member-facts">
        <dt>Address</dt>
        <dd>{node.href || "—"}</dd>
        <dt>Audience</dt>
        <dd>
          {audienceTitle(node.audience)}
          {inherited ? " — from the group above" : ""}
        </dd>
        <dt>State</dt>
        <dd>{CONTENT_STATE_LABELS[node.state]}</dd>
        <dt>You may</dt>
        <dd>{node.editable ? "change this" : "look at this only"}</dd>
      </dl>

      {node.danglingLink ? (
        <p className="canvas-warning">
          {node.kind === "home"
            ? "No page is set as the home page, so the site has no front door."
            : node.href
              ? "This points at something that is not live, so the site header leaves it out."
              : "This points at something that no longer exists, so the site header leaves it out."}
        </p>
      ) : null}

      <div className="member-actions">
        {node.editHref ? (
          <Link className="btn btn-sm btn-primary" href={node.editHref}>
            {node.kind === "home" ? "Edit the home page" : "Open the editor"}
          </Link>
        ) : null}
        {node.href ? (
          <Link className="btn btn-sm" href={node.href} target="_blank">
            View
          </Link>
        ) : null}
        {canArrange && node.editable && node.kind !== "home" ? (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={onDetach}>
            Take out of navigation
          </button>
        ) : null}
      </div>

      {canArrange && node.editable && node.kind !== "home" ? (
        <VisibilityForm
          heading="Who can see this link"
          roles={roles}
          value={node.visibility}
          pending={pending}
          onApply={onVisibility}
          note={
            inherited
              ? "This link asks for nothing on its own; it is restricted because of the group it sits in, and opening it here will not open that group."
              : "Restricting the way in restricts what it leads to — the site enforces this on the content, not only on the link."
          }
        />
      ) : null}

      {/* The record's own rule, which is a different sentence from the link's:
          "this page is for members" rather than "this link is for members".
          Both are enforced, so both are offered rather than leaving somebody to
          guess which one made a node restricted. */}
      {canArrange && node.editable && node.targetType && node.targetId ? (
        <VisibilityForm
          heading={`Who can see this ${meta?.noun ?? "content"}`}
          roles={roles}
          value={node.contentVisibility}
          pending={pending}
          onApply={(mode, roleIds) =>
            onContentVisibility(node.targetType!, node.targetId, mode, roleIds)
          }
          note="Applies wherever this is reached from, including addresses typed straight in."
        />
      ) : null}

      {canArrange && holdsItems ? (
        <div className="canvas-adds">
          {node.kind === "home" ? (
            <div className="canvas-field">
              <label htmlFor="canvas-group">Add a dropdown group</label>
              <div className="canvas-field-row">
                <input
                  id="canvas-group"
                  type="text"
                  value={groupName}
                  placeholder="About"
                  onChange={(event) => setGroupName(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending || !groupName.trim()}
                  onClick={() => onAddGroup(groupName)}
                >
                  Add
                </button>
              </div>
            </div>
          ) : null}

          {canAddPages ? (
            <div className="canvas-field">
              <label htmlFor="canvas-page">Start a page here</label>
              <div className="canvas-field-row">
                <input
                  id="canvas-page"
                  type="text"
                  value={pageTitle}
                  placeholder="Our history"
                  onChange={(event) => setPageTitle(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending || !pageTitle.trim()}
                  onClick={() => onCreatePage(pageTitle)}
                >
                  Create
                </button>
              </div>
              <p className="help-text">
                Created as a draft, so it is on the diagram before it is on the
                site.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One "who can see this" control.
 *
 * Shared by the inspector and the tray's popup, and used for both rules — the
 * menu item's and the record's own — because they are the same question about
 * different things. Seeded from `value` and remounted by its caller when that
 * changes, so it never has to reset itself behind the user.
 */
function VisibilityForm({
  heading,
  roles,
  value,
  pending,
  note,
  onApply,
}: {
  heading: string;
  roles: CanvasRole[];
  value: MenuVisibility;
  pending: boolean;
  note?: string;
  onApply: (mode: string, roleIds: string[]) => void;
}) {
  const [mode, setMode] = useState<MenuVisibilityMode>(value.mode);
  const [roleIds, setRoleIds] = useState<string[]>(value.roleIds);

  const toggleRole = (roleId: string, on: boolean) =>
    setRoleIds((current) =>
      on ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId)
    );

  // Nothing to save yet: saying so is friendlier than a button that appears to
  // do nothing when pressed.
  const unchanged =
    mode === value.mode &&
    roleIds.length === value.roleIds.length &&
    roleIds.every((id) => value.roleIds.includes(id));

  return (
    <div className="canvas-field">
      <label htmlFor={`vis-${heading}`}>{heading}</label>
      <div className="canvas-field-row">
        <select
          id={`vis-${heading}`}
          value={mode}
          onChange={(event) => setMode(event.target.value as MenuVisibilityMode)}
        >
          {MENU_VISIBILITY_MODES.map((option) => (
            <option key={option} value={option}>
              {MENU_VISIBILITY_LABELS[option]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending || unchanged || (mode === "roles" && roleIds.length === 0)}
          onClick={() => onApply(mode, roleIds)}
        >
          {unchanged ? "Saved" : "Apply"}
        </button>
      </div>

      {mode === "roles" ? (
        <>
          <RolePicker
            heading="Membership levels"
            roles={roles.filter((role) => role.kind === "community")}
            chosen={roleIds}
            onToggle={toggleRole}
          />
          <RolePicker
            heading="Management roles"
            roles={roles.filter((role) => role.kind === "management")}
            chosen={roleIds}
            onToggle={toggleRole}
          />
          {roleIds.length === 0 ? (
            <p className="help-text">
              Naming no roles would hide this from everyone, so choose at least
              one.
            </p>
          ) : null}
        </>
      ) : null}

      {note ? <p className="help-text">{note}</p> : null}
    </div>
  );
}

function RolePicker({
  heading,
  roles,
  chosen,
  onToggle,
}: {
  heading: string;
  roles: CanvasRole[];
  chosen: string[];
  onToggle: (roleId: string, on: boolean) => void;
}) {
  if (roles.length === 0) return null;

  return (
    <>
      <span className="field-label canvas-role-heading">{heading}</span>
      <div className="chip-picker">
        {roles.map((role) => (
          <label key={role._id} className="chip-option">
            <input
              type="checkbox"
              checked={chosen.includes(role._id)}
              onChange={(event) => onToggle(role._id, event.target.checked)}
            />
            {role.name}
          </label>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- The tray */

/**
 * Everything the site navigation does not mention, by kind.
 *
 * Most of a site's content is never in the header — a story, a collection
 * linked from inside a page, last year's programme — so this is not a list of
 * mistakes to be cleared. It is the rest of the library, and it is organised by
 * kind because that is how somebody arrives at it: they are looking for a
 * story, not for "something unlinked".
 */
function ContentTray({
  orphans,
  tree,
  roles,
  canArrange,
  creatableTypes,
  pending,
  onLink,
  onCreate,
  onContentVisibility,
}: {
  orphans: CatalogueEntry[];
  tree: SiteNode;
  roles: CanvasRole[];
  canArrange: boolean;
  creatableTypes: MenuContentType[];
  pending: boolean;
  onLink: (parentId: string, entry: CatalogueEntry) => void;
  onCreate: (type: MenuContentType, title: string, kind: string) => void;
  onContentVisibility: (entry: CatalogueEntry, mode: string, roleIds: string[]) => void;
}) {
  // A tab per kind that holds something or that this person could add to, so
  // the row never offers an empty tab nobody can fill.
  const tabs = CONTENT_TYPES.filter(
    (meta) =>
      orphans.some((entry) => entry.type === meta.type) ||
      creatableTypes.includes(meta.type)
  );

  const [active, setActive] = useState<MenuContentType>(tabs[0]?.type ?? "page");
  const [filter, setFilter] = useState("");
  const [parentId, setParentId] = useState("home");
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<string>(PUBLICATION_KINDS[0]);
  const [editing, setEditing] = useState<CatalogueEntry | null>(null);

  // The open tab can stop existing when the data changes under it.
  const current = tabs.find((meta) => meta.type === active) ?? tabs[0] ?? null;

  const inTab = orphans.filter((entry) => entry.type === current?.type);
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? inTab.filter(
        (entry) =>
          entry.label.toLowerCase().includes(needle) ||
          entry.meta.toLowerCase().includes(needle)
      )
    : inTab;

  const parents = [
    { id: "home", label: "Top level" },
    ...tree.children
      .filter((child) => child.kind === "group" && child.editable)
      .map((child) => ({ id: child.id, label: child.label })),
  ];

  const mayCreate = current ? creatableTypes.includes(current.type) : false;

  return (
    <section className="member-card manager-card">
      <div className="manager-card-head">
        <h2 className="member-card-title">Not in the site navigation</h2>
        <span className="help-text">
          {orphans.length} item{orphans.length === 1 ? "" : "s"} nothing in the
          header links to
        </span>
      </div>

      {tabs.length === 0 || !current ? (
        <p className="member-note">
          There is nothing here you have been given to work with.
        </p>
      ) : (
        <>
          <div className="tray-tabs" role="tablist">
            {tabs.map((meta) => {
              const count = orphans.filter((entry) => entry.type === meta.type).length;
              const isActive = meta.type === current.type;
              return (
                <button
                  key={meta.type}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`tray-tab${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    setActive(meta.type);
                    // The filter and the half-typed title belonged to the tab
                    // being left; carrying them across would hide the new tab's
                    // contents for no reason anybody asked for.
                    setFilter("");
                    setNewTitle("");
                  }}
                >
                  {meta.label}
                  <span className="tray-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="tray-controls">
            <input
              type="search"
              className="tray-filter"
              value={filter}
              placeholder={`Filter ${current.label.toLowerCase()}…`}
              aria-label="Filter by title or address"
              onChange={(event) => setFilter(event.target.value)}
            />

            {canArrange && shown.length > 0 ? (
              <label className="canvas-parent-pick">
                Add to
                <select
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                >
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {mayCreate ? (
            <div className="tray-new">
              <input
                type="text"
                value={newTitle}
                placeholder={`New ${current.noun} title`}
                aria-label={`New ${current.noun} title`}
                onChange={(event) => setNewTitle(event.target.value)}
              />
              {current.type === "publication" ? (
                // A publication's shape is fixed once its pages exist, so the
                // kind is chosen before it is made rather than afterwards.
                <select
                  value={newKind}
                  aria-label="Publication kind"
                  onChange={(event) => setNewKind(event.target.value)}
                >
                  {PUBLICATION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={pending || !newTitle.trim()}
                onClick={() => {
                  onCreate(current.type, newTitle.trim(), newKind);
                  setNewTitle("");
                }}
              >
                Create
              </button>
              <span className="help-text">
                Made as a draft, and left out of the navigation.
              </span>
            </div>
          ) : null}

          {shown.length === 0 ? (
            <p className="member-note">
              {inTab.length === 0
                ? "Nothing of this kind sits outside the navigation."
                : `Nothing here matches “${filter}”.`}
            </p>
          ) : (
            <ul className="tray-cards">
              {shown.map((entry) => {
                const restricted = entry.visibility.mode !== "public";
                return (
                  <li key={`${entry.type}:${entry._id}`} className="tray-card">
                    <div className="tray-card-head">
                      <span
                        className={`canvas-dot is-${restricted ? "protected" : "public"}`}
                        title={restricted ? "Restricted" : "Everyone"}
                      />
                      <span
                        className={`content-state${
                          entry.state === "published" ? " is-live" : ""
                        }`}
                      >
                        {CONTENT_STATE_LABELS[entry.state]}
                      </span>
                    </div>

                    <Link href={entry.editHref} className="tray-card-title">
                      {entry.label}
                    </Link>
                    <span className="tray-card-meta">{entry.meta}</span>

                    <div className="tray-card-actions">
                      <Link className="btn btn-sm" href={entry.editHref}>
                        Edit
                      </Link>
                      {canArrange ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={pending}
                            onClick={() => onLink(parentId, entry)}
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setEditing(entry)}
                          >
                            Who can see
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {editing ? (
        <VisibilityDialog
          entry={editing}
          roles={roles}
          pending={pending}
          onClose={() => setEditing(null)}
          onApply={(mode, roleIds) => {
            onContentVisibility(editing, mode, roleIds);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** The "who can see this" popup, for one record in the tray. */
function VisibilityDialog({
  entry,
  roles,
  pending,
  onClose,
  onApply,
}: {
  entry: CatalogueEntry;
  roles: CanvasRole[];
  pending: boolean;
  onClose: () => void;
  onApply: (mode: string, roleIds: string[]) => void;
}) {
  // Escape closes it — the one keyboard affordance a dialog cannot do without.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Who can see ${entry.label}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="style-modal-form">
            <div className="style-modal-header">
              <strong>Who can see this</strong>
              <span className="help-text">{entry.label}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="style-modal-body">
              <VisibilityForm
                heading={`Who can see this ${contentTypeMeta(entry.type)?.noun ?? "item"}`}
                roles={roles}
                value={entry.visibility}
                pending={pending}
                onApply={onApply}
                note="Nothing in the site navigation points at this, so this rule is the whole of what restricts it — including for anybody who types the address straight in."
              />
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ------------------------------------------------------------------ Words */

function kindLabel(node: SiteNode): string {
  if (node.kind === "home") return "Home";
  if (node.kind === "group") return "Group";
  if (node.kind === "url") return "External";
  return contentTypeMeta(node.targetType!)?.label ?? "Content";
}

function audienceTitle(audience: ContentAudience): string {
  return audience === "public"
    ? "Everyone"
    : `Restricted (${CONTENT_AUDIENCE_LABELS.protected})`;
}
