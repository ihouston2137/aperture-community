# Aperture

A Next.js 16 CMS and site builder: page builder, form builder, story system,
collections/galleries, a media library with protected serving, a publication
designer for zines/presentations/social posts, and a design library of fonts,
named styles and custom shapes.

## Getting started

```bash
cp .env.example .env.local   # then edit the values
npm run dev
```

`.env.local` values:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. |
| `NEXT_PUBLIC_SITE_URL` | Public origin, used for share links. |
| `SESSION_SECRET` | Signing key for the `aperture_session` JWT cookie. Required. |
| `SEED_ADMIN_EMAIL` | Email of the admin account created on first sign-in. |
| `SEED_ADMIN_PASSWORD` | Its temporary password — a change is forced at first sign-in. |

The seed admin is created the first time someone attempts to sign in, and is
always attached to the Administrator role.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint (flat config). |

## Architecture

```
app/            routes — public pages, /admin, and /api route handlers
components/     shared renderers: block primitives, builders, viewers
lib/            models, layout contracts, normalizers and helpers
public/uploads/ uploaded media, served only through /api/media
```

A few conventions worth knowing before changing things:

- **One renderer, two contexts.** Builder previews and public pages share the
  block components in `components/` and the CSS classes in `app/globals.css`.
  A change to a block's behaviour lands in both places at once — this is the
  single most important rule in the codebase.
- **Layouts are normalized, not migrated.** Page, form, story-template and
  publication layouts are stored as mixed JSON. Every read and every save runs
  through the `normalize*` helpers in `lib/`, which bound array sizes, sanitize
  media paths and rewrite rich text. Older document shapes are handled there
  too, so adding a setting rarely means touching the schema.
- **Sizes are rem.** Controls show a pixel-like scale, but everything is stored
  and rendered in rem so text and containers scale with the viewport — and, in
  publications, with the scaled canvas.
- **Named styles win.** When a block has a `styleSlug`, the generated
  `.custom-style-{slug}` class applies and the block's local text settings are
  ignored.
- **Local media is never linked directly.** `protectedMediaUrl()` rewrites
  `/uploads/**` and `/images/**` through `/api/media`, which enforces the
  allowed roots and handles range requests, ETags and caching.
- **Every admin page and route handler checks access** via `requireSession()`,
  `requirePermission()` or `checkPermission()`.

## Optional dependencies

MP4 export (`POST /api/admin/zines/export-mp4`) shells out to `ffmpeg`. Without
it on the PATH the route returns a `501` explaining what is missing; everything
else works unchanged.
