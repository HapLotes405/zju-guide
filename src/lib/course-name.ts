// =============================================================================
// course-name.ts — 课程名清洗与规范化（合并去重的唯一身份）
// 供课程导入、培养方案导入、课程清理脚本共用，避免各入口处理逻辑漂移。
// =============================================================================

/**
 * 浙大课程目录里的批注符号（*△▲等）混入课程名。这些符号在中文课程名中
 * 从不合法出现，可直接移除。
 * 注意：不含 `#`——"C#程序设计" 是合法课程名，剥离会腐蚀并误合并。
 */
const ANNOTATION_SYMBOLS = /[*△▲◇☆★○●◎□■✦✧◆]/g;

/** 占位符前缀：`(课程名待补充:<code>)` */
export const PLACEHOLDER_PREFIX = "(课程名待补充:";

/**
 * 是否为「真实课程名」：非空、非纯空白、且不是占位符。
 * 三个导入入口（培养方案 import / sync-courses / cleanup 恢复）都以此守卫——
 * 占位符可被真实名升级，真实名绝不覆盖。
 */
export function isRealName(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = name.trim();
  return !!t && !t.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * 清洗课程名：去首尾空白 + 移除 *△ 等批注符号。
 * 若结果为空白，返回占位符 `(课程名待补充:<code>)`（fallbackCode 提供时）或空串。
 */
export function sanitizeCourseName(
  name: string | null | undefined,
  fallbackCode?: string,
): string {
  if (!name) return fallbackCode ? `${PLACEHOLDER_PREFIX}${fallbackCode})` : "";
  let n = name.replace(ANNOTATION_SYMBOLS, "").replace(/\s+/g, " ").trim();
  if (!n) return fallbackCode ? `${PLACEHOLDER_PREFIX}${fallbackCode})` : "";
  return n;
}

/** 全角→半角与罗马数字等字符映射（与 prisma/import-v3.cjs 的 normalize() 保持一致） */
const ROMAN: Record<string, string> = {
  "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV",
  "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII",
  "Ⅸ": "IX", "Ⅹ": "X",
  "ⅰ": "i", "ⅱ": "ii", "ⅲ": "iii", "ⅳ": "iv",
  "ⅴ": "v", "ⅵ": "vi", "ⅶ": "vii", "ⅷ": "viii",
  "ⅸ": "ix", "ⅹ": "x",
  "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
  "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10",
};

/**
 * 规范化课程名：用作「逻辑课程」的唯一身份。合并去重按此分组的 key。
 * 清洗 + 全角括号/标点转半角 + 罗马数字转 ASCII + 去所有空白 + 小写。
 * 注意：不删除（H）/（甲）/（乙）等区分性后缀，荣誉班与普通班保持分离。
 */
export function normalizeCourseName(name: string): string {
  let n = sanitizeCourseName(name).trim();
  n = n.replace(/[（[]/g, "(").replace(/[）\]]/g, ")");
  n = n.replace(/：/g, ":").replace(/，/g, ",").replace(/；/g, ";");
  n = n.replace(/[／/]/g, "/").replace(/[、]/g, ",").replace(/[·・]/g, "");
  for (const [r, a] of Object.entries(ROMAN)) n = n.split(r).join(a);
  n = n.replace(/\s+/g, "").replace(/　/g, "").toLowerCase();
  return n;
}
