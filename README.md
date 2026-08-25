# Aperture

A Next.js 16 community portal and site builder: member registration with
approval, configurable membership levels and management roles, plus a page
builder, form builder, story system, collections/galleries, a media library with
protected serving, a publication designer for zines/presentations/social posts,
and a design library of fonts, named styles and custom shapes.

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
always attached to the Administrator role. The same first run creates the
starting membership level and brings any pre-portal accounts up to date.

Registration, verification codes and password recovery all send email, so
configure SMTP under **Email** in the admin before opening registration.

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
- **Roles come in two kinds and do not share a vocabulary.** A `management`
  role grants admin permissions; a `community` role is a membership level —
  its name is the label a member wears and its permissions say what that level
  reaches in the portal. `permissionGroupsFor(kind)` in `lib/permissions.ts`
  decides which set a role may hold. Both kinds live in one `Role` collection
  and one `user.roleIds` list, split on read by `splitRoles()`.
- **An account that cannot sign in holds nothing.** `getUserAccess()` returns an
  empty permission set for a deactivated account or one whose membership is not
  `active`, rather than permissions checked again somewhere else.
- **The account corner is part of the chrome.** `SiteChrome` renders
  `AccountMenu` in the top right of every public page: a sign-in link that
  opens the popup, or the member initials with Dashboard / Site admin / Sign
  out behind them. It sits outside `.site-nav` so it keeps the corner when the
  links collapse behind the hamburger, and `site-chrome-preview.tsx` renders
  the same corner inert so the Appearance screen shows the real header.
- **The popup and the pages are one implementation.** `components/auth-dialog.tsx`
  mounts the very same `LoginForm`, `RegisterForm` and `ForgotPasswordForm`
  that `/login`, `/register` and `/forgot-password` render, passing an
  `idPrefix` so both copies can sit on one page. Anything in page-builder
  content marked `data-auth="signin" | "register" | "recover"` opens it too.
- **A menu decides who may reach what it points at.** Each item in `Menu` carries
  a visibility rule; `loadContentAccess()` gathers every rule across every menu
  and `guardContent()` enforces it on the page, story, collection, publication
  and documentation routes. Content no menu mentions stays unrestricted — this
  grants nothing, it only enforces what a menu already says. Where the same
  content is linked twice the widest rule wins, so adding a members-only link
  cannot quietly take a public page away from the public.
- **Menu items resolve their address on read.** An item stores a target type and
  an id, not a URL, so renaming a page moves every menu that links to it. A
  target that has been deleted or unpublished resolves to nothing and the item
  is dropped rather than linking to a 404.
- **Menus are filtered on the server.** `loadMenuFor()` returns only the items a
  viewer may see, so a restricted link is never in the markup to be found.
- **Three calendar slots are conditional on the event, not merely empty for it.**
  `calRsvpButton`, `calRsvpList` and `calAttendance` render nothing unless the
  event has `rsvpEnabled` / `attendanceEnabled` set, however the template is
  arranged — the builder is the exception, drawing them regardless so they can
  be placed and styled. `CALENDAR_SLOT_KINDS` also keeps the list and the
  register out of the event-box palette: a roster does not belong in every cell
  of a month view.
- **The attendance register is withheld on the server.** `getEventAttendanceAction`
  returns an empty roster to anyone without `attendance.view` or
  `attendance.record`, so a member is never sent the names and asked not to
  look. RSVP answers need the community permission `community.events.rsvp`.
- **One code engine, three flows.** Confirming an address, the second factor at
  sign-in and password recovery all issue one bcrypt-hashed six-digit code
  through `lib/verification.ts`, which bounds attempts and resends.

## Optional dependencies

MP4 export (`POST /api/admin/zines/export-mp4`) shells out to `ffmpeg`. Without
it on the PATH the route returns a `501` explaining what is missing; everything
else works unchanged.
