"use client";

import { Settings, User as UserIcon } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { RESOURCE_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";

interface SubmissionPage {
  items: { id: string; title: string; type: string; status: string; createdAt: string; courseResources: { course: { code: string; name: string } }[] }[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_LABELS: Record<string, string> = { DRAFT: "待审核", PENDING: "待审核", APPROVED: "已通过", REJECTED: "已驳回" };

function MySubmissions() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-submissions", user?.id, page],
    queryFn: () => api.get<SubmissionPage>(`/api/me/submissions?page=${page}`),
    enabled: !!user,
  });
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">我的投稿{data ? `（${data.total}）` : ""}</h3>
        <Link href="/contribute" className="text-sm text-blue-600 hover:underline">去投稿</Link>
      </div>
      {isLoading ? <p className="py-6 text-center text-sm text-slate-500">正在加载投稿…</p>
        : isError ? <div className="py-6 text-center text-sm text-slate-500">投稿加载失败，<button onClick={() => refetch()} className="text-blue-600 hover:underline">重试</button></div>
        : !data?.items.length ? <p className="py-6 text-center text-sm text-slate-500">暂无投稿，分享你的第一份学习资料吧。</p>
        : <ul className="divide-y divide-slate-100">
          {data.items.map((item) => <li key={item.id} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/resource/${item.id}`} className="min-w-0 break-words font-medium text-slate-900 hover:text-blue-600">{item.title}</Link>
              <span className={`shrink-0 rounded px-2 py-1 text-xs ${item.status === "APPROVED" ? "bg-green-50 text-green-700" : item.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{STATUS_LABELS[item.status] ?? item.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{RESOURCE_TYPE_LABELS[item.type] ?? item.type} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.courseResources.map(({ course }) => <Link key={course.code} href={`/course/${course.code}`} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:text-blue-600">{course.name}</Link>)}
            </div>
          </li>)}
        </ul>}
      {data && data.total > data.pageSize && <div className="mt-4 flex items-center justify-end gap-3 text-sm">
        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="text-blue-600 disabled:text-slate-300">上一页</button>
        <span className="text-slate-500">{page} / {Math.ceil(data.total / data.pageSize)}</span>
        <button disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className="text-blue-600 disabled:text-slate-300">下一页</button>
      </div>}
    </section>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold text-slate-900">设置</h2>
      </div>

      {user && <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">个人信息</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100">
            {user.avatar ? <img src={user.avatar} alt="我的头像" className="h-full w-full object-cover" /> : <UserIcon className="h-6 w-6 text-blue-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-all text-lg font-semibold text-slate-900">{user.username}</p>
            <p className="text-sm text-slate-500">{user.role === "ADMIN" ? "管理员" : user.role === "CONTRIBUTOR" ? "贡献者" : "学生"}</p>
          </div>
          <Link href="/settings/profile" className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100">修改个人信息</Link>
        </div>
      </section>}
      <MySubmissions />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">关于求是学径</h3>
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            版本：<span className="novecento-number">v0.1.0</span>
          </p>
          <p>
            技术栈：Next.js <span className="novecento-number">15</span> + TypeScript + Prisma +
            Tailwind CSS
          </p>
          <p>
            X-Lab软件团队训练营实践项目 · <span className="novecento-number">2026</span>
          </p>
        </div>
      </div>
    </div>
  );
}
