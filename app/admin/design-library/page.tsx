import { AdminHeader, Panel } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { CustomShape, CustomStyle, FontFamily } from "@/lib/models";

import { normalizeSiteFont } from "@/lib/site-fonts";

import {
  deleteFontAction,
  deleteFontFaceAction,
  deleteShapeAction,
  deleteStyleAction,
  saveShapeAction,
} from "./actions";
import { FontSearch } from "./font-search";
import { FontUpload } from "./font-upload";
import { StyleForm } from "./style-form";

export const metadata = { title: "Design library" };

export default async function DesignLibraryPage() {
  await requirePermission("design.library");
  await connectDB();

  const [fonts, styles, shapes] = await Promise.all([
    FontFamily.find().sort({ family: 1 }).lean<any[]>(),
    CustomStyle.find().sort({ name: 1 }).lean<any[]>(),
    CustomShape.find().sort({ name: 1 }).lean<any[]>(),
  ]);

  const fontNames = fonts.map((font) => font.family as string);
  const fontRows = fonts.map((font) => ({
    _id: String(font._id),
    ...normalizeSiteFont(font),
  }));
  const serializedStyles = styles.map((style) => ({
    _id: String(style._id),
    name: style.name,
    slug: style.slug,
    style: style.style ?? {},
    hoverEnabled: Boolean(style.hoverEnabled),
    hoverStyle: style.hoverStyle ?? {},
    transitionDuration: style.transitionDuration ?? 200,
  }));

  return (
    <>
      <AdminHeader
        title="Design library"
        subtitle="Fonts, reusable named styles and custom SVG shapes."
      />

      <Panel title="Fonts">
        <ul className="admin-list" style={{ marginBottom: "1.25rem" }}>
          {fontRows.map((font) => (
            <li key={font._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontFamily: `"${font.family}", system-ui` }}>
                  {font.family}
                  {font.source === "file" ? (
                    <span className="badge" style={{ marginLeft: "0.5rem" }}>
                      uploaded
                    </span>
                  ) : null}
                </h3>
                <div className="admin-list-meta">
                  {font.category} · {font.variants.join(", ")}
                </div>

                {/* The files behind an uploaded family, each removable on its
                    own: a bold that came out wrong is replaced by uploading
                    another, and dropped by removing this one. */}
                {font.faces.length > 0 ? (
                  <ul className="font-faces">
                    {font.faces.map((face) => (
                      <li key={face.url}>
                        <span
                          style={{
                            fontFamily: `"${font.family}", system-ui`,
                            fontWeight: face.weight,
                            fontStyle: face.style,
                          }}
                        >
                          {font.family} {face.weight}
                          {face.style === "italic" ? " italic" : ""}
                        </span>
                        <code className="help-text">{face.originalName}</code>
                        <form action={deleteFontFaceAction}>
                          <input type="hidden" name="id" value={font._id} />
                          <input type="hidden" name="url" value={face.url} />
                          <button type="submit" className="btn btn-danger btn-sm">
                            Remove file
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="admin-list-actions">
                <form action={deleteFontAction}>
                  <input type="hidden" name="id" value={font._id} />
                  <button type="submit" className="btn btn-danger btn-sm">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
          {fonts.length === 0 ? <li className="admin-subtitle">No fonts added yet.</li> : null}
        </ul>

        <FontSearch />
      </Panel>

      <Panel title="Upload a font">
        <p className="help-text">
          A font file added here becomes a family like any other: it appears in
          the appearance editor, in named styles, and in every builder&rsquo;s font
          picker, and is served to the site from your own server.
        </p>
        <FontUpload families={fontNames} />
      </Panel>

      <Panel title="Named styles">
        <p className="help-text">
          Named styles are available in every builder and override a block&rsquo;s local
          text settings when selected.
        </p>

        {serializedStyles.map((style) => (
          <div
            key={style._id}
            style={{ borderTop: "1px solid var(--admin-border)", paddingTop: "0.75rem" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span className={`custom-style-${style.slug}`}>{style.name}</span>
              <code className="help-text">.custom-style-{style.slug}</code>
              <form action={deleteStyleAction} style={{ marginLeft: "auto" }}>
                <input type="hidden" name="id" value={style._id} />
                <button type="submit" className="btn btn-danger btn-sm">
                  Delete
                </button>
              </form>
            </div>
            <StyleForm style={style} fonts={fontNames} />
          </div>
        ))}

        <div style={{ borderTop: "1px solid var(--admin-border)", marginTop: "1rem", paddingTop: "0.75rem" }}>
          <h3 className="inspector-title">Add a style</h3>
          <StyleForm fonts={fontNames} />
        </div>
      </Panel>

      <Panel title="Custom shapes">
        <ul className="admin-list" style={{ marginBottom: "1.25rem" }}>
          {shapes.map((shape) => (
            <li key={String(shape._id)} className="admin-list-item">
              <svg
                viewBox={shape.viewBox}
                style={{ width: "2.5rem", height: "2.5rem" }}
                aria-hidden="true"
              >
                {(shape.paths ?? []).map((d: string, index: number) => (
                  <path key={index} d={d} fill="currentColor" />
                ))}
              </svg>
              <div>
                <h3>{shape.name}</h3>
                <div className="admin-list-meta">{shape.slug}</div>
              </div>
              <div className="admin-list-actions">
                <form action={deleteShapeAction}>
                  <input type="hidden" name="id" value={String(shape._id)} />
                  <button type="submit" className="btn btn-danger btn-sm">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
          {shapes.length === 0 ? <li className="admin-subtitle">No shapes yet.</li> : null}
        </ul>

        <form action={saveShapeAction}>
          <div className="field-grid">
            <div className="field">
              <label>Name</label>
              <input type="text" name="name" required />
            </div>
            <div className="field">
              <label>SVG file</label>
              <input type="file" name="svg" accept=".svg,image/svg+xml" />
            </div>
          </div>
          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label>…or paste SVG source</label>
            <textarea name="svgSource" rows={4} />
            <span className="help-text">
              Only the viewBox and path data are kept — scripts and styles are stripped.
            </span>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
            Add shape
          </button>
        </form>
      </Panel>
    </>
  );
}
