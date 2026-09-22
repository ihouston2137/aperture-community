"use client";

import { Move, SlidersHorizontal, Sparkles } from "lucide-react";

const tabs = [
  { id: "content", label: "Block properties", Icon: SlidersHorizontal },
  { id: "position", label: "Size and position", Icon: Move },
  { id: "effects", label: "Effects", Icon: Sparkles },
] as const;
export type BlockSettingsTab = (typeof tabs)[number]["id"];

export function BlockSettingsTabs({ value, onChange }: { value: BlockSettingsTab; onChange: (tab: BlockSettingsTab) => void }) {
  return <div className="deck-settings-tabs" role="tablist" aria-label="Block settings">
    {tabs.map(({ id, label, Icon }, index) => <button key={id} type="button" role="tab" id={`block-tab-${id}`}
      aria-controls={`block-panel-${id}`} aria-label={label} title={label} aria-selected={value === id} tabIndex={value === id ? 0 : -1}
      onClick={() => onChange(id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        onChange(tabs[next].id);
        document.getElementById(`block-tab-${tabs[next].id}`)?.focus();
      }}><Icon size={18} aria-hidden="true" /></button>)}
  </div>;
}
