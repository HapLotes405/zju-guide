const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const prisma = new PrismaClient();
const HOME = "C:/Users/dudu1";
const uuid = () => crypto.randomUUID();

async function main() {
  const tf = path.join(HOME, "chalaoshi_teachers_v2.json");
  const cf = path.join(HOME, "chalaoshi_by_course_v2.json");
  if (!fs.existsSync(tf) || !fs.existsSync(cf)) {
    console.error("Files not found!"); process.exit(1);
  }
  console.log("Loading data...");
  const teachers = JSON.parse(fs.readFileSync(tf, "utf-8"));
  const courses = JSON.parse(fs.readFileSync(cf, "utf-8"));
  console.log(Object.keys(teachers).length + " teachers, " + courses.length + " courses");

  const existing = await prisma.teacher.findMany();
  const nameMap = {};
  for (const t of existing) {
    nameMap[(t.name + "|" + (t.department || "")).toLowerCase()] = t.id;
  }
  console.log(existing.length + " existing in DB");

  // Phase 1: Teachers
  console.log("\n--- Teachers ---");
  let tc = 0, tu = 0;
  const ids = Object.keys(teachers);
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    await prisma.$transaction(async (tx) => {
      for (const tid of batch) {
        const t = teachers[tid];
        if (!t.name) continue;
        const key = (t.name + "|" + (t.department || "")).toLowerCase();
        const data = {
          name: t.name, department: t.department || null,
          school: t.school || "ZJU", score: t.score || null,
          ratingCount: t.rating_count || 0, rollCallPct: t.roll_call_pct || null,
        };
        if (nameMap[key]) { await tx.teacher.update({ where: { id: nameMap[key] }, data }); tu++; }
        else { const c = await tx.teacher.create({ data }); nameMap[key] = c.id; tc++; }
      }
    });
    if ((i+200) % 2000 === 0) console.log(Math.round(i/ids.length*100) + "% new:" + tc + " upd:" + tu);
  }
  console.log("Created: " + tc + ", Updated: " + tu);

  // Phase 2: TeacherCourses
  console.log("\n--- TeacherCourses ---");
  let tcc = 0;
  const gpaUpdates = [];
  for (let i = 0; i < courses.length; i += 200) {
    const batch = courses.slice(i, i + 200);
    await prisma.$transaction(async (tx) => {
      for (const c of batch) {
        const dbCourse = await tx.course.findFirst({
          where: { name: { contains: c.course_name.substring(0, 15) } },
        });
        if (!dbCourse) continue;
        for (const e of c.teachers || []) {
          const key = (e.teacher_name + "|" + (e.department || "")).toLowerCase();
          const tid = nameMap[key];
          if (!tid) continue;
          let gpaStd = null;
          for (const r of c.gpa_rankings || []) {
            if (r.name === e.teacher_name && r.std != null) { gpaStd = r.std; break; }
          }
          try {
            await tx.teacherCourse.upsert({
              where: { teacherId_courseCode: { teacherId: tid, courseCode: dbCourse.code } },
              update: { gpa: e.course_gpa || null, studentCount: typeof e.course_students === 'number' ? e.course_students : null },
              create: { teacherId: tid, courseCode: dbCourse.code, gpa: e.course_gpa || null, studentCount: typeof e.course_students === 'number' ? e.course_students : null },
            });
            tcc++;
            if (gpaStd != null) gpaUpdates.push({ tid, code: dbCourse.code, gpaStd });
          } catch (er) {}
        }
      }
    });
    if ((i+200) % 2000 === 0) console.log(Math.round(i/courses.length*100) + "% links:" + tcc);
  }
  console.log("Links: " + tcc + ", GPA std updates: " + gpaUpdates.length);

  // Update gpaStd via raw SQL
  for (let i = 0; i < gpaUpdates.length; i += 500) {
    const b = gpaUpdates.slice(i, i + 500);
    await prisma.$transaction(async (tx) => {
      for (const u of b) {
        await tx.$executeRawUnsafe("UPDATE TeacherCourse SET gpaStd = ? WHERE teacherId = ? AND courseCode = ?", u.gpaStd, u.tid, u.code);
      }
    });
    if ((i+500) % 5000 === 0) console.log("  gpaStd: " + Math.round(i/gpaUpdates.length*100) + "%");
  }

  // Phase 3: Reviews
  console.log("\n--- Reviews ---");
  await prisma.$executeRawUnsafe("DELETE FROM TeacherReview");
  console.log("Cleared old reviews");
  let cr = 0, kr = 0;
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30);
    const rows = [];
    for (const tid of batch) {
      const t = teachers[tid];
      if (!t.name) continue;
      const key = (t.name + "|" + (t.department || "")).toLowerCase();
      const dbId = nameMap[key];
      if (!dbId) continue;
      for (const r of t.chalaoshi_reviews || []) {
        const content = r.content.replace(/'/g, "''").replace(/\n/g, " ").substring(0, 5000);
        rows.push("('" + uuid() + "','" + dbId + "','" + content + "'," + (r.likes||0) + "," + (r.date ? "'"+r.date+"'" : "NULL") + ",'chalaoshi')");
        cr++;
      }
      for (const r of t.kefou_reviews || []) {
        const content = r.content.replace(/'/g, "''").replace(/\n/g, " ").substring(0, 5000);
        rows.push("('" + uuid() + "','" + dbId + "','" + content + "',0," + (r.date ? "'"+r.date+"'" : "NULL") + ",'kefou')");
        kr++;
      }
    }
    for (let j = 0; j < rows.length; j += 50) {
      const chunk = rows.slice(j, j + 50);
      if (chunk.length > 0) {
        await prisma.$executeRawUnsafe("INSERT INTO TeacherReview (id, teacherId, content, likes, date, source) VALUES " + chunk.join(","));
      }
    }
    if ((i+30) % 300 === 0) console.log(Math.round(i/ids.length*100) + "% chal:" + cr + " kef:" + kr);
  }
  console.log("Chalaoshi: " + cr + ", Kefou: " + kr);

  console.log("\n=== DONE ===");
  const s = await prisma.$queryRawUnsafe("SELECT (SELECT COUNT(*) FROM Teacher) as tc, (SELECT COUNT(*) FROM TeacherCourse) as tcc, (SELECT COUNT(*) FROM TeacherReview) as tr");
  console.log("DB: " + s[0].tc + " teachers, " + s[0].tcc + " links, " + s[0].tr + " reviews");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
