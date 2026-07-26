"use client";

// =============================================================================
// required-courses.tsx — 本学期必修课程列表
// GET /api/me/path/required?semester=N
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2 } from "lucide-react";
import api from "@/lib/api-client";
import type {
  RequiredResult,
  RequiredCourseEntry,
} from "@/lib/path-engine";
import { SkeletonCard } from "@/components/dashboard/skeleton-card";
import { EmptyCard } from "@/components/dashboard/empty-card";
import { ErrorCard } from "@/components/dashboard/error-card";

interface Props {
  semester: number;
}

export default function RequiredCourses({ semester }: Props) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["path", "required", semester],
    queryFn: () =>
      api.get<RequiredResult>(
        `/api/me/path/required?semester=${semester}`,
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
          error instanceof Error
            ? error.message
            : "无法加载必修课程数据"
        }
        onRetry={() => refetch()}
      />
    );
  }

  const courses: RequiredCourseEntry[] = data?.courses ?? [];

  // ---- Empty ----
  if (courses.length === 0) {
    return (
      <EmptyCard
        title="本学期无必修课程"
        description="当前学期没有需要修读的必修课，看起来你的进度很好！"
      />
    );
  }

  // ---- Success ----
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-indigo-100 p-1.5">
          <BookOpen className="h-4 w-4 text-indigo-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">
          本学期必修 ({courses.length})
        </h3>
      </div>

      {/* Course list */}
      <ul className="divide-y divide-slate-100">
        {courses.map((c) => (
          <li
            key={c.courseCode}
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">
                {c.courseName}
              </p>
              <p className="text-xs text-slate-400">{c.courseCode}</p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-3">
              <span className="text-xs text-slate-500">
                {c.credits} 学分
              </span>
              <CheckCircle2 className="h-4 w-4 text-slate-300" />
            </div>
          </li>
        ))}
      </ul>

      {/* Program version badge */}
      {data?.programVersion && (
        <p className="mt-3 text-xs text-slate-400">
          培养方案：{data.programVersion.majorName}（{data.programVersion.year}）
        </p>
      )}
    </div>
  );
}
