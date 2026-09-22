"use client";
import { useEffect, useRef } from "react";
export function useUnsavedChanges(dirty: boolean) {
  const active = useRef(dirty);
  useEffect(() => {
    active.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (active.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !active.current ||
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        link.href === location.href
      )
        return;
      if (
        !window.confirm("Leave this editor? Your unsaved changes will be lost.")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return () => {
    active.current = false;
  };
}

