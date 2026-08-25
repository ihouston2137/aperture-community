"use client";

import { useState, useTransition } from "react";

import { createMenuAction } from "./actions";

export function NewMenuForm() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function create(formData: FormData) {
    setError("");
    startTransition(async () => {
      // On success the action redirects to the new menu, so nothing returns.
      const result = await createMenuAction(formData);
      if (result && !result.ok) setError(result.error ?? "Could not create that menu.");
    });
  }

  return (
    <form action={create}>
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="menu-name">Name</label>
          <input id="menu-name" name="name" type="text" required />
          <span className="help-text">
            Only you see this — it is how the menu block offers it.
          </span>
        </div>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Creating…" : "Create menu"}
        </button>
      </div>
    </form>
  );
}
