import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { connectDB } from "./db";
import {
  Appearance,
  AuthSettings,
  Bio,
  Collection,
  CustomPageBlock,
  CustomShape,
  CustomStyle,
  EmailSettings,
  FontFamily,
  FormDefinition,
  FormSubmission,
  GalleryImage,
  MediaAsset,
  Photo,
  Role,
  Settings,
  SiteContent,
  SitePage,
  Story,
  StoryTemplate,
  User,
  VerificationCode,
  Zine,
} from "./models";
import { runSeed } from "./seed";

/**
 * Returns the site to a clean install: every document deleted, every uploaded
 * file removed, then the Administrator role and seed account recreated so the
 * admin is still reachable.
 *
 * Development only. It is irreversible and there is no backup step.
 */

/** Every model, so a new one is a compile error here rather than a leftover. */
const MODELS = [
  Appearance,
  AuthSettings,
  Bio,
  Collection,
  CustomPageBlock,
  CustomShape,
  CustomStyle,
  EmailSettings,
  FontFamily,
  FormDefinition,
  FormSubmission,
  GalleryImage,
  MediaAsset,
  Photo,
  Role,
  Settings,
  SiteContent,
  SitePage,
  Story,
  StoryTemplate,
  User,
  VerificationCode,
  Zine,
];

/**
 * Only `public/uploads` is cleared. `public/images` holds the sample files that
 * ship with the repository and is part of a clean install, not user content.
 */
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/** Directory placeholders, which exist so the tree survives a clean checkout. */
const KEEP = new Set([".gitkeep", ".gitignore"]);

export const IS_DEV = process.env.NODE_ENV !== "production";

async function clearUploads(): Promise<number> {
  let removed = 0;

  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Nothing uploaded yet, so nothing to clear.
      return;
    }

    for (const entry of entries) {
      if (KEEP.has(entry.name)) continue;
      const target = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // The upload folders themselves stay: the upload routes expect them.
        await walk(target);
        continue;
      }

      await rm(target, { force: true });
      removed += 1;
    }
  };

  await walk(UPLOAD_ROOT);
  return removed;
}

export async function resetInstall(): Promise<{ documents: number; files: number }> {
  if (!IS_DEV) throw new Error("The reset is only available in development.");

  await connectDB();

  const results = await Promise.all(MODELS.map((collection) => collection.deleteMany({})));
  const documents = results.reduce((total, result) => total + (result.deletedCount ?? 0), 0);

  const files = await clearUploads();

  // Rebuilt straight away, otherwise there is no account to sign back in with.
  await runSeed();

  return { documents, files };
}
