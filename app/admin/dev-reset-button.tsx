"use client";

import { useState, useTransition } from "react";

import { resetInstallAction } from "./dev-actions";

/**
 * Development-only reset.
 *
 * Behind a typed confirmation rather than a `confirm()` dialog: this deletes
 * every document and every uploaded file with no way back, and a button that
 * can be reached by a stray double-click is the wrong shape for that.
 */
const PHRASE = "RESET";

export function DevResetButton() {
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  if (!arming) {
    return (
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setArming(true)}>
        Reset to a clean install
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Type {PHRASE} to confirm</label>
        <input
          type="text"
          value={typed}
          autoFocus
          disabled={pending}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={typed !== PHRASE || pending}
        onClick={() => startTransition(() => resetInstallAction())}
      >
        {pending ? "Resetting…" : "Delete everything"}
      </button>

      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => {
          setArming(false);
          setTyped("");
        }}
      >
        Cancel
      </button>
    </div>
  );
}
