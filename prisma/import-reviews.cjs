const { PrismaClient } = require("@prisma/client");
const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
const prisma = new PrismaClient();
const uuid = () => crypto.randomUUID();
// 一次性导入脚本：输入目录不硬编码个人路径，运行时从环境变量取
const HOME = process.env.IMPORT_HOME || process.env.USERPROFILE || process.env.HOME;

async function main() {
  const tf = path.join(HOME, "chalaoshi_teachers_v2.json");
  if (!fs.existsSync(tf)) { console.error("Not found!"); process.exit(1); }
  console.log("Loading teachers...");
  const teachers = JSON.parse(fs.readFileSync(tf, "utf-8"));

  const existing = await prisma.teacher.findMany();
  const nameMap = {};
  for (const t of existing) nameMap[(t.name + "|" + (t.department || "")).toLowerCase()] = t.id;
  console.log(existing.length + " teachers in DB");

  console.log("Clearing reviews...");
  await prisma.$executeRawUnsafe("DELETE FROM TeacherReview");

  console.log("Importing...");
  let cr = 0, kr = 0, errs = 0;
  const ids = Object.keys(teachers);

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
        const c = r.content.replace(/'/g, "''").replace(/\0/g, "").substring(0, 5000);
        rows.push("('"+uuid()+"','"+dbId+"','"+c+"',"+(r.likes||0)+","+(r.date?"'"+r.date+"'":"NULL")+",'chalaoshi')");
        cr++;
      }
      for (const r of t.kefou_reviews || []) {
        const c = r.content.replace(/'/g, "''").replace(/\0/g, "").substring(0, 5000);
        rows.push("('"+uuid()+"','"+dbId+"','"+c+"',0,"+(r.date?"'"+r.date+"'":"NULL")+",'kefou')");
        kr++;
      }
    }
    for (let j = 0; j < rows.length; j += 50) {
      const chunk = rows.slice(j, j + 50);
      if (chunk.length > 0) {
        try {
          await prisma.$executeRawUnsafe("INSERT INTO TeacherReview (id, teacherId, content, likes, date, source) VALUES " + chunk.join(","));
        } catch(e) {
          for (const row of chunk) {
            try { await prisma.$executeRawUnsafe("INSERT INTO TeacherReview (id, teacherId, content, likes, date, source) VALUES " + row); }
            catch(e2) { errs++; }
          }
        }
      }
    }
    if ((i+30) % 300 === 0) console.log(Math.round(i/ids.length*100) + "% c:" + cr + " k:" + kr + (errs?" err:"+errs:""));
  }
  console.log("Done! Chalaoshi: " + cr + ", Kefou: " + kr + ", Errors: " + errs);
  const s = await prisma.$queryRawUnsafe("SELECT COUNT(*) as c FROM TeacherReview");
  console.log("DB reviews: " + s[0].c);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
