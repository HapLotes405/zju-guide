"use client";

// =============================================================================
// empty-card.tsx — shared empty state
// =============================================================================

import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyCardProps {
  title: string;
  description?: string;
  className?: string;
}

export function EmptyCard({ title, description, className }: EmptyCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm",
        className,
      )}
    >
      <Inbox className="mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      )}
    </div>
  );
}
