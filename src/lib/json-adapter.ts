import { z } from "zod";

// ──────────────────────────────────────────
// Grade normalization
// ──────────────────────────────────────────

/** Valid grade pattern: A+/A/A-, B+/B/B-, C+/C/C-, P, F */
const GRADE_PATTERN = /^[ABC][+-]?$|^[PF]$/;

/** Chinese grade labels → letter grade mapping */
const CHINESE_GRADE_MAP: Record<string, string> = {
  优秀: "A",
  良好: "B",
  中等: "C",
  及格: "P",
  不及格: "F",
  通过: "P",
  不通过: "F",
  免修: "P",
  缓考: "P",
};

/** Convert numeric score (0-100) → letter grade */
function scoreToGrade(score: number): string {
  if (score < 0 || score > 100) return String(score); // will fail schema later
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "P";
  return "F";
}

/**
 * Normalize a raw grade value (string | number) into a letter grade.
 * - Numeric scores (e.g. 95) → letter grade via scoreToGrade
 * - Chinese labels (e.g. 优秀) → letter grade via map
 * - Already-valid letter grades pass through unchanged
 */
function normalizeGrade(raw: unknown): string {
  if (typeof raw === "number") return scoreToGrade(raw);

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // Numeric-as-string, e.g. "95"
    const num = Number(trimmed);
    if (!Number.isNaN(num) && trimmed.length > 0) return scoreToGrade(num);

    // Chinese label
    if (CHINESE_GRADE_MAP[trimmed]) return CHINESE_GRADE_MAP[trimmed]!;

    // Already a letter grade
    if (GRADE_PATTERN.test(trimmed)) return trimmed;
  }

  // Fallback — return as string; downstream Zod check will reject it
  return String(raw);
}

// ──────────────────────────────────────────
// Zod schemas
// ──────────────────────────────────────────

/** Standardized course record */
export const CourseSchema = z.object({
  code: z.string().min(1, "课程代码不能为空"),
  name: z.string().min(1, "课程名称不能为空"),
  credits: z.number().min(0, "学分不能为负数"),
  semester: z.number().int().min(1, "学期必须 >= 1"),
  grade: z.string().regex(GRADE_PATTERN, "等级必须为 A/B/C/P/F 或其带+/-变体"),
});

/** A single course as stored in the normalized document */
export type Course = z.infer<typeof CourseSchema>;

/** Normalized document — the single output shape of `normalize()` */
export const NormalizedDocumentSchema = z.object({
  major: z.string().min(1),
  year: z.number().int().positive(),
  courses: z.array(CourseSchema),
});

/** Normalized document type */
export type NormalizedDocument = z.infer<typeof NormalizedDocumentSchema>;

// ──────────────────────────────────────────
// Input-format schemas (used internally)
// ──────────────────────────────────────────

/** New-format input (schemaVersion 1.0): `{ major, year, courses: […] }` */
const NewFormatInputSchema = z.object({
  major: z.string().min(1),
  year: z.number().int().positive(),
  courses: z.array(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      credits: z.number().min(0),
      semester: z.number().int().min(1),
      grade: z.union([z.string(), z.number()]),
    }),
  ),
});

/** Old-format input (schemaVersion 0.5): `{ program, grade, records: […] }` */
const OldFormatInputSchema = z.object({
  program: z.string().min(1),
  grade: z.number().int().positive(),
  records: z.array(
    z.object({
      courseId: z.string().min(1),
      title: z.string().min(1),
      credit: z.number().min(0),
      term: z.number().int().min(1),
      result: z.union([z.string(), z.number()]),
    }),
  ),
});

// ──────────────────────────────────────────
// Desensitization helpers
// ──────────────────────────────────────────

/**
 * Known sensitive keys that must never be stored.
 * These are stripped recursively from input before processing.
 */
const SENSITIVE_KEYS = new Set([
  "studentId",
  "student_id",
  "学号",
  "studentNo",
  "studentNumber",
  "idNumber",
  "身份证号",
  "身份证",
  "name_zh", // avoid ambiguous personal-name fields
  "姓名",
  "姓名拼音",
]);

/**
 * Deep-strip sensitive fields (学号, 身份证号, etc.) from an object.
 * Also removes any numeric `score` field that looks like a raw exam mark.
 */
export function stripSensitive(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) continue;

    // Remove numeric "score" fields that look like raw marks (0-100)
    if (
      key === "score" &&
      (typeof value === "number" || (typeof value === "string" && /^\d{1,3}$/.test(value)))
    ) {
      continue;
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = stripSensitive(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ──────────────────────────────────────────
// Format detection
// ──────────────────────────────────────────

function isOldFormat(
  data: unknown,
): data is z.infer<typeof OldFormatInputSchema> {
  return (
    typeof data === "object" &&
    data !== null &&
    "program" in data &&
    "records" in data
  );
}

// ──────────────────────────────────────────
// Core: normalize
// ──────────────────────────────────────────

/**
 * Normalize any supported 教务 JSON payload into the standardized format.
 *
 * Performs:
 * 1. Format detection (new `{major, year, courses}` or old `{program, grade, records}`)
 * 2. Field-name mapping from old → new schema
 * 3. Desensitization: strips 学号 / 身份证号 / numeric scores
 * 4. Grade normalization: numeric scores & Chinese labels → letter grades (A/B/C/P/F)
 * 5. Zod validation at both input and output layers
 * 6. Deduplication by course code (last occurrence wins)
 *
 * @throws {ZodError} if the input fails schema validation or grades cannot be normalized
 */
export function normalize(rawJson: unknown): NormalizedDocument {
  // Step 1 — strip sensitive fields before anything touches the data
  if (
    rawJson !== null &&
    typeof rawJson === "object" &&
    !Array.isArray(rawJson)
  ) {
    rawJson = stripSensitive(rawJson as Record<string, unknown>);
  }

  // Step 2 — detect format, parse, and map to common shape
  let major: string;
  let year: number;
  let coursesRaw: Array<{
    code: unknown;
    name: unknown;
    credits: unknown;
    semester: unknown;
    grade: unknown;
  }>;

  if (isOldFormat(rawJson)) {
    const parsed = OldFormatInputSchema.parse(rawJson);
    major = parsed.program;
    year = parsed.grade;
    coursesRaw = parsed.records.map((r) => ({
      code: r.courseId,
      name: r.title,
      credits: r.credit,
      semester: r.term,
      grade: r.result,
    }));
  } else {
    const parsed = NewFormatInputSchema.parse(rawJson);
    major = parsed.major;
    year = parsed.year;
    coursesRaw = parsed.courses.map((c) => ({
      code: c.code,
      name: c.name,
      credits: c.credits,
      semester: c.semester,
      grade: c.grade,
    }));
  }

  // Step 3 — normalize grades and validate each course
  const courses: Course[] = coursesRaw.map((c) =>
    CourseSchema.parse({
      code: c.code,
      name: c.name,
      credits: c.credits,
      semester: c.semester,
      grade: normalizeGrade(c.grade),
    }),
  );

  // Step 4 — deduplicate by course code (last-wins, keeps the latest entry)
  const deduped = new Map<string, Course>();
  for (const course of courses) {
    deduped.set(course.code, course);
  }

  return {
    major,
    year,
    courses: [...deduped.values()],
  };
}

/**
 * Desensitize an already-normalized document, returning a deep copy.
 * Useful for re-stripping data that may have been added after normalization.
 */
export function desensitize(doc: NormalizedDocument): NormalizedDocument {
  return {
    major: doc.major,
    year: doc.year,
    courses: doc.courses.map((c) => ({
      code: c.code,
      name: c.name,
      credits: c.credits,
      semester: c.semester,
      grade: c.grade,
    })),
  };
}

// Re-export zod for consumers who want to build their own schemas
export { z };
