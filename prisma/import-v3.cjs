/**
 * V3 import: fix course matching + add chalaoshiId
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const prisma = new PrismaClient();
const HOME = "C:/Users/dudu1";

function normalize(name) {
  let n = name.trim();
  n = n.replace(/\uff08/g, "(").replace(/\uff09/g, ")");
  n = n.replace(/\uff1a/g, ":").replace(/\uff0c/g, ",");
  const roman = { "\u2160":"I","\u2161":"II","\u2162":"III","\u2163":"IV","\u2164":"V","\u2165":"VI","\u2166":"VII","\u2167":"VIII" };
  for (const [r, a] of Object.entries(roman)) n = n.replace(new RegExp(r, "g"), a);
  n = n.replace(/\s+/g, "").replace(/\u3000/g, "").toLowerCase();
  return n;
}

async function main() {
  const cf = path.join(HOME, "chalaoshi_by_course_v2.json");
  const tf = path.join(HOME, "chalaoshi_teachers_v2.json");
  if (!fs.existsSync(cf) || !fs.existsSync(tf)) { console.error("Files not found!"); process.exit(1); }

  console.log("Loading...");
  const byCourse = JSON.parse(fs.readFileSync(cf, "utf-8"));
  const teachers = JSON.parse(fs.readFileSync(tf, "utf-8"));
  console.log(`${byCourse.length} courses, ${Object.keys(teachers).length} teachers`);

  // Build normalized course map from mse-wiki
  const dbCourses = await prisma.course.findMany({ select: { code: true, name: true } });
  const courseMap = {};
  for (const c of dbCourses) courseMap[normalize(c.name)] = { code: c.code, name: c.name };

  // Match
  let matched = 0, unmatched = 0;
  for (const c of byCourse) {
    const n = normalize(c.course_name);
    if (courseMap[n]) { matched++; c._dbCode = courseMap[n].code; }
    else { unmatched++; }
  }
  console.log(`Match: ${matched}/${byCourse.length} (${(matched/byCourse.length*100).toFixed(1)}%)`);

  // Phase 1: Update teachers with chalaoshiId
  console.log("\n--- Teachers ---");
  let tc = 0, tu = 0;
  const nameToDbId = {};
  const existing = await prisma.teacher.findMany();
  for (const t of existing) nameToDbId[(t.name + "|" + (t.department || "")).toLowerCase()] = t.id;

  const tids = Object.keys(teachers);
  for (let i = 0; i < tids.length; i += 200) {
    const batch = tids.slice(i, i + 200);
    await prisma.$transaction(async (tx) => {
      for (const tid of batch) {
        const t = teachers[tid];
        if (!t.name) continue;
        const key = (t.name + "|" + (t.department || "")).toLowerCase();
        const data = {
          name: t.name, department: t.department || null,
          school: t.school || "浙江大学", score: t.score || null,
          ratingCount: t.rating_count || 0, rollCallPct: t.roll_call_pct || null,
          chalaoshiId: t.id,
        };
        if (nameToDbId[key]) { await tx.teacher.update({ where: { id: nameToDbId[key] }, data }); tu++; }
        else { const c = await tx.teacher.create({ data }); nameToDbId[key] = c.id; tc++; }
      }
    });
    if ((i+200) % 2000 === 0) console.log(`  ${Math.round(i/tids.length*100)}% new:${tc} upd:${tu}`);
  }
  console.log(`  Created: ${tc}, Updated: ${tu}`);

  // Phase 2: Rebuild TeacherCourse
  console.log("\n--- TeacherCourse ---");
  await prisma.$executeRawUnsafe("DELETE FROM TeacherCourse");
  console.log("  Cleared old links");

  let tcc = 0;
  for (let i = 0; i < byCourse.length; i += 100) {
    const batch = byCourse.slice(i, i + 100);
    const creates = [];
    for (const c of batch) {
      if (!c._dbCode) continue;
      for (const e of c.teachers || []) {
        const key = (e.teacher_name + "|" + (e.department || "")).toLowerCase();
        const tid = nameToDbId[key];
        if (!tid) continue;
        let gpaStd = null;
        for (const r of c.gpa_rankings || []) {
          if (r.name === e.teacher_name && r.std != null) { gpaStd = r.std; break; }
        }
        creates.push({
          teacherId: tid, courseCode: c._dbCode,
          gpa: e.course_gpa || null, gpaStd,
          studentCount: typeof e.course_students === "number" ? e.course_students : null,
        });
      }
    }
    if (creates.length > 0) {
      const seen = new Set();
      const deduped = creates.filter(c => {
        const key = c.teacherId + "|" + c.courseCode;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (deduped.length > 0) {
        try {
          await prisma.teacherCourse.createMany({ data: deduped });
          tcc += deduped.length;
        } catch (e) {
          // Fall back to individual creates to skip duplicates
          for (const c of deduped) {
            try { await prisma.teacherCourse.create({ data: c }); tcc++; }
            catch (e2) { /* duplicate, skip */ }
          }
        }
      }
    }
    if ((i+100) % 1000 === 0) console.log(`  ${Math.round(i/byCourse.length*100)}% links:${tcc}`);
  }
  console.log(`  Links: ${tcc}`);

  // Verify
  const cwt = await prisma.$queryRawUnsafe("SELECT COUNT(DISTINCT courseCode) as c FROM TeacherCourse");
  const withChal = await prisma.teacher.count({ where: { chalaoshiId: { not: null } } });
  console.log(`\n=== Done ===`);
  console.log(`Courses with teachers: ${cwt[0].c}, Teachers with chalaoshiId: ${withChal}`);

  const test = await prisma.$queryRawUnsafe(
    "SELECT c.code, c.name, COUNT(tc.teacherId) as cnt FROM Course c JOIN TeacherCourse tc ON c.code = tc.courseCode WHERE c.code = 'MATH1135G' GROUP BY c.code"
  );
  if (test[0]) console.log(`MATH1135G: ${test[0].cnt} teachers`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
