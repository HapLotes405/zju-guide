import { GraduationCap, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-600 p-3 shadow-lg shadow-indigo-500/20">
          <GraduationCap className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          求是学径
        </h1>
      </div>

      <p className="max-w-md text-center text-slate-500">
        浙江大学课程学习路径共建平台 — 从培养方案到每周行动，从散落资料到可信路径
      </p>

      <div className="mt-4 flex gap-4">
        <a
          href="/login"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-indigo-500"
        >
          开始使用 <ArrowRight className="h-4 w-4" />
        </a>
        <a
          href="/register"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow transition hover:bg-slate-50"
        >
          注册账号
        </a>
      </div>

      <p className="mt-8 text-xs text-slate-400">
        2026 浙江大学求是学径项目组 · 软件工程课程实践
      </p>
    </main>
  );
}
