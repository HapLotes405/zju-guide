"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  FileText,
  Search,
  ExternalLink,
  Download,
  BookMarked,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import {
  APPLICABLE_STAGE_LABELS,
  RESOURCE_TYPE_LABELS,
} from "@/lib/constants";

// ─── Types ───────────────────────────────────────────

type StageKey = "COURSE" | "QUIZ" | "MIDTERM" | "FINAL";
type StageFilter = "ALL" | StageKey;

interface BrowseResource {
  id: string;
  title: string;
  type: string;
  url: string | null;
  summary: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  applicableStage: string | null;
  submitterName: string;
  createdAt: string;
  courses: { code: string; name: string }[];
}

// 阶段筛选 Tab：全部 + 四阶段（按学习进度分类）
const STAGE_TABS: { key: StageFilter; label: string }[] = [
  { key: "ALL", label: "全部" },
  ...(["COURSE", "QUIZ", "MIDTERM", "FINAL"] as StageKey[]).map((key) => ({
    key: key as StageFilter,
    label: APPLICABLE_STAGE_LABELS[key] ?? key,
  })),
];

const STAGE_KEYS: StageKey[] = ["COURSE", "QUIZ", "MIDTERM", "FINAL"];

// 未知 / 空阶段兜底归入「平时学习」（与课程页分组逻辑一致）
function normalizeStage(stage: string | null): StageKey {
  return stage && (STAGE_KEYS as string[]).includes(stage)
    ? (stage as StageKey)
    : "COURSE";
}

// ─── Page ────────────────────────────────────────────

export default function ResourcesPage() {
  // 默认加载全部已审核资源——浏览页，不依赖搜索词
  const {
    data: resources = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BrowseResource[]>({
    queryKey: ["resources"],
    queryFn: () => api.get<BrowseResource[]>("/api/resources"),
  });

  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (stageFilter !== "ALL" && normalizeStage(r.applicableStage) !== stageFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        r.title,
        r.summary ?? "",
        r.submitterName,
        ...r.courses.flatMap((c) => [c.code, c.name]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [resources, stageFilter, search]);

  // 各阶段计数（用于 Tab 徽标）
  const counts = useMemo(() => {
    const map: Record<StageKey, number> = {
      COURSE: 0,
      QUIZ: 0,
      MIDTERM: 0,
      FINAL: 0,
    };
    for (const r of resources) map[normalizeStage(r.applicableStage)] += 1;
    return map;
  }, [resources]);

  const totalCount = resources.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── 标题 ── */}
      <div>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-900">学习资料</h2>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
            {totalCount} 份已审核
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          按学习进度分类整理：平时学习 / 小测 / 期中 / 期末。点击课程可直达该课的详情页。
        </p>
      </div>

      {/* ── 阶段筛选 Tab（view-switch 样式） ── */}
      <div
        className="view-switch flex flex-wrap border border-slate-200 bg-slate-50 p-0.5"
        role="tablist"
        aria-label="按学习进度筛选"
      >
        {STAGE_TABS.map((tab) => {
          const isActive = stageFilter === tab.key;
          const count =
            tab.key === "ALL" ? totalCount : counts[tab.key as StageKey];
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStageFilter(tab.key)}
              className={`flex min-h-10 items-center gap-1.5 px-4 text-sm font-medium transition ${
                isActive
                  ? "is-active"
                  : "text-slate-500 hover:bg-white hover:text-slate-800"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  isActive ? "bg-blue-600/15 text-blue-700" : "bg-slate-200/70 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 搜索（客户端过滤：标题 / 简介 / 课程 / 贡献者） ── */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="在已审核资料中搜索标题、课程、贡献者..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* ── 列表 ── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      ) : isError ? (
        // 错误态：区分"加载失败"与"内容为空"，提供重试入口（对齐课程页错误 UI）
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
          <p className="mb-2 text-sm font-medium text-red-800">
            {error instanceof Error ? error.message : "加载失败"}
          </p>
          <p className="mb-4 text-xs text-red-500">获取资料失败，请检查网络后重试</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            重新加载
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState stageFilter={stageFilter} search={search} />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 资源卡 ──────────────────────────────────────────

function ResourceCard({ resource: r }: { resource: BrowseResource }) {
  const stageLabel = APPLICABLE_STAGE_LABELS[normalizeStage(r.applicableStage)];
  return (
    <div className="resource-preview-card min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
          ✅ 已审核
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
          {RESOURCE_TYPE_LABELS[r.type] ?? r.type}
        </span>
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
          {stageLabel}
        </span>
      </div>

      <Link href={`/resource/${r.id}`} className="block min-w-0">
        <h3 className="resource-title font-medium text-slate-900 hover:text-blue-700">
          {r.title}
        </h3>
        {r.summary && (
          <p className="resource-preview mt-1 text-sm text-slate-500">{r.summary}</p>
        )}
      </Link>

      {/* 关联课程 chip → 课程详情页 */}
      {r.courses.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.courses.map((c) => (
            <Link
              key={c.code}
              href={`/course/${c.code}`}
              className="group inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 transition hover:bg-blue-100"
            >
              <span className="font-medium">{c.code}</span>
              <span className="max-w-[120px] truncate text-blue-600">{c.name}</span>
              <ArrowRight className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          贡献者：{r.submitterName} · <span className="novecento-number">{r.createdAt.slice(0, 10)}</span>
        </span>
        <div className="flex items-center gap-3">
          {r.fileName && r.filePath && (
            <a
              href={`/api/files/${r.filePath}`}
              className="flex items-center gap-1 text-blue-500 hover:underline"
            >
              <Download className="h-3 w-3" />
              下载附件
            </a>
          )}
          {r.url && (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              查看原文
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 空态 ────────────────────────────────────────────

function EmptyState({
  stageFilter,
  search,
}: {
  stageFilter: StageFilter;
  search: string;
}) {
  const hasActiveFilter = search.trim().length > 0;
  const stageLabel =
    stageFilter === "ALL" ? "" : APPLICABLE_STAGE_LABELS[stageFilter];

  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-12 text-center">
      <BookMarked className="mx-auto mb-4 h-10 w-10 text-slate-300" />
      {hasActiveFilter ? (
        <>
          <p className="text-sm font-medium text-slate-600">没有找到匹配的资料</p>
          <p className="mt-1 text-xs text-slate-400">
            试试更换关键词，或切换筛选阶段
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-600">
            {stageLabel ? `${stageLabel}暂无已审核资料` : "暂无已审核资料"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            资料来自课程页的投稿（审核通过后展示）——去对应课程详情页，点「投稿资源」即可分享你的笔记、真题回忆或工具模板。
          </p>
        </>
      )}
      <Link
        href="/courses"
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-100"
      >
        浏览课程，从课程页投稿
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
