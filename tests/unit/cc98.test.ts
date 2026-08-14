// =============================================================================
// cc98.test.ts — CC98 跳转链接构造的单元测试
// 期望值来自线上 www.cc98.org 顶栏实测：/search?boardId=0&keyword=<二次编码>
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildCC98SearchUrl, CC98_BASE_URL } from "@/lib/cc98";

describe("buildCC98SearchUrl", () => {
  it("构造全站搜索链接：boardId=0 + keyword 二次编码，与线上顶栏一致", () => {
    expect(buildCC98SearchUrl("微经")).toBe(
      `${CC98_BASE_URL}/search?boardId=0&keyword=%25E5%25BE%25AE%25E7%25BB%258F`,
    );
    expect(buildCC98SearchUrl("线代")).toBe(
      `${CC98_BASE_URL}/search?boardId=0&keyword=%25E7%25BA%25BF%25E4%25BB%25A3`,
    );
    expect(buildCC98SearchUrl("微积分")).toBe(
      `${CC98_BASE_URL}/search?boardId=0&keyword=%25E5%25BE%25AE%25E7%25A7%25AF%25E5%2588%2586`,
    );
  });

  it("keyword 是二次编码（含 %25），浏览器解码一层后仍带 %，前端再解一层还原原文", () => {
    const url = buildCC98SearchUrl("微积分");
    // 二次编码的特征：出现 %25
    expect(url).toContain("keyword=%25E5%25BE%25AE");
    // 浏览器/URLSearchParams 解码一层后仍应是编码形态，而非直接是原文
    const once = new URL(url).searchParams.get("keyword")!;
    expect(once).toBe("%E5%BE%AE%E7%A7%AF%E5%88%86");
    // 再解一层还原原文
    expect(decodeURIComponent(once)).toBe("微积分");
  });

  it("特殊字符被正确二次编码（# 空格 & 这类会被 URL 截断/分节的字符）", () => {
    expect(buildCC98SearchUrl("C#程序设计")).toBe(
      `${CC98_BASE_URL}/search?boardId=0&keyword=C%2523%25E7%25A8%258B%25E5%25BA%258F%25E8%25AE%25BE%25E8%25AE%25A1`,
    );
    expect(buildCC98SearchUrl("计算机与网络")).toBe(
      `${CC98_BASE_URL}/search?boardId=0&keyword=%25E8%25AE%25A1%25E7%25AE%2597%25E6%259C%25BA%25E4%25B8%258E%25E7%25BD%2591%25E7%25BB%259C`,
    );
    expect(buildCC98SearchUrl("数据结构 A")).toBe(
      `${CC98_BASE_URL}/search?boardId=0&keyword=%25E6%2595%25B0%25E6%258D%25AE%25E7%25BB%2593%25E6%259E%2584%2520A`,
    );
  });

  it("带 boardId=0 表示全站搜索，URL 结构稳定", () => {
    const url = buildCC98SearchUrl("微经");
    expect(url).toContain("/search?boardId=0&keyword=");
    expect(url).not.toContain("type=");
  });
});
