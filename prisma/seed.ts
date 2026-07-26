import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ==================== 1. Users ====================

  const adminPass = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const testPass = process.env.SEED_TEST_PASSWORD || "test123";
  const adminHash = bcrypt.hashSync(adminPass, 10);
  const userHash = bcrypt.hashSync(testPass, 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });
  console.log(`  ✔ User: ${admin.username} (${admin.role})`);

  const testUser = await prisma.user.upsert({
    where: { username: "testuser" },
    update: {},
    create: {
      username: "testuser",
      passwordHash: userHash,
      role: Role.VISITOR,
    },
  });
  console.log(`  ✔ User: ${testUser.username} (${testUser.role})`);

  // ==================== 2. ProgramVersion ====================

  const program = await prisma.programVersion.upsert({
    where: { majorName_year: { majorName: "材料科学与工程", year: 2025 } },
    update: {},
    create: {
      majorName: "材料科学与工程",
      year: 2025,
      totalCredits: 57.0,
      isActive: true,
    },
  });
  console.log(`  ✔ Program: ${program.majorName} ${program.year}级`);

  // ==================== 3. Courses ====================

  const courses = [
    // 通识类 (gen_ed)
    { code: "MATH1135G", name: "微积分（甲）I", credits: 5.0, category: "gen_ed", semester: "大一秋冬", department: "数学科学学院" },
    { code: "MATH1232G", name: "微积分（甲）II", credits: 3.5, category: "gen_ed", semester: "大一春夏", department: "数学科学学院" },
    { code: "MATH1138G", name: "线性代数（甲）", credits: 2.5, category: "gen_ed", semester: "大一秋冬", department: "数学科学学院" },
    { code: "PHY1001G", name: "大学物理（甲）I", credits: 4.0, category: "gen_ed", semester: "大一春夏", department: "物理学院" },
    { code: "CS100RG", name: "C程序设计基础", credits: 3.0, category: "gen_ed", semester: "大一秋冬", department: "计算机科学与技术学院" },

    // 基础类 (major_base)
    { code: "MSE2001M", name: "物理化学基础", credits: 4.0, category: "major_base", semester: "大二秋冬", department: "材料科学与工程学院" },
    { code: "MSE2004M", name: "材料物理", credits: 3.0, category: "major_base", semester: "大二秋冬", department: "材料科学与工程学院" },
    { code: "MSE2008M", name: "材料化学", credits: 2.0, category: "major_base", semester: "大二春夏", department: "材料科学与工程学院" },
    { code: "MSE2011M", name: "材料计算与设计", credits: 2.0, category: "major_base", semester: "大二春夏", department: "材料科学与工程学院" },

    // 核心类 (major_core)
    { code: "MSE2002M", name: "材料科学基础I", credits: 4.0, category: "major_core", semester: "大二春夏", department: "材料科学与工程学院" },
    { code: "MSE2006M", name: "材料科学基础II", credits: 3.0, category: "major_core", semester: "大二春夏", department: "材料科学与工程学院" },
    { code: "MSE3007M", name: "材料工艺学I", credits: 3.0, category: "major_core", semester: "大三秋冬", department: "材料科学与工程学院" },
    { code: "MSE3015M", name: "材料工艺学II", credits: 2.0, category: "major_core", semester: "大三秋冬", department: "材料科学与工程学院" },
    { code: "MSE3018M", name: "材料工艺学III", credits: 3.0, category: "major_core", semester: "大三秋冬", department: "材料科学与工程学院" },
    { code: "MSE3010M", name: "材料性能I", credits: 2.0, category: "major_core", semester: "大三秋冬", department: "材料科学与工程学院" },
    { code: "MSE3014M", name: "材料性能II", credits: 3.0, category: "major_core", semester: "大三春夏", department: "材料科学与工程学院" },
    { code: "MSE3016M", name: "材料表征I", credits: 2.0, category: "major_core", semester: "大三春夏", department: "材料科学与工程学院" },

    // 实验类 (major_module)
    { code: "MSE1201M", name: "材料工艺基础实验", credits: 1.0, category: "major_module", semester: "大二秋冬", department: "材料科学与工程学院" },
    { code: "MSE2203M", name: "材料科学基础实验", credits: 2.0, category: "major_module", semester: "大二春夏", department: "材料科学与工程学院" },
    { code: "MSE3205M", name: "先进材料实验", credits: 3.0, category: "major_module", semester: "大三春夏", department: "材料科学与工程学院" },

    // 外部前置课程（不在培养方案中，但依赖关系需要用到）
    { code: "CHEM100BG", name: "大学化学", credits: 3.0, category: "gen_ed", semester: "大一秋冬", department: "化学系" },
    { code: "PHY2001G", name: "大学物理（甲）II", credits: 4.0, category: "gen_ed", semester: "大二秋冬", department: "物理学院" },
    { code: "MSE3017M", name: "材料表征II", credits: 2.0, category: "major_core", semester: "大四秋冬", department: "材料科学与工程学院" },
  ];

  for (const c of courses) {
    await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }
  console.log(`  ✔ ${courses.length} courses created`);

  // ==================== 4. Requirement Groups ====================

  const groups = [
    { name: "自然科学通识", category: "gen_ed", requiredCredits: 18.0 },
    { name: "学科基础课程", category: "major_base", requiredCredits: 11.0 },
    { name: "专业核心课程", category: "major_core", requiredCredits: 22.0 },
    { name: "实验实践课程", category: "major_module", requiredCredits: 6.0 },
  ];

  // Delete old groups for idempotency, then create fresh
  await prisma.requirementGroup.deleteMany({ where: { programVersionId: program.id } });

  const groupRecords = [];
  for (const g of groups) {
    const group = await prisma.requirementGroup.create({
      data: {
        programVersionId: program.id,
        name: g.name,
        category: g.category,
        requiredCredits: g.requiredCredits,
      },
    });
    groupRecords.push(group);
    console.log(`  ✔ RequirementGroup: ${group.name} (${group.requiredCredits} credits)`);
  }

  // ==================== 5. ProgramCourses ====================

  // Map: courseCode → { suggestedSemester, category }
  const programCourseMap: Record<string, { semester: number; category: string }> = {
    // 通识类
    MATH1135G: { semester: 1, category: "gen_ed" },
    MATH1232G: { semester: 2, category: "gen_ed" },
    MATH1138G: { semester: 1, category: "gen_ed" },
    PHY1001G:  { semester: 2, category: "gen_ed" },
    CS100RG:   { semester: 1, category: "gen_ed" },

    // 基础类
    MSE2001M: { semester: 3, category: "major_base" },
    MSE2004M: { semester: 3, category: "major_base" },
    MSE2008M: { semester: 4, category: "major_base" },
    MSE2011M: { semester: 4, category: "major_base" },

    // 核心类
    MSE2002M: { semester: 4, category: "major_core" },
    MSE2006M: { semester: 4, category: "major_core" },
    MSE3007M: { semester: 5, category: "major_core" },
    MSE3015M: { semester: 5, category: "major_core" },
    MSE3018M: { semester: 5, category: "major_core" },
    MSE3010M: { semester: 5, category: "major_core" },
    MSE3014M: { semester: 6, category: "major_core" },
    MSE3016M: { semester: 6, category: "major_core" },

    // 实验类
    MSE1201M: { semester: 3, category: "major_module" },
    MSE2203M: { semester: 4, category: "major_module" },
    MSE3205M: { semester: 6, category: "major_module" },
  };

  const categoryToGroup: Record<string, string> = {};
  for (const g of groupRecords) {
    categoryToGroup[g.category] = g.id;
  }

  for (const [code, info] of Object.entries(programCourseMap)) {
    await prisma.programCourse.upsert({
      where: { programVersionId_courseCode: { programVersionId: program.id, courseCode: code } },
      update: {
        suggestedSemester: info.semester,
        isCompulsory: true,
        requirementGroupId: categoryToGroup[info.category],
      },
      create: {
        programVersionId: program.id,
        courseCode: code,
        suggestedSemester: info.semester,
        isCompulsory: true,
        requirementGroupId: categoryToGroup[info.category],
      },
    });
  }
  console.log(`  ✔ ${Object.keys(programCourseMap).length} program-courses linked`);

  // ==================== 6. Prerequisites ====================

  const prerequisites = [
    { course: "MATH1232G", prereq: "MATH1135G", reason: "需先修微积分I" },
    { course: "PHY1001G",  prereq: "MATH1135G", reason: "需微积分基础" },
    { course: "MSE2001M",  prereq: "CHEM100BG", reason: "需大学化学基础" },
    { course: "MSE2004M",  prereq: "PHY2001G",  reason: "需大学物理II基础" },
    { course: "MSE2008M",  prereq: "MSE2001M",  reason: "需物理化学基础" },
    { course: "MSE2011M",  prereq: "MATH1138G", reason: "需线性代数基础" },
    { course: "MSE2011M",  prereq: "CS100RG",   reason: "需程序设计基础" },
    { course: "MSE2006M",  prereq: "MSE2002M",  reason: "需材料科学基础I" },
    { course: "MSE3007M",  prereq: "MSE2006M",  reason: "需材料科学基础II" },
    { course: "MSE3015M",  prereq: "MSE3007M",  reason: "需材料工艺学I" },
    { course: "MSE3018M",  prereq: "MSE3015M",  reason: "需材料工艺学II" },
    { course: "MSE3010M",  prereq: "MATH1232G", reason: "需微积分II基础" },
    { course: "MSE3014M",  prereq: "MSE3010M",  reason: "需材料性能I" },
    { course: "MSE3017M",  prereq: "MSE3016M",  reason: "需材料表征I" },
  ];

  for (const p of prerequisites) {
    await prisma.coursePrerequisite.upsert({
      where: { courseCode_prerequisiteCode: { courseCode: p.course, prerequisiteCode: p.prereq } },
      update: {},
      create: {
        courseCode: p.course,
        prerequisiteCode: p.prereq,
        relationType: "PREREQUISITE",
        reason: p.reason,
      },
    });
  }
  console.log(`  ✔ ${prerequisites.length} prerequisites created`);

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
