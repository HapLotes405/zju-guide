"use client";

// =============================================================================
// error-card.tsx — shared error state with retry button
// =============================================================================

import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorCardProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorCard({
  message = "数据加载失败，请稍后重试",
  onRetry,
  className,
}: ErrorCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center shadow-sm",
        className,
      )}
    >
      <AlertTriangle className="mb-3 h-10 w-10 text-red-400" />
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重试
        </button>
      )}
    </div>
  );
}
