import { getUserAccess } from "@/lib/access";
import {
  CONTENT_STATE_LABELS,
  contentPermissions,
  missingFacets,
} from "@/lib/content-access";
import { getRoleSummaries } from "@/lib/members";
import { getSession } from "@/lib/session";
import { loadSiteMap } from "@/lib/site-map";
import { countNodes } from "@/lib/site-tree";

import { SiteCanvas } from "./site-canvas";

export const metadata = { title: "Site content" };

/**
 * The site as a diagram, from the home page down.
 *
 * Everything here is read for this one viewer: a branch they may not see is not
 * in the tree at all, and a node they may see but not change comes back marked
 * so. That happens on the server rather than in the canvas, so nothing they are
 * not allowed to know about is ever sent to their browser.
 */
export default async function ContentDashboard() {
  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = contentPermissions(permissions);

  const [map, roles] = await Promise.all([loadSiteMap(access), getRoleSummaries()]);

  const shown = countNodes(map.root);
  const hidden = map.totalNodes - shown;
  const missing = missingFacets(access);

  return (
    <>
      <header className="manager-header">
        <h1 className="member-title">Site content</h1>
        <p className="member-lede">
          The site as visitors move through it. The diagram is the site header
          menu, so rearranging it here changes the navigation itself.
        </p>
      </header>

      {missing.length > 0 ? (
        <p className="canvas-warning">
          You have not been given {missing.join(", nor ")}, so some of the site
          is not on this diagram.
        </p>
      ) : null}

      {hidden > 0 && missing.length === 0 ? (
        <p className="canvas-warning">
          {hidden} item{hidden === 1 ? " is" : "s are"} not shown to you.
        </p>
      ) : null}

      {/* A site whose header has never been filled in shows one node and no
          obvious next move, so the next move is spelled out. */}
      {map.root.children.length === 0 && map.hiddenTop === 0 ? (
        <p className="canvas-warning">
          The site header has nothing in it yet, so the diagram is just the home
          page.{" "}
          {access.canArrange
            ? "Select the home page below to add a dropdown group or start a page under it."
            : "Somebody who can change the site navigation needs to add to it."}
        </p>
      ) : null}

      <SiteCanvas
        root={map.root}
        orphans={map.orphans}
        roles={roles.map((role) => ({ _id: role._id, name: role.name, kind: role.kind }))}
        canArrange={access.canArrange}
        // Creating a page here creates a draft, so the draft grant is what it
        // asks for on top of the type.
        canAddPages={access.editableTypes.includes("page") && access.edits.draft}
        // Everything new arrives as a draft, so the draft grant gates the lot.
        creatableTypes={access.edits.draft ? access.editableTypes : []}
      />

      <section className="member-card manager-card">
        <h2 className="member-card-title">Reading the diagram</h2>
        <ul className="canvas-legend">
          <li>
            <span className="canvas-dot is-public" /> Everyone can reach it
          </li>
          <li>
            <span className="canvas-dot is-protected" /> Restricted to signed-in
            people or named roles
          </li>
          <li>
            <span className="canvas-dot is-published" />{" "}
            {CONTENT_STATE_LABELS.published} — on the site now
          </li>
          <li>
            <span className="canvas-dot is-draft" /> {CONTENT_STATE_LABELS.draft} —
            written but not on the site
          </li>
          <li>
            <span className="canvas-swatch is-dangling" /> In the menu but not in
            the live header, because what it points at is not published
          </li>
        </ul>
        <p className="member-note">
          The site header shows one level of dropdowns, so the diagram is three
          deep: the home page, what sits beside it in the header, and what sits
          inside a group.
        </p>
      </section>
    </>
  );
}
