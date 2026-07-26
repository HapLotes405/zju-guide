"use client";

import { Calendar, Upload } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export default function MyCoursesPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-indigo-600" />
        <h2 className="text-xl font-bold text-slate-900">我的课程</h2>
      </div>

      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-12 text-center">
        <Upload className="mx-auto mb-4 h-10 w-10 text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-700">还没有导入课程数据</h3>
        <p className="mt-1 text-sm text-slate-500">
          导入你的教务 JSON 文件，系统会自动生成你的学习路径
        </p>
        <Link
          href="/import"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-indigo-500"
        >
          <Upload className="h-4 w-4" />
          导入教务数据
        </Link>
      </div>
    </div>
  );
}
