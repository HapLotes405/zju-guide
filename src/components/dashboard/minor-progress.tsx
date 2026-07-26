"use client";

// =============================================================================
// minor-progress.tsx — 辅修/微专业学分完成度
// GET /api/me/path/minor?semester=N
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import api from "@/lib/api-client";
import type { MinorResult, MinorGroupProgress } from "@/lib/path-engine";
import { SkeletonProgressCard } from "@/components/dashboard/skeleton-card";
import { EmptyCard } from "@/components/dashboard/empty-card";
import { ErrorCard } from "@/components/dashboard/error-card";

interface Props {
  semester: number;
}

/** Single progress bar for one minor group. */
function MinorBar({ group }: { group: MinorGroupProgress }) {
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
            done ? "bg-sky-500" : "bg-purple-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {done ? "已完成" : `尚缺 ${group.remainingCredits} 学分`}
      </p>
    </div>
  );
}

export default function MinorProgress({ semester }: Props) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["path", "minor", semester],
    queryFn: () =>
      api.get<MinorResult>(`/api/me/path/minor?semester=${semester}`),
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
          error instanceof Error ? error.message : "无法加载辅修数据"
        }
        onRetry={() => refetch()}
      />
    );
  }

  const groups: MinorGroupProgress[] = data?.groups ?? [];

  // ---- Empty ----
  if (groups.length === 0) {
    return (
      <EmptyCard
        title="暂无辅修/微专业数据"
        description={data?.programVersion ? "当前辅修方案无分组数据" : "你尚未登记辅修或微专业培养方案"}
      />
    );
  }

  // ---- Success ----
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-purple-100 p-1.5">
          <Layers className="h-4 w-4 text-purple-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">辅修进度</h3>
      </div>

      {/* Progress bars */}
      <div className="divide-y divide-slate-50">
        {groups.map((g) => (
          <MinorBar key={g.groupId} group={g} />
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
