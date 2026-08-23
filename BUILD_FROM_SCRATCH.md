# Rebuild Guide for the OHS Wildcat Bands App

This file is a practical specification for rebuilding this application from scratch. It describes what the current app does, how the major modules fit together, which data contracts matter, and a recommended implementation order for another coding agent.

## 1. Product Summary

Build a Next.js CMS and site builder for an organization website. The app is not a marketing-only site. It is a full content management system with:

- Public website pages rendered from a custom page builder.
- Admin login, roles, permissions, and password management.
- A media library for images, video, audio, external embeds, metadata, tags, NSFW/safe-mode flags, and usage tracking.
- Page builder with rows, columns, nested containers, reusable saved container blocks, media/background controls, and many block types.
- Form builder with form fields, visual content blocks, an outline drag-and-drop panel, file uploads, submissions, and email notifications.
- Story system with rich content, media placements, authors/profiles, and custom story templates.
- Collection/gallery system with flexible display, overlays, lightbox/image-detail pages, sharing controls, and collection-level style overrides.
- Publication builder for zines, presentations, and social posts with fixed-size pages, repeated blocks, audio, slideshow settings, rich text, media, shapes, QR codes, and export helpers.
- Site design, site content, design library, custom styles, fonts, and custom SVG shapes.

## 2. Tech Stack

Use the same stack unless the user explicitly asks for a modernization:

- Next.js `16.2.10` with App Router.
- React `19.2.4`.
- TypeScript.
- MongoDB with Mongoose.
- Server Actions for most admin mutations.
- Route handlers for JSON APIs, uploads, protected media serving, and MP4 export.
- `jose` for JWT session cookies.
- `bcrypt-ts` for password hashing.
- `nodemailer` for SMTP settings and form submission emails.
- `lucide-react` for admin and builder icons.
- `qrcode` for QR code blocks.
- `three` for panorama viewing.
- `quill` / `react-quill-new` for rich text editing.
- `html-to-image` and `jspdf` for publication export workflows.
- Tailwind packages are installed, but the current app mostly relies on large global CSS in `app/globals.css`.

Important: this repo has an `AGENTS.md` warning that this is not the familiar Next.js version. Before changing Next.js APIs, read the relevant files under `node_modules/next/dist/docs/`.

## 3. Environment and Scripts

Create `.env.local` from `.env.example`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/aperture-portfolio
NEXT_PUBLIC_SITE_URL=https://your-domain.com
SESSION_SECRET=replace-with-a-long-random-secret
SEED_ADMIN_EMAIL=admin@aperture.local
SEED_ADMIN_PASSWORD=ChangeMe123!
```

Required scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

The database helper should default to a local MongoDB URI when `MONGODB_URI` is absent, cache the Mongoose connection globally, and disable Mongoose command buffering.

## 4. Core Data Models

Recreate the Mongoose models in `lib/models.ts`. The app stores most builder layouts as mixed JSON arrays, so the model layer is intentionally permissive for builder content.

### Access

- `User`: email, passwordHash, name, mustChangePassword, roleIds, isActive, timestamps.
- `Role`: name, slug, description, permissions, isSystem, timestamps.

### Legacy/Home Content

- `Photo`: title, place, alt, src, featured, published, order, orientation.
- `Settings`: photographerName, location, bio, email, heroTitle, heroSubtitle, instagram, vimeo.
- `Appearance`: header/admin/content/footer colors, font presets, faviconUrl.
- `SiteContent`: metadata, header/footer brand content, logo settings, menu links, availability CTA, social links, copyright, collection template defaults, collection display defaults, collection style overrides.

### Email

- `EmailSettings`: enabled, host, port, secure, username, password, fromName, fromEmail, replyTo, notificationRecipients, notifyOnFormSubmission, lastVerifiedAt.

### People and Media

- `Bio`: name, slug, type (`Person`, `Subject`), title, location, description, headshotMediaId, headshotUrl, isPrimary. Author pickers (media, stories) offer `Person` profiles only; subject pickers offer every profile.
- `MediaAsset`: filename, fileName, url, originalName, mimeType, size, title, alt, caption, captureDate, author, authorBioId, subjectBioId, orientation, isNsfw, tags, mediaType (`image`, `video`, `audio`, `file`), provider (`local`, `youtube`, `vimeo`), embedUrl, usage.
- Media `usage.kind` must support `story-feature`, `story-content`, `collection`, `bio-headshot`, `form-upload`, and `site-logo`.

### Stories and Collections

- `Story`: headline, slug, subHeadline, category, location, author, authorBioId, publishDate, status, feature media fields, template selection, story display toggles, meta order, style slugs, rich content HTML, storyImages.
- `StoryTemplate`: name, slug, isDefault, layout.
- `GalleryImage`: legacy image storage fields.
- `Collection`: name, slug, description, category, isPublic, imageIds, sortMode, customOrder, display/layout settings, overlay/lightbox/image-page settings, share controls, download/context-menu settings, image radii, style overrides.

### Builders

- `SitePage`: title, slug, status, isHome, layout.
- `FormDefinition`: title, slug, status, layout, settings.
- `FormSubmission`: formId, formTitle, data, fields, status.
- `Zine`: title, slug, description, kind (`zine`, `presentation`, `post`), presentationSize, postViews, status, listed, transition, slideshow, audio, pages, repeatedBlocks, coverMediaId, coverUrl, publishedAt.
- `FontFamily`: family, category, variants, cssUrl.
- `CustomStyle`: name, slug, normal style values, hoverEnabled, hover style values, transitionDuration.
- `CustomShape`: name, slug, viewBox, paths.
- `CustomPageBlock`: name, block. Only container blocks are saved as reusable page blocks.

## 5. Authentication and Authorization

Implement `lib/session.ts` with:

- JWT payload containing at least user id, email, name, and mustChangePassword.
- Cookie name `aperture_session`.
- HTTP-only, same-site lax cookie, secure in production, seven-day max age.
- `createSession`, `getSession`, `requireSession`, and `clearSession`.
- `requireSession(true)` allows users forced through password change to access `/admin/change-password`.

Implement role helpers:

- `lib/permissions.ts` defines permission groups and `allPermissions`.
- `lib/access.ts` ensures an Administrator role with all permissions, resolves user permissions, and exposes `requirePermission(permission)`.
- Admin users/roles pages must use `requirePermission("users.manage")`.

Use `lib/seed.ts` to create a seed admin user from env vars.

## 6. Public Route Map

Rebuild these public routes:

| Route | Purpose |
| --- | --- |
| `/` | Render the home `SitePage` when set, otherwise default home content. |
| `/[slug]` | Render a published custom site page from page builder JSON. |
| `/stories/[slug]` | Render a published story, or draft preview with authenticated `previewId`. |
| `/collections/[slug]` | Render a public collection/gallery. |
| `/collections/[slug]/[imageId]` | Render a single image detail page for a collection. |
| `/forms/[slug]` | Render a published form and post submissions through the form shell. |
| `/zines/[slug]` | Render a published zine in the zine viewer. |
| `/present/[slug]` | Render a published presentation in the same viewer. |
| `/post/[slug]` | Render a published social post view; accept a `view` query param. |
| `/login` | Login page. |

All public pages should include site chrome where appropriate. Site chrome comes from `SiteContent` and appearance variables from `Appearance`.

## 7. Admin Route Map

Rebuild the admin shell and pages:

| Route | Purpose |
| --- | --- |
| `/admin` | Dashboard/admin landing. |
| `/admin/pages` | Page library. |
| `/admin/pages/new` and `/admin/pages/[id]/edit` | Page builder. |
| `/admin/forms` | Form library. |
| `/admin/forms/new` and `/admin/forms/[id]/edit` | Form builder. |
| `/admin/forms/submissions` | Submission inbox. |
| `/admin/forms/[id]/submission-layout` | Configure submission display layout. |
| `/admin/stories` | Story library. |
| `/admin/stories/new` and `/admin/stories/[id]/edit` | Story editor. |
| `/admin/story-templates` | Story template library. |
| `/admin/story-templates/new` and `/admin/story-templates/[id]/edit` | Story template builder. |
| `/admin/collections` | Collection library. |
| `/admin/collections/new` and `/admin/collections/[id]/edit` | Collection editor. |
| `/admin/media` | Media library. |
| `/admin/profiles` | Bio/profile manager. |
| `/admin/publications` | Publication library for zines, presentations, and posts.
| `/admin/publications/[id]/edit` | Publication editor. |
| `/admin/publications/[id]/preview` | Authenticated publication preview. |
| `/admin/design-library` | Fonts, named styles, and custom shapes. |
| `/admin/site-design` | Site design and global style settings. |
| `/admin/site-content` | Header/footer/content settings. |
| `/admin/styles` | Appearance settings. |
| `/admin/email` | SMTP and notification settings. |
| `/admin/users` | User and role access manager. |
| `/admin/change-password` | Forced or voluntary password change. |

Every admin page should call `requireSession()` or a permission-specific helper before rendering.

## 8. API Route Map

Rebuild these route handlers:

| Route | Purpose |
| --- | --- |
| `GET /api/content` | Return public home/default content, appearance, site content, latest story, primary bio, and NSFW flags. |
| `GET /api/media?i=...` | Serve protected local media from `/public/uploads` or `/public/images`, with range requests, ETags, and safe path checks. |
| `GET /api/admin/media` | Authenticated media library list plus related profile/collection/story references. |
| `POST /api/admin/media` | Upload image/video/audio/local files or register YouTube/Vimeo embeds. |
| `POST /api/admin/media/[id]` | Update media metadata and optionally replace the local file with the same MIME type. |
| `DELETE /api/admin/media/[id]` | Delete unused local media assets. |
| `GET/PATCH /api/admin/gallery-images` | Authenticated bulk image metadata listing/update. |
| `GET /api/admin/google-fonts?q=` | Search bundled Google font metadata for design library. |
| `POST /api/forms/upload` | Public form file upload endpoint with per-field kind, size, and multiple-file validation. |
| `POST /api/forms/submit` | Public form submission endpoint, creates `FormSubmission`, sends notification email when enabled. |
| `DELETE /api/admin/forms/submissions/[id]` | Delete a form submission. |
| `POST /api/admin/zines/export-mp4` | Authenticated MP4 export from submitted frame images/audio. |

## 9. Shared Helpers

Recreate these helper responsibilities:

- `lib/protected-media-url.ts`: detect protected local media paths, encode/decode tokens, rewrite public media URLs through `/api/media`.
- `lib/rich-text.ts`: normalize rich text spacing and convert pixel font sizes to rem-scaled font sizes.
- `lib/custom-style-css.ts`: convert `CustomStyle` records to `.custom-style-{slug}` CSS rules with hover rules.
- `lib/custom-shapes.ts`: sanitize uploaded SVG into safe viewBox/path records.
- `lib/display-templates.ts`: story and collection template defaults plus normalization/merge helpers.
- `lib/story-template-layout.ts`: story template block types and layout normalization.
- `lib/page-container-layout.ts`: nested container grid layout defaults, normalization, and cell placement helpers.
- `lib/unify-media.ts`: migrate/normalize old media/gallery records into `MediaAsset`.
- `lib/email.ts`: load SMTP settings, verify transport, send test email, and send form submission notifications.

## 10. Page Builder Contract

The page builder is a client component that receives serialized initial page data, media/story/bio/collection/form sources, fonts, custom styles, custom shapes, and saved custom blocks.

Persist each page as:

```ts
type Page = {
  title: string;
  slug: string;
  status: "draft" | "published";
  isHome: boolean;
  layout: Row[];
};
```

Rows contain columns and row settings:

- content width: contained/full, max width.
- padding and margin settings.
- background type: none/color/image/video.
- color transparency.
- background media URL.
- horizontal and vertical background alignment.
- parallax option.

Columns contain blocks and column settings:

- width/alignment options.
- background type/color/image/video.
- color transparency.
- horizontal and vertical background alignment.
- padding and margin controls matching row spacing controls.
- nested container columns should use the same rendering concepts.

Core page block types:

- `headline`
- `plainText`
- `richText`
- `image`
- `video`
- `panoramaImage`
- `panoramaVideo`
- `icon`
- `shape`
- `customShape`
- `qrCode`
- `button`
- `bio`
- `collection`
- `form`
- `container`

There are no `latestStory` or `featuredStory` blocks. A story appears on a page
through a story-bound `container`, which renders the story's own slots rather
than a card summary of it.

Do not include square or circle as page-builder shape options if matching the current request history. Rectangle and ellipse should render as filled SVG/CSS shapes, not as a collapsed border-only element. Keep width/height explicit for shape blocks.

Text blocks support local text settings when no named style is selected:

- font family
- weight
- size stored as a pixel number in controls but rendered as rem
- character spacing
- line spacing
- italic
- underline
- all caps
- color

When `styleSlug` is set, ignore local text settings and apply `.custom-style-{slug}` instead.

Page rich text should use the same rich text menu behavior as the publication rich text editor: font family, size in rem, weight/style controls, alignment/list/link behavior, and normalized HTML on save.

Nested `container` blocks use `lib/page-container-layout.ts` to normalize responsive grid/cell layout. On mobile, container rows should wrap predictably and not force desktop columns to overflow.

## 11. Form Builder Contract

The form builder should mirror page-builder behavior for these visual blocks:

- Headline
- Plain Text
- Rich Text
- Image
- Video

The form builder also has field blocks:

- short text
- email
- phone
- long text
- select
- checkbox
- radio
- date
- number
- file upload
- hidden field
- submit button

Keep drag-and-drop out of the live preview. Instead, provide an Outline tab like the page builder where rows and blocks can be reordered. The preview should select/edit blocks without being the drag surface.

Public form rendering should:

- Render the same visual styling as the builder.
- Submit via `POST /api/forms/submit`.
- Upload files through `POST /api/forms/upload`.
- Respect per-field settings such as required, options, placeholder/help text, upload kind, max size, and multiple-file support.
- Store submissions as both keyed data and ordered fields.
- Show the configured success message.

## 12. Story System

Stories have an editor for metadata, feature media, rich HTML content, inline story images, display toggles, and template selection.

Story templates are separate builder layouts with rows, columns, and story data blocks. Supported template block types:

- headline
- subHeadline
- date
- category
- location
- author
- meta
- featureMedia
- content

Public story rendering should:

- Use a selected template if present.
- Fall back to the default template or default layout helper.
- Support draft preview for authenticated users through `previewId`.
- Apply named custom styles.
- Use protected media URLs.
- Preserve story image placement within rich content.

## 13. Collections

Collections are galleries backed by `MediaAsset` IDs. Rebuild:

- public/private status
- category and description
- image ordering by createdAt, captureDate, originalName, or custom order
- mosaic, masonry, grid, and feed layouts
- all/lazy/pagination display modes
- natural/cover/fixed-ratio image fitting
- desktop/tablet/mobile columns
- mosaic span controls
- overlay metadata placements
- lightbox metadata placements
- single image page metadata placements
- share buttons
- context-menu/download options
- named and local style overrides
- image corner radii

Collection defaults live in `SiteContent`; collection-level settings can either use defaults or override them.

## 14. Publications: Zines, Presentations, and Posts

The `Publications` model powers three public experiences:

- `kind: "zine"` at `/zines/[slug]`
- `kind: "presentation"` at `/present/[slug]`
- `kind: "post"` at `/post/[slug]`

The editor is a fixed-canvas design tool. Rebuild:

- pages with per-view layouts
- repeated blocks
- presentation dimensions
- social post view presets
- background color/image/video
- background fit and offsets
- Ken Burns image backgrounds
- video background controls
- global audio and page audio
- slideshow settings
- transitions: none, fade, slide, flip
- rich text blocks using Quill-like editing
- text, image, video, button, QR code, icon, shape, custom shape, story, collection, and form blocks
- click actions for visual blocks
- media picker integration
- preview route requiring auth
- public viewer with responsive scaling to the current screen
- MP4 export route from frame images and audio

Publication rich text font sizes must be rendered in rem and must scale relative to the viewing screen in previews and published pages.

## 15. Media Library

Local uploaded files should be stored under:

- `/public/uploads/media`
- `/public/uploads/publications`
- `/public/uploads/collections`
- `/public/uploads/forms`
- `/public/uploads/bios`

Allow at least JPG, PNG, SVG, WebP, GIF, MP4, MP3, and WAV for the admin media library, with a 100 MB max matching the current route. Form uploads support images, video, audio, PDF, documents, text, and CSV depending on field settings.

External video support:

- Parse YouTube URLs.
- Store provider and embedUrl on `MediaAsset`.
- Reuse existing external asset records when the same embed is submitted.

Serving:

- Public components must use `protectedMediaUrl(src)` for local uploads/images.
- `/api/media` must prevent path traversal and only serve allowed roots.
- Support range requests for video/audio playback.
- Add cache headers and ETags.

## 16. Styling Architecture

Rebuild global styles around:

- CSS custom properties for site appearance.
- Admin layout classes for the shell, nav, panels, lists, and forms.
- Shared builder classes for topbar/sidebar/workspace/canvas/rows/columns/blocks.
- Public builder renderer classes that match the preview classes where possible.
- Named style classes generated from `CustomStyle`.
- Safe-mode/NSFW controls.
- Responsive rules for mobile wrapping, especially page-builder containers and publication viewers.

Avoid duplicating divergent preview and public CSS for the same block behavior. Many bugs in builders come from fixing the preview but not the public renderer, or vice versa.

## 17. Server Action Patterns

Use Server Actions for admin CRUD:

- Always call `requireSession()` or `requirePermission()`.
- Always call `connectDB()`.
- Normalize slugs and append a short timestamp suffix on collision.
- Parse builder JSON from hidden form inputs.
- Limit layout array sizes to avoid unbounded writes.
- Normalize rich text HTML before saving.
- Sanitize local media paths before saving builder layouts.
- `revalidatePath()` for affected admin and public routes.
- Redirect back to the edit page with `?saved=1` when appropriate.

Important save actions to recreate:

- login/logout/change password
- settings/appearance/site content/site design/email settings
- story save/delete
- story template save/delete/set default
- collection save/delete
- bio save/delete
- page save/delete/set home/save reusable container block/delete reusable container block
- form save/delete/save submission layout
- zine create/save/delete/publish
- design library font/style/shape actions
- user and role actions

## 18. Rebuild Order

Follow this order to reduce integration churn:

1. Scaffold Next.js, TypeScript, linting, global CSS, env handling, and Mongo connection.
2. Implement Mongoose models and seed admin user.
3. Implement session, login, password change, admin layout, and role/permission management.
4. Implement site appearance/content helpers and public site chrome.
5. Implement media library, protected media URLs, and `/api/media`.
6. Implement design library: fonts, named styles, custom shape upload/sanitization, generated CSS.
7. Implement centrailized style editor that open via popup menu that is used for all style cusomizations across the editors with complete options for manageing fonts and container style that include turing on optional hoover effects and allow the user to save a style definition for reuse. All style size definitions should use rem for responsive behavior.
8. Implement stories, profiles, and story public rendering.
9. Implement collections and public collection rendering.
10. Implement page builder data model, admin editor, public page renderer, saved container blocks.
11. Implement form builder, public form shell, file upload, submissions, and notification email.
12. Implement story template builder and connect it to story rendering.
13. Implement publication editor/viewer for zines, presentations, and posts.
14. Implement publication export, QR code, panorama, and remaining advanced blocks.
15. Polish responsive CSS and verify preview/public parity for every block.

## 19. Verification Checklist

Run:

```bash
npm run lint
npm run build
```

Then manually verify:

- Seed admin can log in and change password.
- Admin pages require auth.
- User/role permissions block unauthorized access.
- Media upload, metadata edit, replacement, deletion, and protected playback work.
- Public safe-mode controls hide/reveal NSFW media.
- Page builder preview and public `/[slug]` match for text, rich text, media, rows, columns, container blocks, backgrounds, and shapes.
- Rectangle and ellipse shape blocks render with visible area, not a collapsed border.
- Form builder preview and public `/forms/[slug]` match for visual blocks.
- Form submissions and uploads are stored and visible in admin.
- Email settings verify and form notifications send when enabled.
- Story templates render correctly on public stories and draft previews.
- Collections render all layout/display modes on desktop and mobile.
- Zine/presentation/post viewers scale to the viewport and preserve relative text sizing.
- Publication slideshow, audio, video backgrounds, and public routes work.
- MP4 export route handles valid frames and reports useful errors.

## 20. Known Gotchas

- Public renderers and builder previews must share the same data assumptions. When adding a setting to a builder block, update both the admin preview and public renderer.
- Font size controls may collect numeric values that were historically pixels, but rendered output should use rem for responsive behavior.
- Named styles intentionally override local text settings.
- The page builder and form builder both persist layout JSON; migrations are usually normalization functions rather than schema changes.
- `MediaAsset` model has compatibility logic for evolved enum values. If rebuilding fresh, include the final enum values from the start.
- The collection schema is large and has compatibility additions. If rebuilding fresh, create a single complete schema rather than incremental `schema.add()` patches.
- The app imports `next.config.ts` from at least one API route in the current code path, which can trigger a build warning about an unexpected file in the NFT list. Avoid importing project config from route handlers in a clean rebuild.


