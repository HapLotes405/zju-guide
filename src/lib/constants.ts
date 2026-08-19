// 资源类型标签 — 全站统一
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  EBOOK: "电子书/教材",
  LECTURE_NOTE: "课堂笔记",
  EXAM_RECALL: "真题回忆",
  BLOG: "博客/经验帖",
  CC98_POST: "CC98 帖子",
  TOOL_TEMPLATE: "工具/模板",
  OTHER: "其他",
};

// 适用阶段标签 — 按学习进度分类：平时学习 / 小测 / 期中 / 期末
export const APPLICABLE_STAGE_LABELS: Record<string, string> = {
  COURSE: "平时学习",
  QUIZ: "小测",
  MIDTERM: "期中",
  FINAL: "期末",
};
