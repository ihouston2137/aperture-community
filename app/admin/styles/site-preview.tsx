"use client";

import {
  ChromeStyle,
  PreviewFooter,
  PreviewHeader,
} from "@/components/site-chrome-preview";
import type { AppearanceValues, SiteContentValues } from "@/lib/site-values";

/**
 * Live preview of the public site chrome around a sample page body. The header
 * and footer come from the shared preview components, so this screen and the
 * page builder canvas show the same thing.
 */
export function SitePreview({
  appearance,
  content,
}: {
  appearance: AppearanceValues;
  content: SiteContentValues;
}) {
  return (
    <div className="appearance-preview">
      {/* Scoped to the wrapper rather than :root so the admin keeps its theme. */}
      <ChromeStyle appearance={appearance} scope=".appearance-preview" />

      <div className="site-shell appearance-preview-shell">
        <PreviewHeader appearance={appearance} content={content} />

        <main className="site-main">
          <div className="page-shell">
            <h1>A sample page heading</h1>
            <p>
              This preview uses your live colours, fonts and header and footer
              layout so you can judge the settings before saving them.
            </p>
            <p>
              Body copy picks up the content colour and body font, while headings
              use the heading font. <a>Links use the accent colour.</a>
            </p>
            <p>
              <span className="pb-button">A button</span>
            </p>
          </div>
        </main>

        <PreviewFooter appearance={appearance} content={content} />
      </div>
    </div>
  );
}
