// =============================================================================
// course-merge.ts — 同名课程合并时 canonical 课程选择的纯逻辑（可单测）
// 不依赖数据库/文件系统，方便对优先级规则做单元测试。
// =============================================================================

export interface CanonicalCandidate {
  code: string;
  credits: number;
  /** 是否在 zju_courses.json 主目录中（curated 课程库优先） */
  inSrc: boolean;
  /** 关系权重：TeacherCourse*10 + ProgramCourse*3（+ 其余关系） */
  weight: number;
  /** 是否含字母（字母码优先于旧数字码） */
  letter: boolean;
}

/**
 * 比较两个候选课程，返回 a 是否严格优于 b。
 * 优先级：主目录 → 关系权重 → 字母码 → 学分 → 字典序小的码。
 */
export function isBetterCanonical(a: CanonicalCandidate, b: CanonicalCandidate): boolean {
  if (a.inSrc !== b.inSrc) return a.inSrc;
  if (a.weight !== b.weight) return a.weight > b.weight;
  if (a.letter !== b.letter) return a.letter;
  if (a.credits !== b.credits) return a.credits > b.credits;
  return a.code < b.code;
}

/** 从候选集合中选出 canonical；空集合返回 null。 */
export function pickCanonical(candidates: CanonicalCandidate[]): CanonicalCandidate | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (isBetterCanonical(c, best)) best = c;
  }
  return best;
}
