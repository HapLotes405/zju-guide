// =============================================================================
// path-engine.test.ts — unit tests for the four path calculation engines
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeRequired,
  computeGenEd,
  computeOverdue,
  computeMinor,
} from "@/lib/path-engine";
import type {
  CourseRecordSnapshot,
  ProgramCourseSnapshot,
  RequirementGroupSnapshot,
  ProgramVersionSnapshot,
} from "@/lib/path-engine";

// -----------------------------------------------------------------------------
// Shared fixture helpers
// -----------------------------------------------------------------------------

const PROGRAM_VERSION: ProgramVersionSnapshot = {
  id: "pv-001",
  majorName: "材料科学与工程",
  year: 2025,
};

function makeCourseRecord(
  courseCode: string,
  status: "PASSED" | "ENROLLED" | "PLANNED",
  semester: number | null = null,
): CourseRecordSnapshot {
  return { courseCode, status, semester };
}

function makeProgramCourse(
  courseCode: string,
  suggestedSemester: number,
  isCompulsory: boolean,
  credits: number,
  requirementGroupId: string | null = null,
  requirementGroup: ProgramCourseSnapshot["requirementGroup"] = null,
): ProgramCourseSnapshot {
  return {
    courseCode,
    suggestedSemester,
    isCompulsory,
    requirementGroupId,
    course: {
      code: courseCode,
      name: `Course ${courseCode}`,
      credits,
      department: "测试学院",
      category: null,
    },
    requirementGroup,
  };
}

function makeRequirementGroup(
  id: string,
  name: string,
  category: string,
  requiredCredits: number,
  programCourses: ProgramCourseSnapshot[],
): RequirementGroupSnapshot {
  return {
    id,
    name,
    category,
    requiredCredits,
    programCourses: programCourses.map((pc) => ({
      ...pc,
      requirementGroupId: id,
      requirementGroup: { id, name, category, requiredCredits },
    })),
  };
}

// =============================================================================
// 类型1 — computeRequired
// =============================================================================

describe("computeRequired", () => {
  const currentSemester = 3;

  it("returns compulsory courses for the current semester, excluding passed ones", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 3, true, 4),
      makeProgramCourse("CS102", 3, true, 3),
      makeProgramCourse("CS103", 3, false, 2), // not compulsory
      makeProgramCourse("CS104", 4, true, 3), // wrong semester
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PASSED", 3), // already passed → excluded
      makeCourseRecord("CS102", "ENROLLED", 3), // enrolled but not passed → included
    ];

    const result = computeRequired(programCourses, records, currentSemester, PROGRAM_VERSION);

    expect(result.reasonCode).toBe("REQUIRED_CURRENT_SEMESTER");
    expect(result.ruleSource).toBe("program_version.required_current_semester");
    expect(result.programVersion).toEqual(PROGRAM_VERSION);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.courseCode).toBe("CS102");
    expect(result.courses[0]!.credits).toBe(3);
    expect(result.courses[0]!.suggestedSemester).toBe(3);
  });

  it("returns an empty list when all courses are already passed", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 3, true, 4),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PASSED", 3),
    ];

    const result = computeRequired(programCourses, records, currentSemester, PROGRAM_VERSION);

    expect(result.courses).toHaveLength(0);
  });

  it("returns an empty list when no courses match the current semester", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 1, true, 4),
      makeProgramCourse("CS201", 5, true, 3),
    ];

    const records: CourseRecordSnapshot[] = [];

    const result = computeRequired(programCourses, records, currentSemester, PROGRAM_VERSION);

    expect(result.courses).toHaveLength(0);
  });

  it("handles empty programCourses", () => {
    const result = computeRequired([], [], currentSemester, PROGRAM_VERSION);
    expect(result.courses).toHaveLength(0);
  });

  it("returns null programVersion when provided", () => {
    const result = computeRequired([], [], currentSemester, null);
    expect(result.programVersion).toBeNull();
    expect(result.reasonCode).toBe("REQUIRED_CURRENT_SEMESTER");
  });

  it("excludes PLANNED courses (not yet passed)", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 3, true, 4),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PLANNED", null), // not PASSED
    ];

    const result = computeRequired(programCourses, records, currentSemester, PROGRAM_VERSION);

    // PLANNED is not PASSED, so it should still appear as required
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.courseCode).toBe("CS101");
  });

  it("excludes ENROLLED courses (in-progress, not yet passed)", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 3, true, 4),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "ENROLLED", 3),
    ];

    const result = computeRequired(programCourses, records, currentSemester, PROGRAM_VERSION);

    // ENROLLED is not PASSED, still required
    expect(result.courses).toHaveLength(1);
  });
});

// =============================================================================
// 类型2 — computeGenEd
// =============================================================================

describe("computeGenEd", () => {
  it("calculates progress for gen_ed groups correctly", () => {
    // Group: 自然科学通识, 18 credits required, 2 courses worth 7 credits total
    const pc1 = makeProgramCourse("MATH101", 1, true, 5, "g1");
    const pc2 = makeProgramCourse("PHY101", 2, true, 4, "g1");

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("g1", "自然科学通识", "gen_ed", 18, [pc1, pc2]),
      makeRequirementGroup("g2", "学科基础课程", "major_base", 11, []),
    ];

    // User passed MATH101 (5 credits earned)
    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("MATH101", "PASSED", 1),
    ];

    const result = computeGenEd(groups, records, PROGRAM_VERSION);

    expect(result.reasonCode).toBe("GEN_ED_PROGRESS");
    expect(result.ruleSource).toBe("program_version.gen_ed_requirement");
    expect(result.programVersion).toEqual(PROGRAM_VERSION);

    // Only gen_ed groups should be included
    expect(result.groups).toHaveLength(1);
    const group = result.groups[0]!;
    expect(group.groupName).toBe("自然科学通识");
    expect(group.requiredCredits).toBe(18);
    expect(group.earnedCredits).toBe(5);
    expect(group.remainingCredits).toBe(13);
    expect(group.passedCourseCodes).toEqual(["MATH101"]);
  });

  it("caps earnedCredits at requiredCredits (no overflow)", () => {
    const pc1 = makeProgramCourse("MATH101", 1, true, 20, "g1"); // 20 > 18 required

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("g1", "通识", "gen_ed", 18, [pc1]),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("MATH101", "PASSED", 1),
    ];

    const result = computeGenEd(groups, records, PROGRAM_VERSION);

    expect(result.groups[0]!.earnedCredits).toBe(18); // capped
    expect(result.groups[0]!.remainingCredits).toBe(0);
  });

  it("returns empty groups when no gen_ed groups exist", () => {
    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("g1", "专业核心", "major_core", 22, []),
    ];

    const result = computeGenEd(groups, [], PROGRAM_VERSION);
    expect(result.groups).toHaveLength(0);
  });

  it("handles multiple gen_ed groups", () => {
    const pc1 = makeProgramCourse("MATH101", 1, true, 5, "g1");
    const pc2 = makeProgramCourse("PHY101", 1, true, 4, "g2");

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("g1", "自然科学通识", "gen_ed", 18, [pc1]),
      makeRequirementGroup("g2", "人文通识", "gen_ed", 6, [pc2]),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("MATH101", "PASSED", 1),
      makeCourseRecord("PHY101", "PASSED", 1),
    ];

    const result = computeGenEd(groups, records, PROGRAM_VERSION);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]!.earnedCredits).toBe(5);
    expect(result.groups[1]!.earnedCredits).toBe(4);
  });

  it("handles no passed records — all remaining", () => {
    const pc1 = makeProgramCourse("MATH101", 1, true, 5, "g1");

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("g1", "自然科学通识", "gen_ed", 18, [pc1]),
    ];

    const result = computeGenEd(groups, [], PROGRAM_VERSION);

    expect(result.groups[0]!.earnedCredits).toBe(0);
    expect(result.groups[0]!.remainingCredits).toBe(18);
    expect(result.groups[0]!.passedCourseCodes).toEqual([]);
  });
});

// =============================================================================
// 类型3 — computeOverdue
// =============================================================================

describe("computeOverdue", () => {
  const currentSemester = 5;

  it("returns compulsory courses from earlier semesters that are not passed", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 1, true, 4),
      makeProgramCourse("CS201", 2, true, 3),
      makeProgramCourse("CS301", 3, true, 4),
      makeProgramCourse("CS401", 4, true, 3),
      makeProgramCourse("CS501", 5, true, 3), // current semester → not overdue
      makeProgramCourse("CS601", 6, true, 3), // future → not overdue
      makeProgramCourse("CS701", 3, false, 2), // not compulsory
    ];

    // Only CS301 passed — CS101, CS201, CS401 should be overdue
    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS301", "PASSED", 3),
    ];

    const result = computeOverdue(programCourses, records, currentSemester, PROGRAM_VERSION);

    expect(result.reasonCode).toBe("OVERDUE_COMPULSORY");
    expect(result.ruleSource).toBe("program_version.overdue_compulsory");
    expect(result.programVersion).toEqual(PROGRAM_VERSION);

    expect(result.courses).toHaveLength(3);
    // Sorted by suggestedSemester ascending
    expect(result.courses.map((c) => c.courseCode)).toEqual(["CS101", "CS201", "CS401"]);
  });

  it("returns an empty list when all overdue courses are passed", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 1, true, 4),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PASSED", 1),
    ];

    const result = computeOverdue(programCourses, records, currentSemester, PROGRAM_VERSION);
    expect(result.courses).toHaveLength(0);
  });

  it("returns an empty list when user is in semester 1 (nothing can be overdue)", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS101", 1, true, 4),
    ];

    const result = computeOverdue(programCourses, [], 1, PROGRAM_VERSION);
    expect(result.courses).toHaveLength(0);
  });

  it("sorts overdue courses by suggestedSemester ascending", () => {
    const programCourses: ProgramCourseSnapshot[] = [
      makeProgramCourse("CS401", 4, true, 3),
      makeProgramCourse("CS101", 1, true, 4),
      makeProgramCourse("CS201", 2, true, 4),
    ];

    const result = computeOverdue(programCourses, [], 5, PROGRAM_VERSION);

    expect(result.courses.map((c) => c.suggestedSemester)).toEqual([1, 2, 4]);
  });

  it("handles empty data", () => {
    const result = computeOverdue([], [], 5, null);
    expect(result.courses).toHaveLength(0);
    expect(result.programVersion).toBeNull();
  });
});

// =============================================================================
// 类型4 — computeMinor
// =============================================================================

describe("computeMinor", () => {
  const MINOR_PROGRAM_VERSION: ProgramVersionSnapshot = {
    id: "pv-minor-001",
    majorName: "计算机科学与技术（辅修）",
    year: 2025,
  };

  it("calculates minor progress per requirement group", () => {
    const pc1 = makeProgramCourse("CS101", 1, true, 4, "mg1");
    const pc2 = makeProgramCourse("CS201", 2, true, 3, "mg1");
    const pc3 = makeProgramCourse("CS301", 3, true, 3, "mg2");

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("mg1", "辅修核心", "minor_core", 10, [pc1, pc2]),
      makeRequirementGroup("mg2", "辅修选修", "minor_elective", 6, [pc3]),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PASSED", 1), // 4 credits to mg1
    ];

    const result = computeMinor(groups, records, MINOR_PROGRAM_VERSION);

    expect(result.reasonCode).toBe("MINOR_PROGRESS");
    expect(result.ruleSource).toBe("program_version.minor_requirement");
    expect(result.programVersion).toEqual(MINOR_PROGRAM_VERSION);

    expect(result.groups).toHaveLength(2);

    const g1 = result.groups[0]!;
    expect(g1.groupName).toBe("辅修核心");
    expect(g1.requiredCredits).toBe(10);
    expect(g1.earnedCredits).toBe(4);
    expect(g1.remainingCredits).toBe(6);
    expect(g1.passedCourseCodes).toEqual(["CS101"]);

    const g2 = result.groups[1]!;
    expect(g2.groupName).toBe("辅修选修");
    expect(g2.earnedCredits).toBe(0);
    expect(g2.remainingCredits).toBe(6);
    expect(g2.passedCourseCodes).toEqual([]);
  });

  it("returns empty groups when programVersion is null (no minor enrolled)", () => {
    const result = computeMinor([], [], null);

    expect(result.groups).toHaveLength(0);
    expect(result.programVersion).toBeNull();
    expect(result.reasonCode).toBe("MINOR_PROGRESS");
  });

  it("caps earnedCredits at requiredCredits", () => {
    const pc1 = makeProgramCourse("CS101", 1, true, 15, "mg1"); // 15 > 10 required

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("mg1", "辅修核心", "minor_core", 10, [pc1]),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PASSED", 1),
    ];

    const result = computeMinor(groups, records, MINOR_PROGRAM_VERSION);

    expect(result.groups[0]!.earnedCredits).toBe(10);
    expect(result.groups[0]!.remainingCredits).toBe(0);
  });

  it("handles all passed courses", () => {
    const pc1 = makeProgramCourse("CS101", 1, true, 5, "mg1");
    const pc2 = makeProgramCourse("CS201", 2, true, 5, "mg1");

    const groups: RequirementGroupSnapshot[] = [
      makeRequirementGroup("mg1", "辅修核心", "minor_core", 10, [pc1, pc2]),
    ];

    const records: CourseRecordSnapshot[] = [
      makeCourseRecord("CS101", "PASSED", 1),
      makeCourseRecord("CS201", "PASSED", 2),
    ];

    const result = computeMinor(groups, records, MINOR_PROGRAM_VERSION);

    expect(result.groups[0]!.earnedCredits).toBe(10);
    expect(result.groups[0]!.remainingCredits).toBe(0);
    expect(result.groups[0]!.passedCourseCodes).toEqual(["CS101", "CS201"]);
  });

  it("handles empty requirement groups array", () => {
    const result = computeMinor([], [], MINOR_PROGRAM_VERSION);
    expect(result.groups).toHaveLength(0);
    expect(result.programVersion).toEqual(MINOR_PROGRAM_VERSION);
  });
});
