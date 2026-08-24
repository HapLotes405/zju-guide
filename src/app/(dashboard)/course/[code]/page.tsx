"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  Clock,
  Target,
  Users,
  BookMarked,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  GitFork,
  MapPin,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Sparkles,
  Send,
  Loader2,
  Paperclip,
  Download,
  X,
  ClipboardList,
  FileQuestion,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RESOURCE_TYPE_LABELS, APPLICABLE_STAGE_LABELS } from "@/lib/constants";
import { api, ApiError } from "@/lib/api-client";
import { buildCC98SearchUrl } from "@/lib/cc98";
import { handleMarkdownTab } from "@/lib/markdown-editor";
import { ExamPrepSection } from "@/components/exam-prep-section";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ───────────────────────────────────────────────

interface Prerequisite {
  code: string;
  name: string;
  credits: number;
  semester: string | null;
  relationType: string;
  reason: string | null;
}

interface Dependent {
  code: string;
  name: string;
  credits: number;
  semester: string | null;
  relationType: string;
  reason: string | null;
}

interface Program {
  majorName: string;
  year: number;
  suggestedSemester: number;
  isCompulsory: boolean;
}

interface CourseData {
  code: string;
  name: string;
  credits: number;
  department: string | null;
  category: string | null;
  description: string | null;
  semester: string | null;
  prerequisites: Prerequisite[];
  dependents: Dependent[];
  programs: Program[];
}

interface TeacherData {
  id: string;
  name: string;
  department: string | null;
  school: string;
  score: number | null;
  ratingCount: number;
  rollCallPct: number | null;
  chalaoshiUrl: string | null;
  courses: {
    courseCode: string;
    courseName: string;
    gpa: number | null;
    gpaStd: number | null;
    studentCount: number | null;
  }[];
  reviews: {
    content: string;
    likes: number;
    date: string | null;
    source: string;
  }[];
}

interface KnowledgeGraphNode {
  code: string;
  name: string;
  level: "prerequisite" | "current" | "dependent";
  children?: KnowledgeGraphNode[];
}

interface ResourceData {
  id: string;
  title: string;
  type: string;
  url: string | null;
  summary: string | null;
  applicableStage: string | null;
  submitterName: string;
  createdAt: string;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
}

type StageKey = "COURSE" | "QUIZ" | "MIDTERM" | "FINAL";

// ─── Mock Data (teachers now fetched from API) ────────────

const MOCK_MISCONCEPTIONS = [
  "很多同学以为这门课是纯理论课，实际上有大量实验和项目需要动手。",
  "课程名里的「材料」容易让人以为只是记忆性质的内容，实际有不少数学推导。",
  "不要等到期末才开始复习，平时作业和实验的积累很重要。",
];

// ─── Sub-components ──────────────────────────────────────

const COURSE_SECTION_IDS = [
  "identity",
  "why",
  "course",
  "quiz",
  "midterm",
  "final",
  "teachers",
  "graph",
] as const;

/** Skeleton for preview cards during loading */
function SectionCardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "min-h-44 border border-slate-200 bg-white p-5",
            i === 0 && "lg:col-span-2",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 bg-slate-200" />
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="ml-auto h-4 w-16 rounded bg-slate-200" />
          </div>
          <div className="mt-6 h-3 w-5/6 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/** Empty state for optional sections */
function EmptyState({ message, icon: Icon }: { message: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
      <Icon className="h-10 w-10" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** Tag/badge component */
function Badge({
  variant = "default",
  children,
}: {
  variant?: "default" | "compulsory" | "elective";
  children: React.ReactNode;
}) {
  const styles = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    compulsory: "bg-blue-50 text-blue-700 border-blue-200",
    elective: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}

/** Rectangular course section with a persistent content preview */
function CourseSectionCard({
  id,
  icon: Icon,
  title,
  badge,
  expanded,
  featured = false,
  onToggle,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  expanded: boolean;
  featured?: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "course-section-card min-w-0 border border-slate-200 bg-white transition-shadow hover:shadow-sm",
        (featured || expanded) && "lg:col-span-2",
      )}
    >
      <header className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-5 py-3">
        <Icon className="h-[18px] w-[18px] flex-shrink-0 text-blue-600" />
        <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
        {badge && <div className="flex items-center">{badge}</div>}
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={expanded}
          className="ml-auto inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-blue-700"
        >
          {expanded ? "收起" : "展开全部"}
          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>
      </header>

      <div
        className={cn(
          "relative px-5 py-4",
          !expanded && "max-h-40 overflow-hidden",
        )}
      >
        {children}
        {!expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white via-white/90 to-transparent"
          />
        )}
      </div>
    </section>
  );
}

/** Info row: label + value */
function InfoRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number | null | undefined;
  valueClassName?: string;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-slate-400 min-w-[60px]">{label}</span>
      <span className={cn("text-sm text-slate-700", valueClassName)}>{value}</span>
    </div>
  );
}

/** Clickable course link chip */
function CourseChip({ code, name, type }: { code: string; name: string; type?: "prerequisite" | "dependent" }) {
  return (
    <Link
      href={`/course/${code}`}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
        type === "prerequisite"
          ? "border-green-200 bg-green-50 text-green-800 hover:bg-green-100"
          : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
      )}
    >
      <span className="course-code font-medium">{code}</span>
      <span className="text-xs opacity-70 truncate max-w-[120px]">{name}</span>
      <ExternalLink className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;

  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["course", code],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${code}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`课程「${code}」不存在`);
        throw new Error("获取课程数据失败，请稍后重试");
      }
      const json = await res.json();
      return json.data as CourseData;
    },
  });

  const course = response;

  // Teachers query — real data from chalaoshi
  const { data: teachers = [] } = useQuery({
    queryKey: ["course-teachers", code],
    queryFn: () => api.get<TeacherData[]>(`/api/courses/${code}/teachers`),
    enabled: !!code,
  });

  // Resources query — 按学习进度分为四格展示
  const { data: resources = [] } = useQuery({
    queryKey: ["course-resources", code],
    queryFn: () => api.get<ResourceData[]>(`/api/courses/${code}/resources`),
    enabled: !!code,
  });

  // 按适用阶段分组；未知/null 阶段兜底归入「平时学习」
  const resourcesByStage = useMemo(() => {
    const groups: Record<StageKey, ResourceData[]> = {
      COURSE: [],
      QUIZ: [],
      MIDTERM: [],
      FINAL: [],
    };
    for (const r of resources) {
      const key = r.applicableStage as StageKey | null;
      // Object.hasOwn 防止原型链上的键（如 "constructor"/"toString"）被误判为合法阶段导致崩溃
      const stage: StageKey = key && Object.hasOwn(groups, key) ? key : "COURSE";
      groups[stage].push(r);
    }
    return groups;
  }, [resources]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const allSectionsExpanded = COURSE_SECTION_IDS.every((id) =>
    expandedSections.has(id),
  );

  const toggleSection = (id: string) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 只展开、不折叠：供卡片内的子表单（投稿 / 复习编辑）打开时保证可见，避免被折叠裁剪
  const ensureExpanded = (id: string) => {
    setExpandedSections((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const toggleAllSections = () => {
    setExpandedSections(
      allSectionsExpanded
        ? new Set()
        : new Set(COURSE_SECTION_IDS),
    );
  };

  // ─── Loading ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-8 lg:px-6">
        {/* Header skeleton */}
        <div className="mb-8 animate-pulse">
          <div className="mb-4 h-5 w-20 rounded bg-slate-200" />
          <div className="mb-3 h-8 w-64 rounded bg-slate-200" />
          <div className="h-5 w-96 rounded bg-slate-200" />
        </div>

        <SectionCardSkeleton count={8} />
      </main>
    );
  }

  // ─── Error ────────────────────────────────────────────────
  if (isError || !course) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-8 lg:px-6">
        <button
          onClick={() => router.back()}
          className="group mb-8 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>

        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
          <p className="mb-2 text-sm font-medium text-red-800">
            {error instanceof Error ? error.message : "加载失败"}
          </p>
          <p className="mb-4 text-xs text-red-500">
            {!isError && !course ? "课程数据为空" : "请检查课程代码是否正确，或稍后重试"}
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            重新加载
          </button>
        </div>
      </main>
    );
  }

  // ─── Derived data ────────────────────────────────────────
  const isCompulsory = course.programs.some((p) => p.isCompulsory);
  const majorProgram = course.programs.length > 0 ? course.programs[0] : null;

  // Build knowledge graph tree
  const graphRoot: KnowledgeGraphNode = {
    code: course.code,
    name: course.name,
    level: "current",
    children: [
      // Prerequisites as children of "先修"
      {
        code: "__prereq_group__",
        name: "先修课程",
        level: "prerequisite",
        children: course.prerequisites.map((p) => ({
          code: p.code,
          name: p.name,
          level: "prerequisite" as const,
        })),
      },
      // Dependents as children of "后续"
      {
        code: "__dep_group__",
        name: "后续课程",
        level: "dependent",
        children: course.dependents.map((d) => ({
          code: d.code,
          name: d.name,
          level: "dependent" as const,
        })),
      },
    ],
  };

  return (
    <main className="course-information mx-auto max-w-[1400px] px-4 py-8 lg:px-6">
      {/* ── Back + Header ─────────────────────────────────── */}
      <button
        onClick={() => router.back()}
        className="group mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="course-code rounded-md bg-blue-100 px-2.5 py-0.5 font-semibold text-blue-700">
            {course.code}
          </span>
          {isCompulsory ? (
            <Badge variant="compulsory">必修</Badge>
          ) : (
            <Badge variant="elective">选修</Badge>
          )}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {course.name}
        </h1>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <BookOpen className="h-4 w-4" />
            <span>{course.credits} 学分</span>
          </div>
          {course.semester && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              <span>{course.semester}</span>
            </div>
          )}
          {course.department && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-4 w-4" />
              <span>{course.department}</span>
            </div>
          )}
          {majorProgram && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Target className="h-4 w-4" />
              <span>建议第{majorProgram.suggestedSemester}学期修读</span>
            </div>
          )}
        </div>

        {course.description && (
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {course.description}
          </p>
        )}
      </div>

      {/* ── Course guide preview cards ────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">课程学习指南</h2>
          <p className="mt-1 text-sm text-slate-500">
            每个模块默认展示内容预览，可单独或一次性展开。
          </p>
        </div>
        <button
          type="button"
          onClick={toggleAllSections}
          className="inline-flex min-h-9 items-center gap-1.5 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
        >
          {allSectionsExpanded ? "恢复预览" : "全部展开"}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              allSectionsExpanded && "rotate-180",
            )}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 1. 课程身份 */}
        <CourseSectionCard
          id="identity"
          icon={GraduationCap}
          title="课程身份"
          badge={
            isCompulsory ? (
              <Badge variant="compulsory">必修</Badge>
            ) : (
              <Badge variant="elective">选修</Badge>
            )
          }
          featured
          expanded={expandedSections.has("identity")}
          onToggle={toggleSection}
        >
          <div className="grid gap-y-2.5 rounded-lg bg-slate-50 p-4">
            <InfoRow label="课号" value={course.code} valueClassName="course-code" />
            <InfoRow label="课程名" value={course.name} />
            <InfoRow label="学分" value={`${course.credits} 学分`} />
            <InfoRow label="开课院系" value={course.department} />
            <InfoRow label="学期" value={course.semester} />
            <InfoRow label="类别" value={course.category} />
          </div>
        </CourseSectionCard>

        {/* 2. 为什么学 */}
        <CourseSectionCard
          id="why"
          icon={HelpCircle}
          title="为什么学"
          expanded={expandedSections.has("why")}
          onToggle={toggleSection}
        >
          {/* Prerequisites */}
          <div className="mb-4">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ArrowLeft className="h-3.5 w-3.5" />
              前置课程
            </h3>
            {course.prerequisites.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {course.prerequisites.map((p) => (
                  <CourseChip
                    key={p.code}
                    code={p.code}
                    name={p.name}
                    type="prerequisite"
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                message="该课程无前置依赖"
                icon={CheckCircle2}
              />
            )}
          </div>

          {/* Dependents */}
          <div className="mb-4">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" />
              后续课程
            </h3>
            {course.dependents.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {course.dependents.map((d) => (
                  <CourseChip
                    key={d.code}
                    code={d.code}
                    name={d.name}
                    type="dependent"
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                message="该课程暂无后续依赖课程"
                icon={Sparkles}
              />
            )}
          </div>

          {/* Common misconceptions */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              常见误区
            </h3>
            <ul className="space-y-2">
              {MOCK_MISCONCEPTIONS.map((m, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </CourseSectionCard>

        {/* 3. 平时学习 */}
        <CourseSectionCard
          id="course"
          icon={BookMarked}
          title="平时学习"
          expanded={expandedSections.has("course")}
          onToggle={toggleSection}
        >
          <ResourceCardContent
            courseCode={course.code}
            stage="COURSE"
            resources={resourcesByStage.COURSE}
            onExpand={() => ensureExpanded("course")}
          />
        </CourseSectionCard>

        {/* 4. 小测 */}
        <CourseSectionCard
          id="quiz"
          icon={FileQuestion}
          title="小测"
          expanded={expandedSections.has("quiz")}
          onToggle={toggleSection}
        >
          <ResourceCardContent
            courseCode={course.code}
            stage="QUIZ"
            resources={resourcesByStage.QUIZ}
            onExpand={() => ensureExpanded("quiz")}
          />
        </CourseSectionCard>

        {/* 5. 期中 */}
        <CourseSectionCard
          id="midterm"
          icon={ClipboardList}
          title="期中"
          expanded={expandedSections.has("midterm")}
          onToggle={toggleSection}
        >
          <ResourceCardContent
            courseCode={course.code}
            stage="MIDTERM"
            resources={resourcesByStage.MIDTERM}
            onExpand={() => ensureExpanded("midterm")}
          />
        </CourseSectionCard>

        {/* 6. 期末（跨两列：复习路线 + 期末资源） */}
        <CourseSectionCard
          id="final"
          icon={Target}
          title="期末"
          featured
          expanded={expandedSections.has("final")}
          onToggle={toggleSection}
        >
          <div className="space-y-5">
            <ExamPrepSection courseCode={course.code} onExpand={() => ensureExpanded("final")} />
            <ResourceCardContent
              courseCode={course.code}
              stage="FINAL"
              resources={resourcesByStage.FINAL}
              onExpand={() => ensureExpanded("final")}
            />
          </div>
        </CourseSectionCard>

        {/* 7. 老师评价 */}
        <CourseSectionCard
          id="teachers"
          icon={Users}
          title="老师评价"
          expanded={expandedSections.has("teachers")}
          onToggle={toggleSection}
        >
          <div className="space-y-3">
            {teachers.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-slate-800">待评价</h4>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                  <span className="text-slate-500">风格：<span className="text-slate-700">暂无数据</span></span>
                  <span className="text-slate-500">给分：<span className="text-slate-700">暂无数据</span></span>
                  <span className="text-slate-500">作业量：<span className="text-slate-700">暂无数据</span></span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  该课程暂无教师评价，欢迎贡献你的真实评价。
                </p>
              </div>
            ) : (
              teachers.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  {/* Header: name + score */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {t.name}
                      {t.department && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          {t.department}
                        </span>
                      )}
                      {t.chalaoshiUrl && (
                        <a
                          href={t.chalaoshiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          查老师
                        </a>
                      )}
                    </h4>
                    {t.score != null && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold",
                          t.score >= 9
                            ? "bg-emerald-100 text-emerald-700"
                            : t.score >= 7
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700",
                        )}
                      >
                        {t.score.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                    {t.ratingCount > 0 && (
                      <span className="text-slate-500">
                        {t.ratingCount} 人评价
                      </span>
                    )}
                    {t.rollCallPct != null && (
                      <span className="text-slate-500">
                        点名率 {t.rollCallPct}%
                      </span>
                    )}
                    {t.courses
                      .filter((c) => c.courseCode === code && c.gpa != null)
                      .map((c) => (
                        <span key={c.courseCode} className="text-slate-500">
                          绩点{" "}
                          <span className="font-medium text-slate-700">
                            {c.gpa?.toFixed(2)}
                          </span>
                          {c.studentCount != null && (
                            <span className="text-slate-400">
                              {" "}
                              / {c.studentCount}人
                            </span>
                          )}
                        </span>
                      ))}
                  </div>

                  {/* Reviews */}
                  {t.reviews.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {t.reviews.slice(0, 3).map((r, ri) => (
                        <p
                          key={ri}
                          className="text-xs leading-relaxed text-slate-500"
                        >
                          <span className="mr-1 text-slate-300">"</span>
                          {r.content.length > 150
                            ? r.content.slice(0, 150) + "…"
                            : r.content}
                          <span className="ml-1 text-slate-300">"</span>
                          <span className="ml-2 text-slate-400">
                            👍 {r.likes}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CourseSectionCard>

        {/* 8. 图谱区 */}
        <CourseSectionCard
          id="graph"
          icon={GitFork}
          title="图谱区"
          expanded={expandedSections.has("graph")}
          onToggle={toggleSection}
        >
          <div className="space-y-2">
            {/* Current course (root) */}
            <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-blue-600" />
                <span className="course-code text-sm font-semibold text-blue-800">
                  {course.code}
                </span>
                <span className="text-xs text-blue-600">{course.name}</span>
                <span className="ml-auto rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700">
                  当前
                </span>
              </div>
            </div>

            {/* Prerequisites branch */}
            {course.prerequisites.length > 0 && (
              <div className="ml-4 border-l-2 border-dashed border-slate-200 pl-4">
                <div className="mb-1.5 text-xs font-medium text-slate-400">
                  先修课程
                </div>
                {course.prerequisites.map((p) => (
                  <Link
                    key={p.code}
                    href={`/course/${p.code}`}
                    className="mb-1.5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50/50 px-3 py-2 transition hover:bg-green-100"
                  >
                    <span className="course-code text-sm font-medium text-green-700">
                      {p.code}
                    </span>
                    <span className="text-xs text-green-600">{p.name}</span>
                    {p.reason && (
                      <span className="ml-auto text-xs text-green-500">
                        {p.reason}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {/* Dependents branch */}
            {course.dependents.length > 0 && (
              <div className="ml-4 border-l-2 border-dashed border-slate-200 pl-4">
                <div className="mb-1.5 text-xs font-medium text-slate-400">
                  后续课程
                </div>
                {course.dependents.map((d) => (
                  <Link
                    key={d.code}
                    href={`/course/${d.code}`}
                    className="mb-1.5 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 transition hover:bg-blue-100"
                  >
                    <span className="course-code text-sm font-medium text-blue-700">
                      {d.code}
                    </span>
                    <span className="text-xs text-blue-600">{d.name}</span>
                    {d.reason && (
                      <span className="ml-auto text-xs text-blue-500">
                        {d.reason}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {/* Empty state for graph */}
            {course.prerequisites.length === 0 &&
              course.dependents.length === 0 && (
                <EmptyState
                  message="该课程暂无依赖关系图谱"
                  icon={GitFork}
                />
              )}
          </div>
        </CourseSectionCard>
      </div>

      {/* 跳转 98 */}
      <div className="mt-5">
        <CC98JumpBox courseName={course.name} />
      </div>
    </main>
  );
}

// ─── 资源卡内容（按适用阶段展示） ──────────────────────────
function ResourceCardContent({
  courseCode,
  stage,
  resources,
  onExpand,
}: {
  courseCode: string;
  stage: string;
  resources: ResourceData[];
  onExpand: () => void;
}) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const canContribute = user?.role === "CONTRIBUTOR" || user?.role === "ADMIN";

  return (
    <div className="space-y-3">
      {/* 投稿窗口：审核通过后展示在本格；仅贡献者及以上可见（VISITOR 提交会被服务端 403） */}
      {canContribute ? (
        showForm ? (
          <ContributeForm
            courseCode={courseCode}
            defaultStage={stage}
            onClose={() => setShowForm(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              onExpand(); // 展开父卡片，避免表单被折叠裁剪
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-4 py-3 text-sm font-medium text-blue-600 transition hover:bg-blue-100"
          >
            <Send className="h-4 w-4" />
            投稿{APPLICABLE_STAGE_LABELS[stage] ?? "本阶段"}资源（审核通过后展示）
          </button>
        )
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <p className="text-sm text-slate-500">
            投稿资源需要「贡献者」及以上身份
          </p>
        </div>
      )}

      {/* 本阶段已审核资源 */}
      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
          <BookMarked className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-400">暂无该阶段资源，欢迎投稿分享</p>
        </div>
      ) : (
        resources.map((r) => <ResourceItem key={r.id} resource={r} />)
      )}
    </div>
  );
}

function ResourceItem({ resource: r }: { resource: ResourceData }) {
  return (
    <div className="resource-preview-card min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
          ✅ 已审核
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
          {RESOURCE_TYPE_LABELS[r.type] ?? r.type}
        </span>
      </div>
      <Link href={`/resource/${r.id}`} className="block min-w-0">
        <h4 className="resource-title font-medium text-slate-900 hover:text-blue-700">
          {r.title}
        </h4>
        {r.summary && (
          <p className="resource-preview mt-1 text-sm text-slate-500">{r.summary}</p>
        )}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          贡献者：{r.submitterName} · <span className="novecento-number">{r.createdAt.slice(0, 10)}</span>
        </span>
        <div className="flex items-center gap-3">
          {r.fileName && r.filePath && (
            <a href={`/api/files/${r.filePath}`} className="flex items-center gap-1 text-blue-500 hover:underline">
              <Download className="h-3 w-3" />下载附件
            </a>
          )}
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
              <ExternalLink className="h-3 w-3" />查看原文
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 跳转 98（独立小框，置于页面底部） ──────────────────────
function CC98JumpBox({ courseName }: { courseName: string }) {
  return (
    <a
      href={buildCC98SearchUrl(courseName)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 transition hover:border-blue-300 hover:bg-blue-100"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition group-hover:bg-blue-700">
          <ExternalLink className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-900">跳转 98</p>
          <p className="text-xs text-blue-500">
            在 CC98 搜索「{courseName}」— 论坛讨论、真题回忆、经验分享
          </p>
        </div>
      </div>
      <ChevronDown className="h-5 w-5 -rotate-90 text-blue-400 transition group-hover:translate-x-0.5" />
    </a>
  );
}

// ─── 资源投稿表单（课程页内嵌，默认适用阶段随所在卡片） ──────────────────────────
function ContributeForm({
  courseCode,
  defaultStage,
  onClose,
}: {
  courseCode: string;
  defaultStage: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("LECTURE_NOTE");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState(defaultStage);
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("请填写资源标题");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("type", type);
      if (url.trim()) form.set("url", url.trim());
      if (summary.trim()) form.set("summary", summary.trim());
      form.set("applicableStage", stage);
      form.set("courseCodes", JSON.stringify([courseCode]));
      if (file) form.set("file", file);
      const result = await api.postForm<{ resourceId: string }>("/api/resources", form);
      toast.success(
        `已提交，审核通过后将展示在「${APPLICABLE_STAGE_LABELS[stage] ?? "对应阶段"}」`,
      );
      onClose();
      router.push(`/resource/${result.resourceId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="course-contribute-form space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <div>
        <label htmlFor="ct-title" className="mb-1 block text-xs font-medium text-slate-600">
          资源标题 <span className="text-red-500">*</span>
        </label>
        <input
          id="ct-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如：2024 秋冬期末真题回忆"
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ct-type" className="mb-1 block text-xs font-medium text-slate-600">
            类型
          </label>
          <select
            id="ct-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ct-stage" className="mb-1 block text-xs font-medium text-slate-600">
            适用阶段
          </label>
          <select
            id="ct-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(APPLICABLE_STAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="ct-url" className="mb-1 block text-xs font-medium text-slate-600">
          链接（可选）
        </label>
        <input
          id="ct-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="ct-summary" className="mb-1 block text-xs font-medium text-slate-600">
          摘要（可选）
        </label>
        <textarea
          id="ct-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(event) => handleMarkdownTab(event, setSummary)}
          rows={2}
          placeholder="简单介绍一下这份资料"
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">
          附件（可选，50MB 内）
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt,.md,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
            <Paperclip className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
              {file.name}
            </span>
            <span className="flex-shrink-0 text-xs text-slate-400">
              {(file.size / 1024 / 1024).toFixed(1)}MB
            </span>
            <button
              type="button"
              aria-label="移除附件"
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="flex-shrink-0 text-slate-400 transition hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
          >
            <Paperclip className="h-4 w-4" />
            选择附件（PDF / 文档 / 图片 / 压缩包）
          </button>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          提交投稿
        </button>
      </div>
    </form>
  );
}
