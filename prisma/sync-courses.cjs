const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

// 与 src/lib/course-name.ts 的 ANNOTATION_SYMBOLS 保持一致（不含 #：C# 是合法课程名）。
// 若改动共享字符集，请同步此常量。
const ANNOTATION_SYMBOLS = /[*△▲◇☆★○●◎□■✦✧◆]/g;
const PLACEHOLDER_PREFIX = "(课程名待补充:";
// 非空、非纯空白、非占位符，才算「真实名」；占位符可被真实名升级
const isRealName = (n) => !!n && !!String(n).trim() && !String(n).trim().startsWith(PLACEHOLDER_PREFIX);
// 清洗：移除批注符号；空白名给占位符
const cleanName = (name, code) =>
  (String(name || "").replace(ANNOTATION_SYMBOLS, "").trim()) || `${PLACEHOLDER_PREFIX}${code})`;

const CATEGORY_MAP = {
  "通识": "gen_ed",
  "专业基础课程": "major_base",
  "专业课": "major_core",
};

async function main() {
  const dataPath = path.join(process.cwd(), "prisma", "data", "zju_courses.json");
  console.log("Reading " + dataPath + "...");
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  console.log(raw.length + " courses in file");

  let created = 0, updated = 0, skipped = 0;
  const BATCH = 500;
  const totalBatches = Math.ceil(raw.length / BATCH);

  for (let batch = 0; batch < totalBatches; batch++) {
    const items = raw.slice(batch * BATCH, (batch + 1) * BATCH);
    await prisma.$transaction(async (tx) => {
      for (const c of items) {
        const credits = parseFloat(c.credits);
        if (isNaN(credits)) { skipped++; continue; }
        const mapped = CATEGORY_MAP[c.category] || c.category;
        const name = cleanName(c.name, c.code);
        const existing = await tx.course.findUnique({ where: { code: c.code } });
        if (existing) {
          // 现有名不是真实名（空名/占位符）时，补写主数据里的真实名；
          // 真实名绝不覆盖（防历史根因复发）
          const data = { credits, category: mapped };
          if (!isRealName(existing.name)) data.name = name;
          await tx.course.update({ where: { code: c.code }, data });
          updated++;
        } else {
          await tx.course.create({ data: { code: c.code, name, credits, category: mapped } });
          created++;
        }
      }
    });
    if ((batch+1) % 10 === 0 || batch+1 === totalBatches) {
      console.log(Math.round((batch+1)/totalBatches*100) + "% (" + created + " created, " + updated + " updated)");
    }
  }

  const total = await prisma.course.count();
  console.log("\nDone! Created: " + created + ", Updated: " + updated + ", Skipped: " + skipped);
  console.log("Total in DB: " + total);

  const sample = await prisma.course.findMany({ take: 5, orderBy: { code: "asc" } });
  for (const c of sample) console.log("  " + c.code + " | " + c.name + " | " + c.credits + "cr | " + c.category);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
