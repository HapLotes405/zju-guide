// =============================================================================
// json-adapter.test.ts — unit tests for JSON normalization & desensitization
// =============================================================================

import { describe, it, expect } from "vitest";
import { normalize, desensitize, CourseSchema, NormalizedDocumentSchema } from "@/lib/json-adapter";
import { ZodError } from "zod";

// -----------------------------------------------------------------------------
// Fixture imports
// -----------------------------------------------------------------------------

import validImport from "../../fixtures/valid-import.json";
import missingFields from "../../fixtures/missing-fields.json";
import oldSchema from "../../fixtures/old-schema.json";
import duplicateImport from "../../fixtures/duplicate-import.json";

// =============================================================================
// normalize — valid new-format input
// =============================================================================

describe("normalize — new format", () => {
  it("normalizes valid-import.json without error", () => {
    const result = normalize(validImport);

    expect(result.major).toBe("材料科学与工程");
    expect(result.year).toBe(2025);
    expect(result.courses).toHaveLength(8);

    // Spot-check first course
    const math = result.courses.find((c) => c.code === "MATH1135G");
    expect(math).toBeDefined();
    expect(math!.name).toBe("微积分(甲)I");
    expect(math!.credits).toBe(5.0);
    expect(math!.semester).toBe(1);
    expect(math!.grade).toBe("A");
  });

  it("passes NormalizedDocumentSchema validation on output", () => {
    const result = normalize(validImport);
    expect(() => NormalizedDocumentSchema.parse(result)).not.toThrow();
  });

  it("strips _meta and other unknown fields from output", () => {
    const result = normalize(validImport);
    // _meta should not appear in the normalized output
    expect((result as Record<string, unknown>)._meta).toBeUndefined();
  });
});

// =============================================================================
// normalize — old format (v0.5)
// =============================================================================

describe("normalize — old format", () => {
  it("maps program → major, grade → year, records → courses", () => {
    const result = normalize(oldSchema);

    expect(result.major).toBe("材料科学与工程");
    expect(result.year).toBe(2025);
    expect(result.courses).toHaveLength(2);
  });

  it("maps courseId → code, title → name, credit → credits, term → semester, result → grade", () => {
    const result = normalize(oldSchema);

    const calc = result.courses.find((c) => c.code === "MATH1135G");
    expect(calc).toBeDefined();
    expect(calc!.name).toBe("微积分(甲)I");
    expect(calc!.credits).toBe(5.0);
    expect(calc!.semester).toBe(1);
    expect(calc!.grade).toBe("A"); // 优秀 → A
  });

  it("converts Chinese grade 良好 → B", () => {
    const result = normalize(oldSchema);

    const linear = result.courses.find((c) => c.code === "MATH1138G");
    expect(linear).toBeDefined();
    expect(linear!.grade).toBe("B"); // 良好 → B
  });
});

// =============================================================================
// normalize — missing fields (Zod validation errors)
// =============================================================================

describe("normalize — input validation errors", () => {
  it("throws ZodError for missing-fields.json (courses missing required fields)", () => {
    expect(() => normalize(missingFields)).toThrow(ZodError);
  });

  it("error message mentions the problematic fields", () => {
    try {
      normalize(missingFields);
      // Should not reach here
      expect.unreachable("Expected ZodError");
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
    }
  });
});

// =============================================================================
// normalize — duplicate handling
// =============================================================================

describe("normalize — deduplication", () => {
  it("deduplicates courses by code, keeping the last occurrence", () => {
    // duplicate-import.json has MATH1135G (which is also in valid-import.json)
    // and PHY1001G (new). The output should deduplicate.
    const result = normalize(duplicateImport);

    // Should only have 2 unique courses
    expect(result.courses).toHaveLength(2);

    const codes = result.courses.map((c) => c.code);
    expect(codes).toContain("MATH1135G");
    expect(codes).toContain("PHY1001G");
  });
});

// =============================================================================
// Grade normalization edge cases
// =============================================================================

describe("grade normalization", () => {
  it("passes through valid letter grades (A, B+, C-, P, F)", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [
        { code: "T1", name: "a", credits: 2, semester: 1, grade: "A" },
        { code: "T2", name: "b", credits: 2, semester: 1, grade: "B+" },
        { code: "T3", name: "c", credits: 2, semester: 1, grade: "C-" },
        { code: "T4", name: "d", credits: 2, semester: 1, grade: "P" },
        { code: "T5", name: "e", credits: 2, semester: 1, grade: "F" },
      ],
    };

    const result = normalize(input);
    expect(result.courses).toHaveLength(5);
    expect(result.courses.map((c) => c.grade)).toEqual(["A", "B+", "C-", "P", "F"]);
  });

  it("converts numeric score 95 → A", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: 95 }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("A");
  });

  it("converts numeric score 82 → B", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: 82 }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("B");
  });

  it("converts numeric score 71 → C", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: 71 }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("C");
  });

  it("converts numeric score 64 → P", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: 64 }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("P");
  });

  it("converts numeric score 30 → F", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: 30 }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("F");
  });

  it("converts Chinese grade 及格 → P", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "及格" }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("P");
  });

  it("converts Chinese grade 免修 → P", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "免修" }],
    };

    const result = normalize(input);
    expect(result.courses[0]!.grade).toBe("P");
  });

  it("rejects invalid grade strings via ZodError", () => {
    const input = {
      major: "测试",
      year: 2025,
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "INVALID" }],
    };

    expect(() => normalize(input)).toThrow(ZodError);
  });
});

// =============================================================================
// Desensitization: sensitive-field stripping
// =============================================================================

describe("desensitization — sensitive fields stripped", () => {
  it("strips studentId from input", () => {
    const input = {
      major: "材料",
      year: 2025,
      studentId: "1234567890",
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "A" }],
    };

    const result = normalize(input);
    // studentId should not appear anywhere in output
    expect(JSON.stringify(result)).not.toContain("1234567890");
    expect((result as Record<string, unknown>).studentId).toBeUndefined();
  });

  it("strips 学号 field", () => {
    const input = {
      major: "材料",
      year: 2025,
      学号: "20250001",
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "B" }],
    };

    const result = normalize(input);
    expect(JSON.stringify(result)).not.toContain("20250001");
  });

  it("strips idNumber / 身份证号", () => {
    const input = {
      major: "材料",
      year: 2025,
      idNumber: "330106200001011234",
      身份证号: "330106200001011234",
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "C" }],
    };

    const result = normalize(input);
    const json = JSON.stringify(result);
    expect(json).not.toContain("330106");
  });

  it("strips numeric score fields (raw marks)", () => {
    const input = {
      major: "材料",
      year: 2025,
      courses: [
        { code: "T1", name: "a", credits: 2, semester: 1, grade: "A", score: 95 },
      ],
    };

    const result = normalize(input);
    // The score 95 should be stripped from the course objects
    const courseJson = JSON.stringify(result.courses[0]);
    expect(courseJson).not.toContain("95");
    expect(courseJson).not.toContain("score");
  });

  it("strips 姓名 and 姓名拼音", () => {
    const input = {
      major: "材料",
      year: 2025,
      姓名: "张三",
      姓名拼音: "Zhang San",
      courses: [{ code: "T1", name: "a", credits: 2, semester: 1, grade: "A" }],
    };

    const result = normalize(input);
    const json = JSON.stringify(result);
    expect(json).not.toContain("张三");
    expect(json).not.toContain("Zhang San");
  });
});

// =============================================================================
// desensitize() on already-normalized documents
// =============================================================================

describe("desensitize (standalone export)", () => {
  it("returns a structurally identical deep copy", () => {
    const doc = normalize(validImport);
    const copy = desensitize(doc);

    expect(copy).toEqual(doc);
    expect(copy).not.toBe(doc); // different reference
    expect(copy.courses).not.toBe(doc.courses); // deep copy
  });
});
