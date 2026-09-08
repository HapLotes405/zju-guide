import { describe, expect, it } from "vitest";
import {
  candidateUpdateSchema,
  selectionSchema,
  importDayStart,
} from "../../src/lib/website-import-policy";

describe("website import review policy", () => {
  const valid = {
    title: "数据结构基础",
    summary: "",
    type: "BLOG",
    applicableStage: "COURSE",
    courseCodes: ["21100240"],
  };
  it("requires an actual course confirmation before submission", () => {
    expect(candidateUpdateSchema.safeParse({ ...valid, courseCodes: [] }).success).toBe(false);
    expect(candidateUpdateSchema.parse(valid).courseCodes).toEqual(["21100240"]);
  });
  it("rejects oversized or invalid candidate fields", () => {
    expect(candidateUpdateSchema.safeParse({ ...valid, title: "x".repeat(121) }).success).toBe(
      false,
    );
    expect(candidateUpdateSchema.safeParse({ ...valid, type: "WEBSITE" }).success).toBe(false);
    expect(candidateUpdateSchema.safeParse({ ...valid, courseCodes: [" "] }).success).toBe(false);
  });
  it("limits one submission to 30 unique candidates", () => {
    expect(selectionSchema.safeParse({ candidateIds: [] }).success).toBe(false);
    expect(
      selectionSchema.safeParse({ candidateIds: Array.from({ length: 31 }, (_, i) => `id${i}`) })
        .success,
    ).toBe(false);
    expect(selectionSchema.parse({ candidateIds: ["one", "one"] }).candidateIds).toEqual(["one"]);
  });
  it("uses the Shanghai calendar day for administrator quotas", () => {
    expect(importDayStart(new Date("2026-09-08T17:00:00Z")).toISOString()).toBe(
      "2026-09-08T16:00:00.000Z",
    );
  });
});
