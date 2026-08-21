/**
 * 培养方案文档（LLM 洗出来的递归树结构）类型 + 纯辅助函数。
 *
 * 数据来源：program-data/*.json，原样存入 ProgramVersion.programJson。
 * 本文件是详情页 / API 共享的"契约"——结构变更必须同步此文件。
 *
 * 设计要点：
 * - 递归树 ModuleGroup（parent→children），组内直接挂 courses 或 children。
 * - 学期按 秋冬=FW(上)、春夏=SS(下)、短/暑=SHORT 归约，同时保留原文 rawLabel。
 * - 选择语义 selection：REQUIRED(全必修) / CHOOSE_ONE(选一门) / CHOOSE_N(修够N学分) / FLEXIBLE(任选) / CREDIT_ONLY(认定型)。
 */

// ─── 类型 ────────────────────────────────────────────

export type SelectionType =
  | "REQUIRED"
  | "CHOOSE_ONE"
  | "CHOOSE_N"
  | "FLEXIBLE"
  | "CREDIT_ONLY";

export type SemesterHalf = "FW" | "SS" | "SHORT";

export interface SemesterSlot {
  year: number;
  half: SemesterHalf;
  rawLabel: string; // 原文如 "二(冬)"
}

export interface ModuleCourse {
  courseCode: string;
  courseName: string;
  credits: number;
  semesters: SemesterSlot[];
  /** 培养方案原文标注（如辅修专业 "修读标注*课程" 的 * / **），用于辅修认定提示 */
  marks?: string[];
}

export interface ModuleGroup {
  name: string;
  requiredCredits: number | null;
  selection: SelectionType;
  ruleText?: string;
  courses?: ModuleCourse[];
  children?: ModuleGroup[];
}

export interface MinorProgram {
  name: string;
  requiredCredits: number | null;
  ruleText?: string;
  courses?: ModuleCourse[];
}

export interface GuidanceItem {
  seq: number;
  name: string;
  points: string;
  termMarks: string;
  remark: string;
}

export interface GuidanceActivity {
  kind: string; // "二课堂" | "三课堂" | "四课堂"
  items: GuidanceItem[];
}

export interface GuidanceYear {
  year: number;
  title: string;
  activities: GuidanceActivity[];
}

export interface ProgramVersionHeader {
  majorName: string;
  year: number;
  degree: string;
  durationYears: number;
  totalCredits: number;
  extraCredits: number;
  totalCreditsText: string;
  disciplineCategory: string;
  supportDiscipline: string;
  semesterSystem: string;
  coreCourses: string[];
  corePractices: string[];
  englishCourses: string[];
}

export interface ProgramDocument {
  formatVersion: string;
  source: { file: string; extractedAt: string; pageCount: number };
  programVersion: ProgramVersionHeader;
  moduleGroups: ModuleGroup[];
  minorPrograms?: MinorProgram[];
  guidanceByYear?: GuidanceYear[];
}

// ─── 标签 ────────────────────────────────────────────

export const SELECTION_LABELS: Record<SelectionType, string> = {
  REQUIRED: "必修",
  CHOOSE_ONE: "选一门",
  CHOOSE_N: "修满学分",
  FLEXIBLE: "任选",
  CREDIT_ONLY: "学分认定",
};

export const HALF_LABELS: Record<SemesterHalf, string> = {
  FW: "秋冬",
  SS: "春夏",
  SHORT: "短学期",
};

const HALF_ORDER: Record<SemesterHalf, number> = { FW: 0, SS: 1, SHORT: 2 };

const YEAR_CHARS = "一二三四五六七八九十";

/** 1→"一", 5→"五", 兜底 "第N年" */
export function yearChar(year: number): string {
  return YEAR_CHARS[year - 1] ?? `${year}`;
}

/** 1→"大一" */
export function yearLabel(year: number): string {
  return `大${yearChar(year)}`;
}

// ─── 树遍历 ──────────────────────────────────────────

export interface FlatCourse {
  course: ModuleCourse;
  path: string[]; // 从顶层到所在组的完整面包屑，如 ["1.通识课程","(6)通识选修课程","《大学写作》必修1门"]
  group: ModuleGroup;
}

/** 深度优先收集组内所有课程（children 与 courses 可并存，children 优先语义无关） */
export function collectCourses(groups: ModuleGroup[], path: string[] = []): FlatCourse[] {
  const result: FlatCourse[] = [];
  for (const g of groups) {
    const nextPath = [...path, g.name];
    for (const c of g.courses ?? []) result.push({ course: c, path: nextPath, group: g });
    if (g.children) result.push(...collectCourses(g.children, nextPath));
  }
  return result;
}

// ─── 按学期行动清单 ──────────────────────────────────

export interface SemesterCourseItem {
  courseCode: string;
  courseName: string;
  credits: number;
  rawLabel: string;
  path: string[];
  groupName: string;
  selection: SelectionType;
  /** 原文标注（* / **），透传自 ModuleCourse.marks */
  marks?: string[];
}

export interface SemesterEntry {
  key: string; // `${year}-${half}`
  year: number;
  half: SemesterHalf;
  title: string; // "大二·秋冬"
  items: SemesterCourseItem[];
}

/**
 * 将整棵树的课程按 (学年, 学期) 聚合，得到"按学期行动清单"。
 * 一门课跨多学期（如形势与政策 一秋冬+一春夏）会在多个学期出现，符合修读指导含义。
 */
export function buildSemesterPlan(document: ProgramDocument): SemesterEntry[] {
  const map = new Map<string, SemesterEntry>();
  for (const { course, path, group } of collectCourses(document.moduleGroups)) {
    for (const slot of course.semesters) {
      const key = `${slot.year}-${slot.half}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          year: slot.year,
          half: slot.half,
          title: `${yearLabel(slot.year)}·${HALF_LABELS[slot.half]}`,
          items: [],
        };
        map.set(key, entry);
      }
      entry.items.push({
        courseCode: course.courseCode,
        courseName: course.courseName,
        credits: course.credits,
        rawLabel: slot.rawLabel,
        path,
        groupName: group.name,
        selection: group.selection,
        marks: course.marks,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.year - b.year || HALF_ORDER[a.half] - HALF_ORDER[b.half],
  );
}

/** 无学期标注的课程（如英语水平测试、旧代码研究生课），单独兜底展示 */
export function collectUnscheduled(document: ProgramDocument): FlatCourse[] {
  return collectCourses(document.moduleGroups).filter(
    (f) => f.course.semesters.length === 0,
  );
}

// ─── 按学分进度板 ────────────────────────────────────

export interface GroupStats {
  /** 目标学分：组声明 requiredCredits 优先，否则为枚举课程学分之和 */
  targetCredits: number;
  /** 已通过学分（passed 集合内课程学分之和） */
  earnedCredits: number;
  /** 直接/间接枚举课程数 */
  courseCount: number;
}

/**
 * 递归计算每个组的学分统计。
 * passed 为已修课程代码集合（本地状态，可点选模拟）。
 * 用 Map<ModuleGroup, GroupStats> 关联原组对象，渲染时 O(1) 查表。
 */
export function computeStatsForGroups(
  groups: ModuleGroup[],
  passed: Set<string>,
): Map<ModuleGroup, GroupStats> {
  const stats = new Map<ModuleGroup, GroupStats>();
  const walk = (gs: ModuleGroup[]): void => {
    for (const g of gs) {
      let target = 0;
      let earned = 0;
      let count = 0;
      for (const c of g.courses ?? []) {
        target += c.credits;
        if (passed.has(c.courseCode)) earned += c.credits;
        count++;
      }
      if (g.children) {
        walk(g.children);
        for (const child of g.children) {
          const s = stats.get(child);
          if (!s) continue;
          target += s.targetCredits;
          earned += s.earnedCredits;
          count += s.courseCount;
        }
      }
      // 组声明了目标学分（如通识选修 10.5、美育 2）就以其为准；
      // 否则用枚举课程之和（REQUIRED 组一般等于目标）。
      const targetCredits = g.requiredCredits ?? target;
      // earned 封顶于 target：CHOOSE_N/FLEXIBLE/CREDIT_ONLY 组枚举课多、只需修够目标学分，
      // 全量求和会虚高（如材料专业模块 8 学分枚举 24 门）；CHOOSE_ONE 互斥子组同理。
      // 父组 earned 累加的是已封顶的子组，再对父组自身封顶，总进度永不超 100%。
      stats.set(g, { targetCredits, earnedCredits: Math.min(earned, targetCredits), courseCount: count });
    }
  };
  walk(groups);
  return stats;
}

/** 整棵树合计统计（顶部总进度条用） */
export function computeTotalStats(
  groups: ModuleGroup[],
  passed: Set<string>,
): GroupStats {
  let target = 0;
  let earned = 0;
  let count = 0;
  for (const g of groups) {
    const s = computeStatsForGroups([g], passed).get(g);
    if (!s) continue;
    target += s.targetCredits;
    earned += s.earnedCredits;
    count += s.courseCount;
  }
  return { targetCredits: target, earnedCredits: earned, courseCount: count };
}

// ─── 辅修方案 ──────────────────────────────────

export interface MinorTierView {
  key: "micro" | "major" | "degree";
  name: string;
  requiredCredits: number | null;
  ruleText?: string;
  courses: ModuleCourse[];
}

/**
 * 提取某个培养方案的辅修修读要求（三档）：
 * - 微辅修：minorPrograms 里现成的课程清单
 * - 辅修专业：主方案中标记 *（不含 **）的课程
 * - 辅修学位：主方案中标记 * 或 ** 的课程
 * 清洗时辅修专业/学位在 minorPrograms 里通常只有学分与规则（无课程清单），
 * 真实课程藏在主方案课程 marks 里（* = 辅修专业，** = 辅修学位）。
 * 某档无课程时 courses 为空数组，由 UI 诚实降级展示学分要求。
 */
export function buildMinorView(document: ProgramDocument): MinorTierView[] {
  const minors = document.minorPrograms ?? [];

  // 主方案中带标记的课程（同一课码出现多次时合并 marks，避免分档依赖出现顺序）
  const marked = new Map<string, { course: ModuleCourse; marks: string[] }>();
  for (const { course } of collectCourses(document.moduleGroups)) {
    const marks = course.marks ?? [];
    if (marks.length === 0) continue;
    const existing = marked.get(course.courseCode);
    if (existing) {
      existing.marks = Array.from(new Set([...existing.marks, ...marks]));
      existing.course.marks = existing.marks;
    } else {
      marked.set(course.courseCode, { course, marks: [...marks] });
    }
  }
  const byCode = (a: ModuleCourse, b: ModuleCourse) => a.courseCode.localeCompare(b.courseCode);
  const starOnly = [...marked.values()]
    .filter(({ marks }) => marks.includes("*") && !marks.includes("**"))
    .map(({ course }) => course)
    .sort(byCode);
  const starOrDouble = [...marked.values()]
    .filter(({ marks }) => marks.includes("*") || marks.includes("**"))
    .map(({ course }) => course)
    .sort(byCode);

  // 定位三档：精确名优先，子串兜底（覆盖"辅修专业（项目）""微辅修（xxx）"等变体，
  // 也兼容裸名"辅修"；"辅修"只做精确匹配以免误吞"辅修学位"）
  const findMinor = (exact: string[], substring: string[]) =>
    minors.find((m) => exact.includes(m.name ?? "")) ??
    minors.find((m) => substring.some((n) => (m.name ?? "").includes(n)));
  const micro = findMinor(["微辅修"], ["微辅修"]);
  const major = findMinor(["辅修专业", "辅修"], ["辅修专业"]);
  const degree = findMinor(["辅修学位"], ["辅修学位"]);

  // 微辅修课程按课码去重，与另两档一致（避免重复渲染导致 React key 冲突）
  const microCourses = new Map<string, ModuleCourse>();
  for (const c of micro?.courses ?? []) {
    if (!microCourses.has(c.courseCode)) microCourses.set(c.courseCode, c);
  }

  // 只输出文档确实提供了的档位：避免为裸名"辅修"等未分档条目虚构出不存在的档
  const tiers: MinorTierView[] = [];
  if (micro) {
    tiers.push({
      key: "micro",
      name: micro.name ?? "微辅修",
      requiredCredits: micro.requiredCredits ?? null,
      ruleText: micro.ruleText,
      courses: [...microCourses.values()].sort(byCode),
    });
  }
  if (major) {
    tiers.push({
      key: "major",
      name: major.name ?? "辅修专业",
      requiredCredits: major.requiredCredits ?? null,
      ruleText: major.ruleText,
      courses: starOnly,
    });
  }
  if (degree) {
    tiers.push({
      key: "degree",
      name: degree.name ?? "辅修学位",
      requiredCredits: degree.requiredCredits ?? null,
      ruleText: degree.ruleText,
      courses: starOrDouble,
    });
  } else if (starOrDouble.some((c) => c.marks?.includes("**"))) {
    // 主方案有 ** 标记但 minorPrograms 未抽出"辅修学位"条目：仍提供课程清单，学分未知
    tiers.push({
      key: "degree",
      name: "辅修学位",
      requiredCredits: null,
      ruleText: "按主方案标记 ** 的课程修读（培养方案未单独标注辅修学位学分）。",
      courses: starOrDouble,
    });
  }
  return tiers;
}
