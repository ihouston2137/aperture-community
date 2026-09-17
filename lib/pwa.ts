/**
 * Reading the web app manifest settings out of the database.
 *
 * Split from `lib/pwa-types.ts` the way every other pair in this codebase is:
 * the settings form is a client component and imports the types, and this
 * module reaches Mongoose.
 */

import { connectDB } from "./db";
import { PwaSettings } from "./models";
import { defaultPwa, normalizePwa, type PwaValues } from "./pwa-types";

export * from "./pwa-types";

export async function getPwaSettings(): Promise<PwaValues> {
  await connectDB();
  const doc = await PwaSettings.findOne().lean<any>();
  return doc ? normalizePwa(doc) : { ...defaultPwa };
}
