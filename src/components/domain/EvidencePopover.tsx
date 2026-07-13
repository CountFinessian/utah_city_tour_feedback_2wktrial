"use client";

import * as Popover from "@radix-ui/react-popover";
import { Quote } from "lucide-react";

export type EvidenceItem = {
  id: string;
  label: string;
  excerpt: string;
  meta?: string;
};

export function EvidencePopover({
  count,
  items,
  label = "evidence",
}: {
  count: number;
  items: EvidenceItem[];
  label?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="evidence-trigger">
          <Quote className="h-3.5 w-3.5" />
          {count} {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={8} className="evidence-popover">
          <div className="flex items-center justify-between gap-3 border-b border-command-border px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-command-muted">Evidence</p>
            <span className="font-mono text-xs text-command-muted">{items.length} sources</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-command-muted">No transcript evidence available.</p>
            ) : (
              items.map((item) => (
                <article key={item.id} className="evidence-popover-item">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-command-ink">{item.label}</h3>
                    {item.meta && <span className="shrink-0 font-mono text-[11px] text-command-muted">{item.meta}</span>}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-command-soft">{item.excerpt}</p>
                </article>
              ))
            )}
          </div>
          <Popover.Arrow className="fill-command-panel" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
