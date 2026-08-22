"use client";

// ─── 培养方案视图（共享组件） ────────────────────
// 渲染 ProgramVersion.programJson（LLM 洗出来的递归树结构）：
//   1) 按学期行动清单  2) 按学分进度板  3) 二三四课堂  4) 辅修方案
// 数据结构契约见 src/lib/program-document.ts，本组件只 import 不重定义。
// 仪表盘首页与 /program/[id] 详情页共用；programId 变化时自动重新拉取并重置交互状态。

import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  Layers,
  Library,
  ListChecks,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import {
  type GroupStats,
  type MinorTierView,
  type ModuleGroup,
  type ProgramDocument,
  type ProgramVersionHeader,
  type SelectionType,
  type SemesterCourseItem,
  SELECTION_LABELS,
  buildMinorView,
  buildSemesterPlan,
  collectUnscheduled,
  computeStatsForGroups,
  computeTotalStats,
} from "@/lib/program-document";

// ─── 类型 ────────────────────────────────────────
interface ProgramDetail {
  id: string;
  majorName: string;
  year: number;
  totalCredits: number;
  isActive: boolean;
  document: ProgramDocument | null;
}

type TabKey = "semester" | "credits" | "activities" | "minor";

interface TabMeta {
  key: TabKey;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

// selection 徽标配色（蓝=必修 琥珀=选读 紫=任选 绿=认定）
const SELECTION_STYLES: Record<SelectionType, string> = {
  REQUIRED: "border-blue-200 bg-blue-50 text-blue-700",
  CHOOSE_ONE: "border-amber-200 bg-amber-50 text-amber-700",
  CHOOSE_N: "border-amber-200 bg-amber-50 text-amber-700",
  FLEXIBLE: "border-violet-200 bg-violet-50 text-violet-700",
  CREDIT_ONLY: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

// 培养方案原文标注徽标（如辅修专业要求"修读标注 * 的课程"，化工 2025 有 20 门带 * / **）
function MarksBadge({ marks }: { marks?: string[] }) {
  if (!marks || marks.length === 0) return null;
  return (
    <span
      title={`培养方案原文标注：${marks.join("、")}（辅修专业/学位认定请核对方案原文）`}
      className="rounded bg-amber-100 px-1 text-[10px] font-bold leading-4 text-amber-700"
    >
      {marks.join("")}
    </span>
  );
}

// ─── 主组件 ──────────────────────────────────────
export function ProgramDocumentView({
  programId,
  appliedMinors,
  hideMinorTab = false,
  hideHeader = false,
}: {
  programId: string;
  /** 已应用的主修方案（type=MINOR），用于「辅修方案」Tab 展示"我的辅修"；缺省时退化为展示当前方案文档自带的辅修要求 */
  appliedMinors?: { id: string; majorName: string; year: number }[];
  /** 嵌套展示某个辅修时隐藏其「辅修方案」Tab：该要求卡已在卡内展示，避免重复/递归 */
  hideMinorTab?: boolean;
  /** 嵌套展示时跳过顶部信息卡（卡头已含专业名/年级/总学分） */
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const id = programId;

  const {
    data: program,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProgramDetail>({
    queryKey: ["program-document", id],
    queryFn: () => api.get<ProgramDetail>(`/api/programs/${id}`),
    enabled: !!id,
  });

  const programDoc = program?.document;

  const [activeTab, setActiveTab] = useState<TabKey>("semester");
  // 本地「已修」课程集合：点击进度板课程 chip 模拟勾选
  const [passed, setPassed] = useState<Set<string>>(() => new Set());
  // 辅修卡展开态提升到本层：切走「辅修方案」Tab 时 MinorPane 会卸载，
  // 若不提升，用户切回后所有已展开的卡会收起、需重新逐个展开
  const [expandedMinors, setExpandedMinors] = useState<Set<string>>(() => new Set());

  // 切换方案（id 变化）时重置本地交互状态
  useEffect(() => {
    setActiveTab("semester");
    setPassed(new Set());
    setExpandedMinors(new Set());
  }, [id]);

  const toggle = (code: string) =>
    setPassed((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const openCourse = (code: string) => router.push(`/course/${code}`);

  // 辅修 Tab 可见性：已应用辅修，或当前文档自带了辅修要求；嵌套展示时强制隐藏
  const hasMinorTab =
    !hideMinorTab &&
    ((appliedMinors?.length ?? 0) > 0 ||
      Boolean(programDoc?.minorPrograms && programDoc.minorPrograms.length > 0));

  // 辅修 Tab 消失时（如删除全部已应用辅修后重新应用）回落到"按学期行动清单"，
  // 避免 activeTab 残留 "minor" 渲染空面板且无高亮 Tab
  useEffect(() => {
    if (!hasMinorTab && activeTab === "minor") setActiveTab("semester");
  }, [hasMinorTab, activeTab]);

  // tab 列表：辅修方案仅在数据存在时出现
  const tabs = useMemo<TabMeta[]>(() => {
    const list: TabMeta[] = [
      { key: "semester", label: "按学期行动清单", icon: CalendarDays },
      { key: "credits", label: "按学分进度板", icon: Target },
      { key: "activities", label: "二三四课堂", icon: ListChecks },
    ];
    if (hasMinorTab) {
      list.push({ key: "minor", label: "辅修方案", icon: Library });
    }
    return list;
  }, [hasMinorTab]);

  // 学分进度板统计：整棵树总进度 + 各组 O(1) 查表
  const stats = useMemo(
    () => (programDoc ? computeStatsForGroups(programDoc.moduleGroups ?? [], passed) : new Map()),
    [programDoc, passed],
  );
  const total = useMemo<GroupStats>(
    () =>
      programDoc
        ? computeTotalStats(programDoc.moduleGroups ?? [], passed)
        : { targetCredits: 0, earnedCredits: 0, courseCount: 0 },
    [programDoc, passed],
  );

  // ─── Loading ──────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="animate-pulse border border-slate-200 bg-white p-6 lg:p-8">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="h-6 w-16 rounded bg-slate-200" />
            <div className="h-6 w-20 rounded bg-slate-200" />
            <div className="h-6 w-28 rounded bg-slate-200" />
          </div>
          <div className="mb-3 h-9 w-2/3 rounded bg-slate-200" />
          <div className="h-5 w-1/2 rounded bg-slate-200" />
          <div className="mt-5 h-4 w-24 rounded bg-slate-200" />
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="h-7 w-24 rounded bg-slate-100" />
            <div className="h-7 w-28 rounded bg-slate-100" />
            <div className="h-7 w-24 rounded bg-slate-100" />
          </div>
        </div>
        <div className="animate-pulse border border-slate-200 bg-white p-6">
          <div className="mb-4 h-5 w-32 rounded bg-slate-200" />
          <div className="h-40 rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────
  if (isError || !program || !programDoc) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
        <p className="mb-2 text-sm font-medium text-red-800">
          {error instanceof Error ? error.message : "加载失败"}
        </p>
        <p className="mb-4 text-xs text-red-500">培养方案不存在或加载失败，请稍后重试</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-100"
        >
          <RefreshCw className="h-4 w-4" />
          重新加载
        </button>
      </div>
    );
  }

  const header = programDoc.programVersion;

  return (
    <div className="space-y-5">
      {/* ── 头部卡：完整版默认；hideHeader（嵌套展示辅修完整方案）时降级为摘要 chips ── */}
      {hideHeader ? (
        <SummaryChips header={header} />
      ) : (
      <div className="border border-slate-200 bg-white p-6 lg:p-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="course-code rounded-md bg-blue-100 px-2.5 py-0.5 font-semibold text-blue-700">
            {header.year} 级
          </span>
          {header.degree && (
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {header.degree}
            </span>
          )}
          {header.disciplineCategory && (
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              学科门类：{header.disciplineCategory}
            </span>
          )}
          {header.supportDiscipline && (
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              支撑学科：{header.supportDiscipline}
            </span>
          )}
          {header.durationYears != null && (
            <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {header.durationYears} 年学制
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
          {header.majorName}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4 text-blue-600" />
            毕业总学分
            <span className="font-bold tabular-nums text-blue-700">
              {header.totalCreditsText ?? String(header.totalCredits ?? 0)}
            </span>
          </span>
          {header.semesterSystem && <span>学期制：{header.semesterSystem}</span>}
        </div>

        <SummaryChips header={header} />
      </div>
      )}

      {/* ── 页内 Tab（view-switch 样式） ── */}
      <div className="view-switch flex flex-wrap border border-slate-200 bg-slate-50 p-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-selected={isActive}
              className={`flex items-center gap-1.5 min-h-10 px-4 text-sm font-medium transition ${
                isActive ? "is-active" : "text-slate-500 hover:bg-white hover:text-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 内容 ── */}
      {activeTab === "semester" && <SemesterPlanPane document={programDoc} onOpen={openCourse} />}
      {activeTab === "credits" && (
        <CreditsBoardPane
          document={programDoc}
          stats={stats}
          total={total}
          passed={passed}
          onToggle={toggle}
          onOpen={openCourse}
        />
      )}
      {activeTab === "activities" && <ActivitiesPane document={programDoc} />}
      {activeTab === "minor" && (
        <MinorPane
          document={programDoc}
          onOpen={openCourse}
          appliedMinors={appliedMinors}
          expandedMinors={expandedMinors}
          onToggleExpand={(minorId) =>
            setExpandedMinors((current) => {
              const next = new Set(current);
              if (next.has(minorId)) next.delete(minorId);
              else next.add(minorId);
              return next;
            })
          }
        />
      )}
    </div>
  );
}

// ─── 按学期行动清单 ──────────────────────────────────
function SemesterPlanPane({
  document,
  onOpen,
}: {
  document: ProgramDocument;
  onOpen: (code: string) => void;
}) {
  const plan = buildSemesterPlan(document);
  const unscheduled = collectUnscheduled(document);
  const hasScheduled = plan.some((sem) => sem.items.length > 0);

  if (!hasScheduled && unscheduled.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        该培养方案暂无可展示的学期修读计划
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {plan.map((sem) => {
        // 分必修/可选统计门数（不汇总学分：跨学期课程会在多个学期重复出现，学分汇总会虚高；每门课卡片上有自己的学分）
        const requiredCount = sem.items.filter((it) => it.selection === "REQUIRED").length;
        const optionalCount = sem.items.length - requiredCount;
        return (
          <section key={sem.key} className="border border-slate-200 bg-white">
            <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-800">{sem.title}</h3>
              <span className="text-xs text-slate-400">
                必修 {requiredCount} 门
                {optionalCount > 0 ? ` · 可选 ${optionalCount} 门` : ""}
              </span>
            </header>
            <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {sem.items.map((item, index) => (
                <SemesterCourseRow
                  key={`${sem.key}-${index}`}
                  item={item}
                  onOpen={() => onOpen(item.courseCode)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* 未指定学期的课程兜底展示 */}
      {unscheduled.length > 0 && (
        <section className="border border-dashed border-slate-300 bg-slate-50/60">
          <header className="flex min-h-12 flex-wrap items-center gap-2.5 px-5 py-2.5">
            <Layers className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-600">未指定学期</h3>
            <span className="text-xs text-slate-400">（{unscheduled.length} 门，培养方案原文未标注学期）</span>
          </header>
          <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((f) => (
              <SemesterCourseRow
                key={`${f.course.courseCode}-${f.path.join("/")}`}
                item={{
                  courseCode: f.course.courseCode,
                  courseName: f.course.courseName,
                  credits: f.course.credits,
                  rawLabel: "",
                  path: f.path,
                  groupName: f.group.name,
                  selection: f.group.selection,
                  marks: f.course.marks,
                }}
                onOpen={() => onOpen(f.course.courseCode)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SemesterCourseRow({
  item,
  onOpen,
}: {
  item: SemesterCourseItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="truncate text-sm font-semibold text-slate-800" title={item.courseName}>
          {item.courseName}
        </span>
        <span
          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${SELECTION_STYLES[item.selection]}`}
        >
          {SELECTION_LABELS[item.selection]}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="course-code flex items-center gap-1 text-slate-400">
          {item.courseCode}
          <MarksBadge marks={item.marks} />
        </span>
        <span className="flex items-center gap-1.5 font-medium text-slate-500">
          {item.rawLabel && <span className="text-slate-400">{item.rawLabel}</span>}
          {item.credits} 学分
        </span>
      </div>
      <div className="mt-1.5 truncate text-[11px] text-slate-400" title={item.path.join(" › ")}>
        {item.path.join(" › ")}
      </div>
    </button>
  );
}

// ─── 按学分进度板 ──────────────────────────────────
function CreditsBoardPane({
  document,
  stats,
  total,
  passed,
  onToggle,
  onOpen,
}: {
  document: ProgramDocument;
  stats: Map<ModuleGroup, GroupStats>;
  total: GroupStats;
  passed: Set<string>;
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
}) {
  if (document.moduleGroups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        <Target className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        该培养方案暂无学分进度数据
      </div>
    );
  }

  // 总进度条目标以培养方案官方毕业学分为准（totalCredits + extraCredits，如 "160+8" = 168），
  // 与头部 totalCreditsText 完全一致；树里多出的"其他必修环节（认定型）"由下方分组进度单独呈现。
  const header = document.programVersion;
  const headlineTarget = (header.totalCredits ?? 0) + (header.extraCredits ?? 0);
  const earned = Math.min(total.earnedCredits, headlineTarget);
  const totalPct = headlineTarget > 0 ? Math.min(100, (earned / headlineTarget) * 100) : 0;
  const remaining = Math.max(0, headlineTarget - earned);

  return (
    <div className="space-y-4">
      {/* 总进度条 */}
      <div className="border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
            <Target className="h-5 w-5 text-blue-600" />
            毕业学分总进度
          </h3>
          <span className="text-sm font-bold tabular-nums text-blue-700">
            {earned.toFixed(1)} / {headlineTarget.toFixed(1)}
          </span>
        </div>
        <div className="mb-2 h-2 overflow-hidden bg-slate-100">
          <div
            className={`h-full transition-all ${totalPct >= 100 ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${totalPct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400">
          目标 = 毕业总学分（课程 {header.totalCredits}
          {header.extraCredits ? ` + 二三四课堂 ${header.extraCredits}` : ""}）；其他必修环节等认定型要求见下方分组
        </p>
        <p className="mt-1 text-xs text-slate-400">
          点击下方课程标记「已修」模拟进度（仅本地临时模拟，不会保存），当前还差
          <span className={`mx-1 font-bold tabular-nums ${remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {remaining.toFixed(1)}
          </span>
          学分
        </p>
      </div>

      {/* 递归分组树 */}
      {document.moduleGroups.map((g) => (
        <GroupNode
          key={g.name}
          group={g}
          stats={stats}
          passed={passed}
          depth={0}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function GroupNode({
  group,
  stats,
  passed,
  depth,
  onToggle,
  onOpen,
}: {
  group: ModuleGroup;
  stats: Map<ModuleGroup, GroupStats>;
  passed: Set<string>;
  depth: number;
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
}) {
  const s = stats.get(group);
  const target = s?.targetCredits ?? 0;
  const earned = s?.earnedCredits ?? 0;
  const pct = target > 0 ? Math.min(100, (earned / target) * 100) : 0;
  const courses = group.courses ?? [];
  const children = group.children ?? [];

  return (
    <div className={depth > 0 ? "border-l-2 border-slate-200 pl-4 sm:pl-6" : ""}>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        {/* 组头：组名 + 选择徽标 + 目标学分 + 进度 */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h4 className="text-sm font-bold text-slate-800">{group.name}</h4>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SELECTION_STYLES[group.selection]}`}>
            {SELECTION_LABELS[group.selection]}
          </span>
          {group.requiredCredits != null && (
            <span className="text-xs text-slate-500">
              目标 <span className="tabular-nums font-medium">{group.requiredCredits}</span> 学分
            </span>
          )}
          {target > 0 ? (
            <span className={`ml-auto text-xs font-semibold tabular-nums ${pct >= 100 ? "text-emerald-600" : "text-slate-500"}`}>
              {earned.toFixed(1)} / {target.toFixed(1)}
            </span>
          ) : (
            <span className="ml-auto text-xs text-slate-400">—</span>
          )}
        </div>

        {/* 进度条 */}
        {target > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden bg-slate-100">
            <div
              className={`h-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-blue-600"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* 规则说明（灰字） */}
        {group.ruleText && <p className="mt-2 text-xs leading-relaxed text-slate-400">{group.ruleText}</p>}

        {/* 课程 chips：点击标记已修，右侧图标跳转课程详情 */}
        {courses.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {courses.map((c) => {
              const isPassed = passed.has(c.courseCode);
              return (
                <div
                  key={c.courseCode}
                  role="button"
                  tabIndex={0}
                  onClick={() => onToggle(c.courseCode)}
                  onKeyDown={(e) => {
                    // 内层"查看课程"按钮自行处理键盘，避免外层 role=button 拦截其 Enter/空格
                    if ((e.target as HTMLElement).tagName === "BUTTON") return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggle(c.courseCode);
                    }
                  }}
                  title={`${c.courseName} · ${c.credits} 学分（点击标记已修/未修）`}
                  className={`group inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    isPassed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  <Check className={`h-3 w-3 flex-shrink-0 ${isPassed ? "text-emerald-500" : "text-slate-300"}`} />
                  <span className="course-code flex items-center gap-1 font-medium">
                    {c.courseCode}
                    <MarksBadge marks={c.marks} />
                  </span>
                  <span className="max-w-[160px] truncate">{c.courseName}</span>
                  <span className="tabular-nums text-slate-400">{c.credits}</span>
                  <button
                    type="button"
                    aria-label={`查看课程 ${c.courseName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(c.courseCode);
                    }}
                    className="rounded p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-blue-600"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 说明型/认定型空组提示 */}
        {courses.length === 0 && children.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">该组为说明型/认定型要求，无具体课程清单</p>
        )}
      </div>

      {/* 子组递归（缩进） */}
      {children.length > 0 && (
        <div className="mt-3 space-y-3">
          {children.map((child) => (
            <GroupNode
              key={child.name}
              group={child}
              stats={stats}
              passed={passed}
              depth={depth + 1}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 二三四课堂 ──────────────────────────────────
function ActivitiesPane({ document }: { document: ProgramDocument }) {
  const byYear = document.guidanceByYear ?? [];

  if (byYear.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        该培养方案暂无二三四课堂安排数据
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {byYear.map((yearBlock) => (
        <section key={yearBlock.year} className="border border-slate-200 bg-white">
          <header className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-5 py-3">
            <ListChecks className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-800">{yearBlock.title}</h3>
          </header>
          <div className="space-y-5 p-5">
            {(yearBlock.activities ?? []).map((activity) => (
              <div key={activity.kind}>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <BookOpen className="h-4 w-4 text-slate-400" />
                  {activity.kind}
                  <span className="text-xs font-normal text-slate-400">（{activity.items?.length ?? 0} 项）</span>
                </h4>
                {(activity.items?.length ?? 0) > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                          <th className="w-12 px-3 py-2 font-medium">序号</th>
                          <th className="px-3 py-2 font-medium">项目名称</th>
                          <th className="w-32 px-3 py-2 font-medium">记点/学分</th>
                          <th className="w-24 px-3 py-2 font-medium">学期标记</th>
                          <th className="px-3 py-2 font-medium">备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity.items.map((item) => (
                          <tr key={`${activity.kind}-${item.seq}`} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 tabular-nums text-slate-400">{item.seq}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{item.name}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-600">{item.points}</td>
                            <td className="px-3 py-2 text-slate-500">{item.termMarks}</td>
                            <td className="px-3 py-2 text-xs text-slate-400">{item.remark}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-center text-xs text-slate-400">
                    本学年暂无{activity.kind}安排
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// 核心课程 / 全英文授课摘要 chips：
// 完整头部卡内嵌使用；hideHeader（嵌套展示辅修完整方案）时降级为紧凑卡片单独展示，
// 因为 AppliedMinorCard 卡头只含专业名/年级/总学分，缺这两块概览
function SummaryChips({ header }: { header: ProgramVersionHeader }) {
  const hasCore = (header.coreCourses ?? []).length > 0;
  const hasEnglish = (header.englishCourses ?? []).length > 0;
  if (!hasCore && !hasEnglish) return null;
  return (
    <div className="mt-5">
      {hasCore && (
        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            核心课程
          </span>
          <div className="flex flex-wrap gap-2">
            {(header.coreCourses ?? []).map((c) => (
              <span
                key={c}
                className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      {hasEnglish && (
        <div className="mt-3">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            全英文授课
          </span>
          <div className="flex flex-wrap gap-2">
            {(header.englishCourses ?? []).map((c) => (
              <span
                key={c}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 辅修方案 ──────────────────────────────────
function MinorPane({
  document,
  onOpen,
  appliedMinors,
  expandedMinors,
  onToggleExpand,
}: {
  document: ProgramDocument;
  onOpen: (code: string) => void;
  appliedMinors?: { id: string; majorName: string; year: number }[];
  /** 已展开完整方案的辅修卡 id 集合（本层状态，切 Tab 卸载 MinorPane 后保留） */
  expandedMinors: ReadonlySet<string>;
  onToggleExpand: (minorId: string) => void;
}) {
  // 已应用辅修：按"我的辅修"逐张卡片展示目标专业的真实修读要求（与当前主修文档解耦）
  if (appliedMinors && appliedMinors.length > 0) {
    return (
      <div className="space-y-4">
        <header className="flex items-center gap-2">
          <Library className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-800">
            我的辅修（已应用 {appliedMinors.length} 个）
          </h3>
        </header>
        {appliedMinors.map((minor) => (
          <AppliedMinorCard
            key={minor.id}
            minor={minor}
            onOpen={onOpen}
            expanded={expandedMinors.has(minor.id)}
            onToggle={() => onToggleExpand(minor.id)}
          />
        ))}
      </div>
    );
  }

  // 未应用辅修（如 /program/[id] 预览页）：展示当前方案文档自带的辅修要求
  const minors = document.minorPrograms ?? [];
  return (
    <div className="space-y-4">
      {minors.map((minor) => {
        const courses = minor.courses ?? [];
        return (
          <section key={minor.name} className="border border-slate-200 bg-white p-5">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">{minor.name}</h3>
              {minor.requiredCredits != null && (
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {minor.requiredCredits} 学分
                </span>
              )}
            </div>
            {minor.ruleText && <p className="text-xs leading-relaxed text-slate-400">{minor.ruleText}</p>}
            {courses.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {courses.map((c) => (
                  <button
                    key={c.courseCode}
                    type="button"
                    onClick={() => onOpen(c.courseCode)}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-800 transition hover:bg-blue-100"
                  >
                    <span className="course-code flex items-center gap-1 font-medium">
                      {c.courseCode}
                      <MarksBadge marks={c.marks} />
                    </span>
                    <span className="max-w-[180px] truncate">{c.courseName}</span>
                    <span className="tabular-nums text-blue-400">{c.credits}</span>
                    <ExternalLink className="h-3 w-3 opacity-40 transition group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">课程清单按培养方案原文标注规则修读认定。</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

// 单个"我的辅修"卡片：拉取目标专业的方案文档，提取其辅修三档要求
function AppliedMinorCard({
  minor,
  onOpen,
  expanded,
  onToggle,
}: {
  minor: { id: string; majorName: string; year: number };
  onOpen: (code: string) => void;
  /** 是否已展开完整培养方案（受控自 ProgramDocumentView，切 Tab 后仍保留） */
  expanded: boolean;
  onToggle: () => void;
}) {
  const {
    data: program,
    isLoading,
    isError,
    refetch,
  } = useQuery<ProgramDetail>({
    queryKey: ["program-document", minor.id],
    queryFn: () => api.get<ProgramDetail>(`/api/programs/${minor.id}`),
    enabled: !!minor.id,
  });

  if (isLoading) {
    return (
      <section className="animate-pulse border border-slate-200 bg-white p-5">
        <div className="mb-3 h-5 w-44 rounded bg-slate-200" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-2/3 rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  // 缺 id（异常数据兜底）：enabled:false 的 query 不会触发加载/错误分支，需显式给中性提示，
  // 否则会落入下方"加载失败 + 重新加载"误导文案（此时点重新加载也无法修复）
  if (!minor.id) {
    return (
      <section className="border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-800">
          {minor.majorName}
          <span className="ml-1.5 text-sm font-normal text-slate-400">· {minor.year} 级</span>
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <AlertCircle className="h-4 w-4" />
          该辅修缺少方案信息，暂时无法展示其修读要求。
        </p>
      </section>
    );
  }

  if (isError || !program?.document) {
    return (
      <section className="border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-800">
          {minor.majorName}
          <span className="ml-1.5 text-sm font-normal text-slate-400">· {minor.year} 级</span>
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <AlertCircle className="h-4 w-4" />
          该辅修方案加载失败，暂时无法展示其修读要求。
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重新加载
        </button>
      </section>
    );
  }

  const doc = program.document;
  const tiers = buildMinorView(doc);
  return (
    <section className="border border-slate-200 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-slate-800">
          {doc.programVersion.majorName}
          <span className="ml-1.5 text-sm font-normal text-slate-400">· {doc.programVersion.year} 级</span>
        </h3>
        {doc.programVersion.totalCreditsText != null && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            主修总学分 {doc.programVersion.totalCreditsText}
          </span>
        )}
      </div>
      {tiers.length > 0 ? (
        <div className="mt-3 space-y-4">
          {tiers.map((tier) => (
            <MinorTierBlock key={tier.key} tier={tier} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">该方案未提供可展示的辅修修读要求。</p>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={minor.id ? `minor-full-plan-${minor.id}` : undefined}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        {expanded ? "收起完整培养方案" : "查看完整培养方案"}
      </button>

      {expanded && (
        <div
          id={minor.id ? `minor-full-plan-${minor.id}` : undefined}
          className="mt-4 border-t border-slate-100 pt-4"
        >
          <ProgramDocumentView programId={minor.id} hideMinorTab hideHeader />
        </div>
      )}
    </section>
  );
}

// 单档辅修要求（微辅修 / 辅修专业 / 辅修学位）
function MinorTierBlock({
  tier,
  onOpen,
}: {
  tier: MinorTierView;
  onOpen: (code: string) => void;
}) {
  const courses = tier.courses;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-bold text-slate-700">{tier.name}</h4>
        {tier.requiredCredits != null && (
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {tier.requiredCredits} 学分
          </span>
        )}
        <span className="text-xs text-slate-400">{courses.length} 门</span>
      </div>
      {courses.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {courses.map((c) => (
            <button
              key={c.courseCode}
              type="button"
              onClick={() => onOpen(c.courseCode)}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-800 transition hover:bg-blue-100"
            >
              <span className="course-code flex items-center gap-1 font-medium">
                {c.courseCode}
                <MarksBadge marks={c.marks} />
              </span>
              <span className="max-w-[180px] truncate">{c.courseName}</span>
              <span className="tabular-nums text-blue-400">{c.credits}</span>
              <ExternalLink aria-hidden="true" className="h-3 w-3 opacity-40 transition group-hover:opacity-100" />
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          {tier.ruleText || "该方案未标注具体课程，仅提供学分要求。"}
        </p>
      )}
    </div>
  );
}
