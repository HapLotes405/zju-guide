// =============================================================================
// cleanup-courses.ts — 课程库数据治理（一次性脚本）
//   0. 备份 dev.db
//   1. 恢复空课程名（从 zju_courses.json 按 code 找回）+ 清洗 *△ 批注符号
//   2. 按规范化课程名合并重复课程：选取 canonical，重指向全部外键，删除冗余行
//   3. 输出统计
// Usage: npx tsx prisma/cleanup-courses.ts
//
// 对抗性审查后加固点（2026-08-08）：
//   - deleteMany(id in ...) 按 id 分批，避免超出 SQLite 变量上限（H1）
//   - 按 canonical 分组批量：同一逻辑课程的全部被合并码在同一事务内处理，
//     消除跨批次"canonical 冒名顶替"导致的去重结果随批次划分漂移（M1）
//   - canonical 选择时丢弃更高学分的记录 → 输出审计清单供人工复核（M2）
//   - 移除占位名升级死分支 canonicalNameFix（占位名带 code，规范化后永不同组）（L1）
//   - 统计改为事务提交成功后才累加（L2）
// =============================================================================
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeCourseName, normalizeCourseName, isRealName } from "../src/lib/course-name";
import { pickCanonical, type CanonicalCandidate } from "../src/lib/course-merge";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const DB_PATH = path.resolve(__dirname, "dev.db");
const SRC_PATH = path.resolve(__dirname, "data", "zju_courses.json");

interface CourseRow {
  code: string;
  name: string;
  credits: number;
}

const BATCH = 200; // 每事务处理的被合并码上限（同时约束 findMany in 子句 ≤ ~400 < 32766）
const DELETE_CHUNK = 500; // deleteMany(id in ...) 单次 id 数，防超出 SQLite 变量上限
const TX_TIMEOUT = 120_000; // 大事务需放宽默认 5s 超时

async function main() {
  // ── Phase 0: 备份 ──────────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bakPath = `${DB_PATH}.bak-${ts}`;
  if (!fs.existsSync(DB_PATH)) {
    console.error(`dev.db not found: ${DB_PATH}`);
    process.exit(1);
  }
  fs.copyFileSync(DB_PATH, bakPath);
  console.log(`[0] 备份 → ${path.basename(bakPath)}`);

  // ── Phase 1: 恢复 + 清洗课程名 ──────────────────────────────
  console.log("\n[1] 恢复空名 + 清洗批注符号...");
  const srcCourses = JSON.parse(fs.readFileSync(SRC_PATH, "utf-8")) as {
    code: string;
    name: string;
  }[];
  const srcNameByCode = new Map<string, string>();
  const srcSet = new Set<string>();
  for (const c of srcCourses) {
    if (c.code) srcSet.add(c.code);
    if (c.code && c.name && c.name.trim()) srcNameByCode.set(c.code, c.name.trim());
  }

  const all = await prisma.course.findMany({
    select: { code: true, name: true, credits: true },
  });
  console.log(`   DB 课程总数: ${all.length}`);

  const nameUpdates: { code: string; name: string }[] = [];
  let recovered = 0;
  for (const c of all) {
    let name = c.name;
    // 非真实名（空名/占位符）或 清洗后为空（纯符号名如 "*"）时，尝试从源目录找回
    const rawClean = sanitizeCourseName(name);
    if (!isRealName(name) || !rawClean) {
      const srcName = srcNameByCode.get(c.code);
      if (srcName) {
        name = srcName;
        recovered++;
      }
    }
    const clean = sanitizeCourseName(name, c.code);
    if (clean !== (c.name || "").trim()) nameUpdates.push({ code: c.code, name: clean });
  }
  for (let i = 0; i < nameUpdates.length; i += BATCH) {
    const batch = nameUpdates.slice(i, i + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const u of batch) {
          await tx.course.update({ where: { code: u.code }, data: { name: u.name } });
        }
      },
      { timeout: TX_TIMEOUT },
    );
  }
  console.log(`   空名已从源目录恢复: ${recovered}, 名字变更写回: ${nameUpdates.length}`);

  // ── Phase 2: 按规范化课程名分组 ─────────────────────────────
  console.log("\n[2] 按规范化课程名分组...");
  const cleanCourses = await prisma.course.findMany({
    select: { code: true, name: true, credits: true },
  });
  const groups = new Map<string, CourseRow[]>();
  for (const c of cleanCourses) {
    const key = normalizeCourseName(c.name);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  const involved = dupGroups.reduce((s, g) => s + g.length, 0);
  console.log(`   重复名组: ${dupGroups.length}, 涉及课程: ${involved}`);

  // 关系计数 → canonical 权重
  const tcCnt = new Map<string, number>();
  for (const r of await prisma.teacherCourse.groupBy({ by: ["courseCode"], _count: { _all: true } })) {
    tcCnt.set(r.courseCode, r._count._all);
  }
  const pcCnt = new Map<string, number>();
  for (const r of await prisma.programCourse.groupBy({ by: ["courseCode"], _count: { _all: true } })) {
    pcCnt.set(r.courseCode, r._count._all);
  }

  const toCandidate = (c: CourseRow): CanonicalCandidate => ({
    code: c.code,
    credits: c.credits || 0,
    inSrc: srcSet.has(c.code),
    weight: (tcCnt.get(c.code) || 0) * 10 + (pcCnt.get(c.code) || 0) * 3,
    letter: /[A-Za-z]/.test(c.code),
  });

  const mergeMap = new Map<string, string>(); // 被合并 code → canonical code
  const auditWarnings: string[] = []; // canonical 丢弃了更高学分课程 → 供人工复核
  for (const g of dupGroups) {
    const canon = pickCanonical(g.map(toCandidate))!;
    const canonRow = g.find((c) => c.code === canon.code)!;
    for (const c of g) {
      if (c.code === canon.code) continue;
      mergeMap.set(c.code, canon.code);
      if ((c.credits || 0) > (canonRow.credits || 0)) {
        auditWarnings.push(
          `${canon.code}「${canonRow.name}」学分 ${canonRow.credits} ← 丢弃 ${c.code}（学分 ${c.credits}）`,
        );
      }
    }
  }
  console.log(`   待合并课程数: ${mergeMap.size}`);
  if (auditWarnings.length) {
    console.log(`   警告: ${auditWarnings.length} 处 canonical 的学分低于被丢弃课程，见文末清单`);
  }

  // ── Phase 3: 重指向外键 + 删除冗余课程 ──────────────────────
  console.log("\n[3] 重指向外键并删除冗余课程...");
  const stats = { programCourse: 0, teacherCourse: 0, courseRecord: 0, courseResource: 0, prerequisite: 0 };

  // 按 canonical 分组：同一逻辑课程的全部被合并码必须落在同一事务内处理。
  // 若按扁平码分批，先前批次已重指为 canonical 的行会在后批次 findMany 范围内
  // 被误判为"canonical 自身行"而胜出，去重结果将依赖批次划分（跨批次冒名顶替）。
  const byCanon = new Map<string, string[]>();
  for (const [c, t] of mergeMap) {
    const arr = byCanon.get(t) ?? [];
    arr.push(c);
    byCanon.set(t, arr);
  }
  const txBatches: { target: string; codes: string[] }[][] = [];
  let cur: { target: string; codes: string[] }[] = [];
  let curCnt = 0;
  for (const [target, codes] of byCanon) {
    cur.push({ target, codes });
    curCnt += codes.length;
    if (curCnt >= BATCH) {
      txBatches.push(cur);
      cur = [];
      curCnt = 0;
    }
  }
  if (cur.length) txBatches.push(cur);

  // deleteMany(id in ...) 的 in 子句按 id 分批，避免超出 SQLite 变量上限（约 32766）
  const delByIds = async (tx: any, ids: string[], fn: (slice: string[]) => Promise<unknown>) => {
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
      await fn(ids.slice(i, i + DELETE_CHUNK));
    }
  };

  let processed = 0;
  for (const batch of txBatches) {
    const toCanon = new Map<string, string>();
    for (const g of batch) for (const c of g.codes) toCanon.set(c, g.target);
    const targets = batch.map((g) => g.target);
    const scope = [...toCanon.keys(), ...targets];

    const res = await prisma.$transaction(
      async (tx) => {
        // ── ProgramCourse ──
        const pcs = await tx.programCourse.findMany({ where: { courseCode: { in: scope } } });
        const pcMap = new Map<string, (typeof pcs)[number]>();
        for (const pc of pcs) {
          const t = toCanon.get(pc.courseCode) ?? pc.courseCode;
          const key = `${pc.programVersionId}|${t}`;
          const ex = pcMap.get(key);
          // 优先保留「带要求组」的行（组信息更丰富，避免 canonical 自身 NULL 组
          // 压过被合并行的真实组归属）；组信息相同时才让 canonical 自身行胜出。
          const betterPc =
            !ex ||
            (!ex.requirementGroupId && !!pc.requirementGroupId) ||
            (!!ex.requirementGroupId === !!pc.requirementGroupId && pc.courseCode === t && ex.courseCode !== t);
          if (betterPc) pcMap.set(key, { ...pc, courseCode: t });
        }
        if (pcs.length) {
          await delByIds(tx, pcs.map((p) => p.id), (slice) => tx.programCourse.deleteMany({ where: { id: { in: slice } } }));
        }
        for (const row of pcMap.values()) {
          await tx.programCourse.create({
            data: {
              programVersionId: row.programVersionId,
              courseCode: row.courseCode,
              suggestedSemester: row.suggestedSemester,
              isCompulsory: row.isCompulsory,
              requirementGroupId: row.requirementGroupId,
            },
          });
        }

        // ── TeacherCourse ──
        const tcs = await tx.teacherCourse.findMany({ where: { courseCode: { in: scope } } });
        const tcMap = new Map<string, (typeof tcs)[number]>();
        const nonNull = (r: (typeof tcs)[number]) =>
          (r.gpa != null ? 1 : 0) + (r.gpaStd != null ? 1 : 0) + (r.studentCount != null ? 1 : 0);
        for (const tc of tcs) {
          const t = toCanon.get(tc.courseCode) ?? tc.courseCode;
          const key = `${tc.teacherId}|${t}`;
          const ex = tcMap.get(key);
          // 非空字段多者优先；相同时优先 canonical 自身（courseCode 原本就是 t）的数据
          const betterTc =
            !ex ||
            nonNull(tc) > nonNull(ex) ||
            (nonNull(tc) === nonNull(ex) && tc.courseCode === t && ex.courseCode !== t);
          if (betterTc) tcMap.set(key, { ...tc, courseCode: t });
        }
        if (tcs.length) {
          await delByIds(tx, tcs.map((t) => t.id), (slice) => tx.teacherCourse.deleteMany({ where: { id: { in: slice } } }));
        }
        for (const row of tcMap.values()) {
          await tx.teacherCourse.create({
            data: {
              teacherId: row.teacherId,
              courseCode: row.courseCode,
              gpa: row.gpa,
              gpaStd: row.gpaStd,
              studentCount: row.studentCount,
            },
          });
        }

        // ── CourseRecord ──
        const crs = await tx.courseRecord.findMany({ where: { courseCode: { in: scope } } });
        const crMap = new Map<string, (typeof crs)[number]>();
        for (const cr of crs) {
          const t = toCanon.get(cr.courseCode) ?? cr.courseCode;
          const key = `${cr.userId}|${t}`;
          const ex = crMap.get(key);
          if (!ex || cr.courseCode === t) crMap.set(key, { ...cr, courseCode: t });
        }
        if (crs.length) {
          await delByIds(tx, crs.map((r) => r.id), (slice) => tx.courseRecord.deleteMany({ where: { id: { in: slice } } }));
        }
        for (const row of crMap.values()) {
          await tx.courseRecord.create({
            data: { userId: row.userId, courseCode: row.courseCode, status: row.status, semester: row.semester, source: row.source },
          });
        }

        // ── CourseResource ──
        const cresources = await tx.courseResource.findMany({ where: { courseCode: { in: scope } } });
        const resMap = new Map<string, (typeof cresources)[number]>();
        for (const cr of cresources) {
          const t = toCanon.get(cr.courseCode) ?? cr.courseCode;
          const key = `${cr.resourceId}|${t}`;
          const ex = resMap.get(key);
          if (!ex || cr.courseCode === t) resMap.set(key, { ...cr, courseCode: t });
        }
        if (cresources.length) {
          await delByIds(tx, cresources.map((r) => r.id), (slice) => tx.courseResource.deleteMany({ where: { id: { in: slice } } }));
        }
        for (const row of resMap.values()) {
          await tx.courseResource.create({ data: { resourceId: row.resourceId, courseCode: row.courseCode } });
        }

        // ── CoursePrerequisite（目标侧 + 前置侧都要重指）──
        const preIds = new Set<string>();
        const trows = await tx.coursePrerequisite.findMany({ where: { courseCode: { in: scope } } });
        const srows = await tx.coursePrerequisite.findMany({ where: { prerequisiteCode: { in: scope } } });
        const allPre = [...trows, ...srows];
        const preMap = new Map<string, (typeof allPre)[number]>();
        for (const p of allPre) {
          preIds.add(p.id);
          const t = toCanon.get(p.courseCode) ?? p.courseCode;
          const pre = toCanon.get(p.prerequisiteCode) ?? p.prerequisiteCode;
          if (t === pre) continue; // 合并后成自环，丢弃
          const key = `${t}|${pre}`;
          const ex = preMap.get(key);
          if (!ex || (p.courseCode === t && p.prerequisiteCode === pre)) {
            preMap.set(key, { ...p, courseCode: t, prerequisiteCode: pre });
          }
        }
        if (preIds.size) {
          await delByIds(tx, [...preIds], (slice) => tx.coursePrerequisite.deleteMany({ where: { id: { in: slice } } }));
        }
        for (const row of preMap.values()) {
          await tx.coursePrerequisite.create({
            data: { courseCode: row.courseCode, prerequisiteCode: row.prerequisiteCode, relationType: row.relationType, reason: row.reason },
          });
        }

        // ── 删除被合并课程行（code 数量 ≤ BATCH，in 子句安全）──
        await tx.course.deleteMany({ where: { code: { in: [...toCanon.keys()] } } });

        return {
          programCourse: pcs.length,
          teacherCourse: tcs.length,
          courseRecord: crs.length,
          courseResource: cresources.length,
          prerequisite: preIds.size,
        };
      },
      { timeout: TX_TIMEOUT },
    );

    stats.programCourse += res.programCourse;
    stats.teacherCourse += res.teacherCourse;
    stats.courseRecord += res.courseRecord;
    stats.courseResource += res.courseResource;
    stats.prerequisite += res.prerequisite;

    processed += toCanon.size;
    if (processed % 1000 === 0 || processed >= mergeMap.size) {
      console.log(
        `   ${Math.min(processed, mergeMap.size)}/${mergeMap.size} 已合并 (${stats.courseRecord + stats.courseResource + stats.programCourse + stats.prerequisite + stats.teacherCourse} 行重指)`,
      );
    }
  }

  // ── Phase 4: 统计 ──────────────────────────────────────────
  console.log("\n=== 清理完成 ===");
  const total = await prisma.course.count();
  const empty = (await prisma.$queryRawUnsafe<{ c: number }[]>("SELECT COUNT(*) c FROM Course WHERE trim(name)='' OR name LIKE '(课程名待补充%'"))[0]?.c ?? 0;
  const star = (await prisma.$queryRawUnsafe<{ c: number }[]>("SELECT COUNT(*) c FROM Course WHERE name LIKE '%*%' OR name LIKE '%△%'"))[0]?.c ?? 0;
  const withTc = (await prisma.$queryRawUnsafe<{ c: number }[]>("SELECT COUNT(DISTINCT courseCode) c FROM TeacherCourse"))[0]?.c ?? 0;
  console.log(`课程总数: ${total}（合并前 ${all.length}）`);
  console.log(`空名/占位名课程: ${empty}`);
  console.log(`仍含 *△ 的课程: ${star}`);
  console.log(`有老师关联的课程: ${withTc}`);
  console.log(`外键重指向合计: ${JSON.stringify(stats)}`);
  if (auditWarnings.length) {
    console.log("\n⚠ canonical 学分审计清单（丢弃了更高学分的课程，请人工复核）:");
    for (const w of auditWarnings) console.log(`  ${w}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
