"use client";

// =============================================================================
// overdue-warning.tsx — 逾期未修课程警告
// GET /api/me/path/overdue?semester=N
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import api from "@/lib/api-client";
import type { OverdueResult, OverdueCourseEntry } from "@/lib/path-engine";
import { SkeletonCard } from "@/components/dashboard/skeleton-card";
import { EmptyCard } from "@/components/dashboard/empty-card";
import { ErrorCard } from "@/components/dashboard/error-card";

interface Props {
  semester: number;
}

export default function OverdueWarning({ semester }: Props) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["path", "overdue", semester],
    queryFn: () =>
      api.get<OverdueResult>(
        `/api/me/path/overdue?semester=${semester}`,
      ),
  });

  // ---- Loading ----
  if (isLoading) {
    return <SkeletonCard />;
  }

  // ---- Error ----
  if (isError) {
    return (
      <ErrorCard
        message={
          error instanceof Error ? error.message : "无法加载逾期课程数据"
        }
        onRetry={() => refetch()}
      />
    );
  }

  const courses: OverdueCourseEntry[] = data?.courses ?? [];

  // ---- Empty (good news!) ----
  if (courses.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-100 p-1.5">
            <AlertTriangle className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-800">
              逾期未修：全部完成
            </h3>
            <p className="text-xs text-emerald-600">
              没有逾期的必修课程，继续保持！
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Success with warnings ----
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-amber-100 p-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-800">
            逾期未修 ({courses.length})
          </h3>
          <p className="text-xs text-amber-600">以下课程未在建议学期修读</p>
        </div>
      </div>

      {/* Course list */}
      <ul className="divide-y divide-amber-100">
        {courses.map((c) => (
          <li
            key={c.courseCode}
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-amber-900">
                {c.courseName}
              </p>
              <p className="text-xs text-amber-500">{c.courseCode}</p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-600">
                建议第{c.suggestedSemester}学期
              </span>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                {c.credits}学分
              </span>
            </div>
          </li>
        ))}
      </ul>

      {data?.programVersion && (
        <p className="mt-3 text-xs text-amber-500">
          培养方案：{data.programVersion.majorName}（{data.programVersion.year}）
        </p>
      )}
    </div>
  );
}
