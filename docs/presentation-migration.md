# Presentations

The presentation editor, player, canvas tools, PDF import, and PNG/PDF export were ported from the local `D:\github\aperture` application. Access control and media storage use aperture-community's existing services.

## Storage and compatibility

- `Zine` remains the identity record for existing URLs, visibility, listing settings, covers, templates, timestamps, and the recycle bin. New presentations also receive an identity record.
- `Presentation` uses the same `_id`, with an editable `deck`, a `published` snapshot, named post `variants`, `publishedVariants`, and a version counter for concurrent saves.
- Existing pages become slides. Publication blocks retain their complete normalized content in presentation objects, rendered by the existing block renderer. They can be moved, resized, rotated, grouped, and edited through compatibility fields. Tables retain their cells; sponsor and content references remain live. Newly inserted objects use the new editor's native format.
- Repeated and inherited layout objects are materialized on each slide. Reusable layouts are also retained, but subsequent layout edits do not propagate to existing slides; apply the edited layout explicitly.
- Social posts retain separate decks for each size, including per-view overrides and the selected default. The editor provides links between variants, and old `?view=` URLs continue to work.
- Hidden slides, return buttons, page links, image/video backgrounds, transitions, slideshow looping, and audio preferences survive conversion. Autoplay pauses on a hidden slide.
- `/zines/[slug]`, `/post/[slug]`, and `/present/[slug]` use the converted published deck when available. `/presentations/[id]` checks the same publication access restrictions. Drafts and deleted records are not publicly accessible.
- Both original and converted documents, layouts, variants, and published snapshots count toward media usage until permanent removal.

## Migration commands

Run from this repository, using its configured `.env.local` database:

```sh
npm run migrate:publications
npm run migrate:publications -- --apply
```

The default command is read-only. `--apply` writes Extended JSON backups of the identity and presentation collections into an ignored `backups/publications-<timestamp>/` directory before making changes. The directory also receives a JSON report. Keep these backups outside the repository as part of normal database backup storage.

The converter does not overwrite existing presentation documents. It records the source ID, content hash, conversion version, source metadata, and backup location. Sources that exceed supported limits or cannot be converted are reported as `needs-review` and remain on the original editor/viewer. An empty draft becomes one blank slide; an empty published document requires review. Check the exit code and report: a partial migration exits with code 2.

To limit either command to one record, append `--id=<24-character-id>`.

```sh
npm run migrate:publications -- --rollback --id=<24-character-id>
```

Rollback backs up current state, disables converted rendering, and restores the source title/publication state captured at migration. Original page data was never overwritten. The converted deck, including subsequent edits, remains stored for recovery; rerunning `--apply` deliberately skips it. Rollback does not merge later slide edits into the old format. Back up and review both versions before choosing which to resume editing.

Run migration during a pause in publication editing. Conversion checks source modification timestamps, but is not a cross-collection transaction. Run the dry run first and verify any partial-failure report before resuming editing.

## Verification

```sh
npm run test:presentations
npm run build
npx playwright install chromium
npm run test:presentations:browser
```

The browser test starts the production build on port 3187 against a disposable local MongoDB database. It checks conversion rendering, old URLs, hidden-page links, draft snapshots, permissions, native editing, exports, PDF import, and publication controls. It removes its test database and generated uploads afterward. Screenshots are saved under the ignored `backups/test-artifacts/` directory. It never uses the configured content database.
