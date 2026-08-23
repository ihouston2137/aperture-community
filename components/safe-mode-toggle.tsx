"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setSafeModeAction } from "@/app/actions";

export function SafeModeToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="safe-mode-toggle">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            await setSafeModeAction(next);
            router.refresh();
          });
        }}
      />
      Safe mode
    </label>
  );
}
