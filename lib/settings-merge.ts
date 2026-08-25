/**
 * Reads a single-document settings collection onto its defaults.
 *
 * Only the keys the defaults declare are copied. That is what keeps `_id`,
 * `__v` and the timestamps out of the result: a Mongoose document carries an
 * ObjectId, and an ObjectId has a `toJSON` method, so spreading the raw
 * document into a value bound for a client component fails to serialize.
 *
 * A missing or null stored value keeps the default, so a field added to the
 * defaults later needs no migration on the documents already saved.
 */
export function mergeSettings<T extends object>(defaults: T, doc: unknown): T {
  if (!doc || typeof doc !== "object") return { ...defaults };
  const source = doc as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const value = source[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out as T;
}
