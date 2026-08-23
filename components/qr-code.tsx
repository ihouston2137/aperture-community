"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({
  value,
  color = "#000000",
  size = 10,
}: {
  value: string;
  color?: string;
  size?: number;
}) {
  // The generated image is stored alongside the inputs that produced it, so a
  // stale code is never shown and the effect never writes state synchronously.
  const [generated, setGenerated] = useState<{
    value: string;
    color: string;
    dataUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;

    QRCode.toDataURL(value, {
      margin: 1,
      width: 512,
      color: { dark: color, light: "#00000000" },
    })
      .then((dataUrl) => {
        if (!cancelled) setGenerated({ value, color, dataUrl });
      })
      .catch(() => {
        /* An unencodable value simply leaves the placeholder in place. */
      });

    return () => {
      cancelled = true;
    };
  }, [value, color]);

  const current =
    generated && generated.value === value && generated.color === color
      ? generated.dataUrl
      : "";

  return (
    <div className="pb-qr" style={{ width: `${size}rem` }}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current} alt={`QR code for ${value}`} />
      ) : (
        <div
          style={{
            aspectRatio: "1 / 1",
            border: "1px dashed currentColor",
            opacity: 0.4,
          }}
        />
      )}
    </div>
  );
}
