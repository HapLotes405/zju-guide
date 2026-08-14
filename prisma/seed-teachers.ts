// =============================================================================
// seed-teachers.ts — 导入查老师数据到 mse-wiki
// Usage: npx tsx prisma/seed-teachers.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

interface SeedEntry {
  courseCode: string;
  courseName: string;
  teacherName: string;
  teacherDepartment: string;
  teacherScore: number | null;
  teacherRatingCount: number;
  teacherRollCallPct: number | null;
  courses: { name: string; gpa: number | null; student_count: number | null }[];
  reviews: { content: string; likes: number; date: string }[];
}

async function main() {
  const seedPath = path.resolve(__dirname, "../teacher_seed.json");
  console.log(`Reading ${seedPath}...`);
  const raw = fs.readFileSync(seedPath, "utf-8");
  const data: SeedEntry[] = JSON.parse(raw);
  console.log(`Loaded ${data.length} teacher-course links`);

  // ── Step 1: Import courses ──
  console.log("\n[1/4] Importing courses...");
  const courseMap = new Map<string, string>(); // code -> name
  for (const d of data) {
    if (!courseMap.has(d.courseCode)) {
      courseMap.set(d.courseCode, d.courseName);
    }
  }

  let courseCount = 0;
  for (const [code, name] of courseMap) {
    await prisma.course.upsert({
      where: { code },
      update: { name },
      create: { code, name, credits: 0 },
    });
    courseCount++;
    if (courseCount % 500 === 0) {
      console.log(`  ${courseCount}/${courseMap.size} courses`);
    }
  }
  console.log(`  Done: ${courseCount} courses`);

  // ── Step 2: Import teachers (deduplicate by name) ──
  console.log("\n[2/4] Importing teachers...");
  const teacherNameMap = new Map<string, SeedEntry>(); // name -> first entry
  for (const d of data) {
    if (!teacherNameMap.has(d.teacherName)) {
      teacherNameMap.set(d.teacherName, d);
    }
  }

  const teacherIdMap = new Map<string, string>(); // name -> UUID
  let teacherCount = 0;
  for (const [name, d] of teacherNameMap) {
    const teacher = await prisma.teacher.create({
      data: {
        name: d.teacherName,
        department: d.teacherDepartment || null,
        school: "浙江大学",
        score: d.teacherScore,
        ratingCount: d.teacherRatingCount,
        rollCallPct: d.teacherRollCallPct,
      },
    });
    teacherIdMap.set(name, teacher.id);
    teacherCount++;
    if (teacherCount % 500 === 0) {
      console.log(`  ${teacherCount}/${teacherNameMap.size} teachers`);
    }
  }
  console.log(`  Done: ${teacherCount} teachers`);

  // ── Step 3: Import teacher-course links ──
  console.log("\n[3/4] Importing teacher-course links...");
  let linkCount = 0;
  for (const d of data) {
    const teacherId = teacherIdMap.get(d.teacherName);
    if (!teacherId) continue;

    // Find the GPA for THIS specific course
    const thisCourse = d.courses.find(
      (c) => c.name.trim() === d.courseName.trim(),
    );

    await prisma.teacherCourse.upsert({
      where: {
        teacherId_courseCode: {
          teacherId,
          courseCode: d.courseCode,
        },
      },
      update: {
        gpa: thisCourse?.gpa ?? null,
        studentCount: thisCourse?.student_count ?? null,
      },
      create: {
        teacherId,
        courseCode: d.courseCode,
        gpa: thisCourse?.gpa ?? null,
        studentCount: thisCourse?.student_count ?? null,
      },
    });
    linkCount++;
    if (linkCount % 1000 === 0) {
      console.log(`  ${linkCount}/${data.length} links`);
    }
  }
  console.log(`  Done: ${linkCount} links`);

  // ── Step 4: Import reviews (batch per teacher) ──
  console.log("\n[4/4] Importing reviews...");
  let reviewCount = 0;
  for (const [name, teacherId] of teacherIdMap) {
    const entry = teacherNameMap.get(name);
    if (!entry || entry.reviews.length === 0) continue;

    // Batch create reviews for this teacher (max 100)
    const reviews = entry.reviews.slice(0, 100);
    await prisma.teacherReview.createMany({
      data: reviews.map((r) => ({
        teacherId,
        content: r.content,
        likes: r.likes || 0,
        date: r.date || null,
      })),
    });
    reviewCount += reviews.length;
    if (reviewCount % 10000 === 0) {
      console.log(`  ${reviewCount} reviews...`);
    }
  }
  console.log(`  Done: ${reviewCount} reviews`);

  // ── Stats ──
  console.log("\n=== Import Complete ===");
  console.log(`Courses:    ${courseCount}`);
  console.log(`Teachers:   ${teacherCount}`);
  console.log(`Links:      ${linkCount}`);
  console.log(`Reviews:    ${reviewCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
