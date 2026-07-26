"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Search, Check, Compass, ChevronRight } from "lucide-react";

// ─── 类型 ────────────────────────────────────────
interface CourseData {
  code: string; name: string; credits: number;
  category: string; semester: string;
  department?: string;
  prerequisites: { code: string; name: string }[];
  dependents: { code: string; name: string }[];
}

// ─── 常亮 ────────────────────────────────────────
const GROUPS = [
  { key: "gen_ed", label: "通识基础", emoji: "📚", bar: "bg-blue-500", dot: "bg-blue-500", border: "border-l-blue-500" },
  { key: "major_base", label: "专业基础", emoji: "🧪", bar: "bg-cyan-500", dot: "bg-cyan-500", border: "border-l-cyan-500" },
  { key: "major_core", label: "专业核心", emoji: "⚙️", bar: "bg-amber-500", dot: "bg-amber-500", border: "border-l-amber-500" },
  { key: "major_practice", label: "实验实践", emoji: "🔬", bar: "bg-teal-500", dot: "bg-teal-500", border: "border-l-teal-500" },
  { key: "major_module", label: "专业模块选修", emoji: "📖", bar: "bg-emerald-500", dot: "bg-emerald-500", border: "border-l-emerald-500" },
  { key: "personalized", label: "个性修读", emoji: "🎯", bar: "bg-violet-500", dot: "bg-violet-500", border: "border-l-violet-500" },
];

const SEMESTERS = ["大一上","大一下","大一暑","大二上","大二下","大二暑","大三上","大三下","大四上","大四下"];

// ─── 分类映射 ────────────────────────────────────
function getCatKey(c: CourseData): string {
  if (c.category.startsWith("module_")) return "major_module";
  if (c.category === "major_practice") return "major_practice";
  return c.category;
}

// ─── 主页面 ──────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"map" | "timeline">("map");
  const [hovered, setHovered] = useState<string | null>(null);

  const { data: allCourses = [] } = useQuery<CourseData[]>({
    queryKey: ["all-courses"],
    queryFn: () => api.rawGet<{ data: CourseData[] }>("/api/courses?pageSize=500").then((d) => d.data ?? []),
  });

  const filtered = useMemo(() => {
    return allCourses.filter((c) => {
      const ms = !search || c.name.includes(search) || c.code.toLowerCase().includes(search.toLowerCase());
      const mf = filter === "all" || getCatKey(c) === filter;
      return ms && mf;
    });
  }, [allCourses, search, filter]);

  const isHL = (c: CourseData) => {
    if (!hovered || hovered === c.code) return true;
    return c.prerequisites?.some((p) => p.code === hovered) || c.dependents?.some((d) => d.code === hovered);
  };

  const credits = useMemo(() => {
    const s: Record<string, { earned: number; total: number }> = {};
    for (const g of GROUPS) s[g.key] = { earned: 0, total: 0 };
    for (const c of allCourses) {
      const k = getCatKey(c);
      if (s[k]) { s[k]!.total += c.credits; if (passed.has(c.code)) s[k]!.earned += c.credits; }
    }
    const totalE = Object.values(s).reduce((a, v) => a + v.earned, 0);
    const totalC = Object.values(s).reduce((a, v) => a + v.total, 0);
    return { groups: s, totalEarned: totalE, totalCredits: totalC };
  }, [allCourses, passed]);

  const toggle = (code: string) => setPassed((p) => {
    const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n;
  });

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* ── 学分总览条 ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Compass className="h-4 w-4 text-indigo-500" />毕业学分进度
          </h2>
          <span className="font-mono text-sm font-bold text-indigo-600">
            {credits.totalEarned.toFixed(1)} / {credits.totalCredits.toFixed(1)}
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
            style={{ width: `${Math.min(100, (credits.totalEarned / (credits.totalCredits || 1)) * 100)}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {GROUPS.map((g) => {
            const s = credits.groups[g.key]!;
            const pct = Math.min(100, (s.earned / (s.total || 1)) * 100);
            return (
              <button key={g.key} onClick={() => setFilter(filter === g.key ? "all" : g.key)}
                className={`rounded-lg p-2 text-left text-xs transition ${filter === g.key ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{g.emoji} {g.label}</span>
                  <span className="font-mono text-slate-400">{s.earned}/{s.total}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${g.bar} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 搜索栏 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索课程名称或课号..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {[{ k: "map", l: "修读导图" }, { k: "timeline", l: "学期时间线" }].map((v) => (
            <button key={v.k} onClick={() => setView(v.k as "map" | "timeline")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${view === v.k ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>{v.l}</button>
          ))}
        </div>
      </div>

      {/* ── 课程区域 ── */}
      {view === "map" ? (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const items = filtered.filter((c) => getCatKey(c) === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className={`relative border-l-4 ${g.border} rounded-r-lg bg-white py-3 pl-5 pr-4 shadow-sm`}>
                <span className={`absolute -left-[10px] top-5 h-4 w-4 ${g.dot} rounded-full border-[3px] border-white`} />
                <h3 className="mb-4 text-sm font-bold text-slate-700">{g.emoji} {g.label}
                  <span className="ml-2 font-normal text-slate-400">({items.length}门)</span>
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((c) => (
                    <Card key={c.code} c={c} passed={passed.has(c.code)} hl={isHL(c)}
                      onClick={() => router.push(`/course/${c.code}`)}
                      onToggle={() => toggle(c.code)}
                      onEnter={() => setHovered(c.code)} onLeave={() => setHovered(null)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {SEMESTERS.map((sem) => {
            const items = filtered.filter((c) => c.semester === sem);
            if (items.length === 0) return null;
            return (
              <div key={sem} className="relative border-l-2 border-slate-200 pl-6">
                <div className="absolute -left-[7px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-indigo-400 bg-white" />
                <h4 className="mb-3 text-sm font-bold text-slate-700">{sem}</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <Card key={c.code} c={c} passed={passed.has(c.code)} hl={isHL(c)}
                      onClick={() => router.push(`/course/${c.code}`)}
                      onToggle={() => toggle(c.code)}
                      onEnter={() => setHovered(c.code)} onLeave={() => setHovered(null)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 课程卡片 ────────────────────────────────────
function Card({ c, passed, hl, onClick, onToggle, onEnter, onLeave }: {
  c: CourseData; passed: boolean; hl: boolean;
  onClick: () => void; onToggle: () => void;
  onEnter: () => void; onLeave: () => void;
}) {
  const catColors: Record<string, string> = {
    gen_ed: "border-blue-200 bg-blue-50/30 text-blue-700",
    major_base: "border-cyan-200 bg-cyan-50/30 text-cyan-700",
    major_core: "border-amber-200 bg-amber-50/30 text-amber-700",
    major_practice: "border-teal-200 bg-teal-50/30 text-teal-700",
    major_module: "border-emerald-200 bg-emerald-50/30 text-emerald-700",
    personalized: "border-violet-200 bg-violet-50/30 text-violet-700",
  };
  const cc = catColors[c.category] ?? "border-slate-200 bg-white";

  return (
    <div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave}
      className={`group cursor-pointer rounded-xl border bg-white p-3 transition-all duration-150 hover:shadow-md ${passed ? "ring-1 ring-emerald-300" : ""} ${hl ? "opacity-100" : "opacity-40"}`}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h5 className="truncate text-xs font-semibold text-slate-800" title={c.name}>{c.name}</h5>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`shrink-0 rounded p-0.5 border transition ${passed ? "border-emerald-400 bg-emerald-100 text-emerald-600" : "border-slate-300 text-transparent hover:border-slate-400"}`}>
          <Check className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono text-slate-400">{c.code}</span>
        <span className="flex items-center gap-1 font-medium text-slate-500">
          {c.credits}学分 <ChevronRight className="h-3 w-3 text-slate-300" />
        </span>
      </div>
      {(c.prerequisites?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute right-2 top-[-6px] scale-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white transition group-hover:scale-100">
          前置: {c.prerequisites.map((p) => p.code).join(", ")}
        </div>
      )}
    </div>
  );
}
