// =============================================================================
// course-name.test.ts — 课程名清洗/规范化 + canonical 合并选择的单元测试
// =============================================================================

import { describe, it, expect } from "vitest";
import { sanitizeCourseName, normalizeCourseName, isRealName } from "@/lib/course-name";
import { pickCanonical, isBetterCanonical, type CanonicalCandidate } from "@/lib/course-merge";

describe("sanitizeCourseName", () => {
  it("移除 *△ 等批注符号", () => {
    expect(sanitizeCourseName("国际贸易实务*△")).toBe("国际贸易实务");
    expect(sanitizeCourseName("税收政策前沿专题**△")).toBe("税收政策前沿专题");
    expect(sanitizeCourseName("C程序设计基础*")).toBe("C程序设计基础");
    expect(sanitizeCourseName("*数学分析")).toBe("数学分析");
  });

  it("去除首尾空白", () => {
    expect(sanitizeCourseName("  数学物理方法  ")).toBe("数学物理方法");
  });

  it("空/空白名返回占位符（含 code）", () => {
    expect(sanitizeCourseName("", "82120020")).toBe("(课程名待补充:82120020)");
    expect(sanitizeCourseName("   ", "82120020")).toBe("(课程名待补充:82120020)");
    expect(sanitizeCourseName(null, "82120020")).toBe("(课程名待补充:82120020)");
  });

  it("空名无 fallback 时返回空串", () => {
    expect(sanitizeCourseName("")).toBe("");
    expect(sanitizeCourseName(null)).toBe("");
  });

  it("正常课程名不被改动", () => {
    expect(sanitizeCourseName("微积分（甲）Ⅰ")).toBe("微积分（甲）Ⅰ");
  });

  it("不剥离 # —— C# 是合法课程名，剥离会腐蚀并误合并", () => {
    expect(sanitizeCourseName("C#程序设计")).toBe("C#程序设计");
    expect(sanitizeCourseName("C#语言")).toBe("C#语言");
    expect(normalizeCourseName("C#语言")).not.toBe(normalizeCourseName("C语言"));
    expect(normalizeCourseName("C#程序设计")).not.toBe(normalizeCourseName("C程序设计"));
  });
});

describe("isRealName", () => {
  it("空/空白/占位符均不是真实名", () => {
    expect(isRealName("")).toBe(false);
    expect(isRealName("   ")).toBe(false);
    expect(isRealName(null)).toBe(false);
    expect(isRealName(undefined)).toBe(false);
    expect(isRealName("(课程名待补充:MATH1135G)")).toBe(false);
  });

  it("真实名是真实名", () => {
    expect(isRealName("微积分（甲）Ⅰ")).toBe(true);
    expect(isRealName("国际贸易实务")).toBe(true);
  });
});

describe("normalizeCourseName", () => {
  it("全角括号转半角", () => {
    expect(normalizeCourseName("线性代数（甲）")).toBe("线性代数(甲)");
  });

  it("罗马数字 Ⅰ→i（组内统一，可合并）", () => {
    expect(normalizeCourseName("微积分（甲）Ⅰ")).toBe("微积分(甲)i");
    expect(normalizeCourseName("微积分（甲）I")).toBe("微积分(甲)i");
    expect(normalizeCourseName("微积分（乙）Ⅱ")).toBe("微积分(乙)ii");
  });

  it("罗马数字 Ⅸ/Ⅹ 与圈号 ⑥-⑩ 归一（漏合并修复）", () => {
    expect(normalizeCourseName("大学英语Ⅸ")).toBe(normalizeCourseName("大学英语IX"));
    expect(normalizeCourseName("大学英语Ⅹ")).toBe(normalizeCourseName("大学英语X"));
    expect(normalizeCourseName("大学英语ⅸ")).toBe(normalizeCourseName("大学英语ix"));
    expect(normalizeCourseName("大学英语⑥")).toBe(normalizeCourseName("大学英语6"));
    expect(normalizeCourseName("大学英语⑩")).toBe(normalizeCourseName("大学英语10"));
  });

  it("去所有空白并小写", () => {
    expect(normalizeCourseName("C程序设计基础")).toBe("c程序设计基础");
    expect(normalizeCourseName(" 微积分 （甲） Ⅰ ")).toBe("微积分(甲)i");
  });

  it("保留（H）/（甲）/（乙）区分，荣誉班不合并进普通班", () => {
    expect(normalizeCourseName("微积分Ⅰ（H）")).toBe("微积分i(h)");
    expect(normalizeCourseName("微积分Ⅰ（H）")).not.toBe(normalizeCourseName("微积分（甲）Ⅰ"));
  });

  it("先清洗批注符号再规范化", () => {
    expect(normalizeCourseName("国际贸易实务*△")).toBe("国际贸易实务");
  });
});

describe("isBetterCanonical / pickCanonical", () => {
  const cand = (c: Partial<CanonicalCandidate>): CanonicalCandidate => ({
    code: "X0001",
    credits: 0,
    inSrc: false,
    weight: 0,
    letter: false,
    ...c,
  });

  it("主目录（inSrc）优先", () => {
    expect(
      isBetterCanonical(
        cand({ code: "MATH1135G", inSrc: true }),
        cand({ code: "821T0150", weight: 999, letter: true, credits: 9 }),
      ),
    ).toBe(true);
  });

  it("其次关系权重", () => {
    expect(
      isBetterCanonical(cand({ code: "A", weight: 100 }), cand({ code: "B", weight: 99 })),
    ).toBe(true);
    expect(
      isBetterCanonical(cand({ code: "A", weight: 99 }), cand({ code: "B", weight: 100 })),
    ).toBe(false);
  });

  it("再其次字母码优先于数字码", () => {
    expect(
      isBetterCanonical(cand({ code: "ECON2009M", letter: true }), cand({ code: "01120320" })),
    ).toBe(true);
  });

  it("然后学分高者优先", () => {
    expect(
      isBetterCanonical(cand({ code: "A", credits: 5 }), cand({ code: "B", credits: 4 })),
    ).toBe(true);
  });

  it("最后字典序小的码优先", () => {
    expect(
      isBetterCanonical(cand({ code: "B002" }), cand({ code: "A001" })),
    ).toBe(false);
    expect(
      isBetterCanonical(cand({ code: "A001" }), cand({ code: "B002" })),
    ).toBe(true);
  });

  it("空集合返回 null，单元素返回自身", () => {
    expect(pickCanonical([])).toBeNull();
    const only = cand({ code: "ONLY1" });
    expect(pickCanonical([only])).toEqual(only);
  });

  it("从多个候选中选出最佳 canonical", () => {
    const chosen = pickCanonical([
      cand({ code: "01120320" }),
      cand({ code: "INTC4008M", letter: true, weight: 40, credits: 2 }),
      cand({ code: "ECON2009M", letter: true, weight: 10, credits: 3 }),
    ]);
    expect(chosen?.code).toBe("INTC4008M");
  });
});
