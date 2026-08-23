"use client";

import { useEffect } from "react";

export type LightboxImage = {
  src: string;
  alt?: string;
  caption?: string;
};

/**
 * A single-image lightbox, sharing the `.lightbox-*` styling the collection
 * gallery already uses so both look the same on a public page.
 */
export function MediaLightbox({
  image,
  onClose,
}: {
  image: LightboxImage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!image) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div className="lightbox-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lightbox-stage" onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt ?? ""} />
      </div>
      <div className="lightbox-bar" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose}>
          Close
        </button>
        {image.caption ? <span>{image.caption}</span> : null}
      </div>
    </div>
  );
}
