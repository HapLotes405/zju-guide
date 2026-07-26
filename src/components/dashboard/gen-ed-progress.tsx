"use client";

// =============================================================================
// gen-ed-progress.tsx — 通识教育学分完成度
// GET /api/me/path/gen-ed?semester=N
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { GraduationCap, TrendingUp } from "lucide-react";
import api from "@/lib/api-client";
import type { GenEdResult, GenEdGroupProgress } from "@/lib/path-engine";
import { SkeletonProgressCard } from "@/components/dashboard/skeleton-card";
import { EmptyCard } from "@/components/dashboard/empty-card";
import { ErrorCard } from "@/components/dashboard/error-card";

interface Props {
  semester: number;
}

/** Single progress bar for one gen-ed group. */
function GenEdBar({ group }: { group: GenEdGroupProgress }) {
  const pct = group.requiredCredits > 0
    ? Math.round((group.earnedCredits / group.requiredCredits) * 100)
    : 0;
  const done = group.remainingCredits <= 0;

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          {group.groupName}
        </span>
        <span className="text-xs tabular-nums text-slate-500">
          {group.earnedCredits}/{group.requiredCredits} 学分
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            done ? "bg-emerald-500" : "bg-indigo-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {done
          ? "已完成"
          : `尚缺 ${group.remainingCredits} 学分`}
      </p>
    </div>
  );
}

export default function GenEdProgress({ semester }: Props) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["path", "gen-ed", semester],
    queryFn: () =>
      api.get<GenEdResult>(`/api/me/path/gen-ed?semester=${semester}`),
  });

  // ---- Loading ----
  if (isLoading) {
    return <SkeletonProgressCard />;
  }

  // ---- Error ----
  if (isError) {
    return (
      <ErrorCard
        message={
          error instanceof Error ? error.message : "无法加载通识教育数据"
        }
        onRetry={() => refetch()}
      />
    );
  }

  const groups: GenEdGroupProgress[] = data?.groups ?? [];

  // ---- Empty ----
  if (groups.length === 0) {
    return (
      <EmptyCard
        title="暂无通识教育要求"
        description="当前培养方案未配置通识教育分组数据"
      />
    );
  }

  // ---- Success ----
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-emerald-100 p-1.5">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">通识教育进度</h3>
      </div>

      {/* Progress bars */}
      <div className="divide-y divide-slate-50">
        {groups.map((g) => (
          <GenEdBar key={g.groupId} group={g} />
        ))}
      </div>

      {data?.programVersion && (
        <p className="mt-3 text-xs text-slate-400">
          培养方案：{data.programVersion.majorName}（{data.programVersion.year}）
        </p>
      )}
    </div>
  );
}
