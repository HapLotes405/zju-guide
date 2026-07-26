"use client";

// =============================================================================
// skeleton-card.tsx — shared loading state (pulsing placeholders)
// =============================================================================

import { cn } from "@/lib/utils";

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      {/* Title skeleton */}
      <div className="mb-4 h-5 w-2/3 animate-pulse rounded bg-slate-200" />

      {/* Row skeletons */}
      <div className="space-y-3">
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function SkeletonProgressCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="mb-4 h-5 w-1/2 animate-pulse rounded bg-slate-200" />
      <div className="mb-3 h-3 w-full animate-pulse rounded-full bg-slate-100" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}
