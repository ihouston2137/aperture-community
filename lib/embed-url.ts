/**
 * Turning a video page's address into an embeddable one.
 *
 * Split out of `lib/media-upload.ts`, which reaches for `node:fs` and so cannot
 * be imported by a client component. The page builder's embed block needs the
 * same parsing in the browser, and two copies of a regular expression is how
 * they end up disagreeing.
 */

export type ExternalEmbed = {
  provider: "youtube" | "vimeo";
  embedUrl: string;
  externalId: string;
};

export function parseExternalVideoUrl(url: string): ExternalEmbed | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const youtube =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(
      trimmed
    );
  if (youtube) {
    return {
      provider: "youtube",
      externalId: youtube[1],
      embedUrl: `https://www.youtube.com/embed/${youtube[1]}`,
    };
  }

  const vimeo = /vimeo\.com\/(?:video\/)?(\d{6,})/.exec(trimmed);
  if (vimeo) {
    return {
      provider: "vimeo",
      externalId: vimeo[1],
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`,
    };
  }

  return null;
}

/**
 * The embed address for a pasted link, or an empty string when it is not a
 * video this understands. Anything already in embed form passes straight
 * through, so pasting the src out of an `<iframe>` works as well as the URL
 * from the address bar.
 */
export function embedUrlFor(url: string): string {
  return parseExternalVideoUrl(url)?.embedUrl ?? "";
}
