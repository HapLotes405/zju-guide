// =============================================================================
// migrate-high-confidence.cjs — 迁移「高置信」老代码课程到新代码课程（二期）
//
// 背景：老代码课程清理第一轮已删除 667 门无老师数据课程，保留 316 门有老师数据。
//       用户复核后决定：高置信 → 迁移合并；中置信 175 + 无候选 120 → 保留不动。
//       多 Agent 对抗性审查后，从原 21 门中降级保留 3 门误报映射：
//         65190090 材料工艺学→MSE2011M 材料工艺学Ⅰ（完整课并入阶段课）
//         04190100 工程伦理导论→PHIL0300G 工程伦理导论(A)（无轨道→有轨道）
//         16121032 生物统计学与试验设计→CAB2001F …（甲）（无轨道→有轨道）
//       本脚本迁移其余 18 门（14 个目标，含 4 组多对一：内科学/外科学/书法史/现代西方哲学）。
//
// 迁移内容：
//   1. TeacherCourse：老师数据挂到目标新码
//        - 组内碰撞（同老师教 I 与 II 都→同目标）：保留 studentCount 最大行，删其余
//        - 目标已存在 (teacherId, target)：同样按「更大样本量者存活」——旧行更优则
//          删目标行 + 重指向旧行（TeacherCourse 无入向外键，身份互换安全）；目标行更优则删旧行
//        - 其余：courseCode 重指向到目标
//   2. ProgramCourse：培养方案行重指向
//        - 组内碰撞（同一 programVersion 出现 I 与 II 都→同目标）：合并为一行
//          isCompulsory=OR / requirementGroupId=首个非空 / suggestedSemester=min
//        - 目标已有 (programVersionId, target)：防御性并入已有行
//        - 其余：courseCode 重指向
//   3. 删除老课程（预检保证 CourseRecord/CourseResource/CoursePrerequisite 引用均为 0）
//
// 用法：node prisma/migrate-high-confidence.cjs --dry-run | --apply
// =============================================================================
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DB_PATH = path.resolve(__dirname, "dev.db");
const D = "--dry-run" === process.argv[2] || "--dry-run" === process.argv[3];

// ── 18 组高置信映射（老代码 → 目标新码）────────────────────────────────
// 经多 Agent 对抗性审查：移除 65190090 / 04190100 / 16121032（轨道/阶段歧义）
const MAPPINGS = [
  ["17121230", "CAS2001M"], ["18120741", "MED2033M"], ["56120050", "SAA3018M"],
  ["58120500", "ME3418M"], ["70120270", "MED4508M"], ["70120280", "MED4509M"],
  ["70120310", "MED4508M"], ["70120320", "MED4509M"], ["551R0060", "MARX3001G"],
  ["04125490", "HIST1005M"], ["04124771", "HIST2017M"], ["04124811", "HIST2023M"],
  ["04198550", "HIST2018M"], ["04125470", "HIST2025M"], ["04122910", "SAA1024M"],
  ["04122920", "SAA1024M"], ["04129740", "PHIL2014M"], ["04129750", "PHIL2014M"],
];
const OLD_TO_TGT = new Map(MAPPINGS);
const OLD_CODES = [...new Set(MAPPINGS.map((m) => m[0]))];
const TGT_CODES = [...new Set(MAPPINGS.map((m) => m[1]))];

// ── 连接自证：精确比较规范化绝对路径，防 DATABASE_URL 被环境变量覆盖/后缀误匹配 ──
const normPath = (p) => String(p || "").replace(/\\/g, "/").toLowerCase();
async function assertDbPath() {
  const rows = await prisma.$queryRawUnsafe("SELECT file FROM pragma_database_list WHERE name='main'");
  const file = rows && rows[0] && rows[0].file;
  const connected = normPath(path.resolve(file || ""));
  const expect = normPath(path.resolve(DB_PATH));
  if (!connected || connected !== expect) {
    throw new Error(
      `DB mismatch: Prisma connected to "${file}", script expects "${DB_PATH}". Refusing to run.`,
    );
  }
  console.log(`[校验] 连接的库文件: ${file} ✓`);
}

// 确定性排序键（uuid 稳定）
const sortKey = (r) => `${r.courseCode}|${r.id}`;
const n = (r) => r.studentCount ?? -1;
const richness = (r) => (r.studentCount != null ? 1 : 0) + (r.gpa != null ? 1 : 0) + (r.gpaStd != null ? 1 : 0);
// 保留更优行：样本量最大 → 字段更全 → 字典序（id）小者
const better = (a, b) => {
  if (n(a) !== n(b)) return n(a) > n(b) ? a : b;
  if (richness(a) !== richness(b)) return richness(a) > richness(b) ? a : b;
  return sortKey(a).localeCompare(sortKey(b)) <= 0 ? a : b;
};

async function main() {
  await assertDbPath();
  if (!fs.existsSync(DB_PATH)) { console.error(`dev.db not found: ${DB_PATH}`); process.exit(1); }

  // ── 预检 1：18 门老课 / 14 目标存在 ────────────────────────────────
  const oldCourses = await prisma.course.findMany({ where: { code: { in: OLD_CODES } }, select: { code: true, name: true } });
  const tgtCourses = await prisma.course.findMany({ where: { code: { in: TGT_CODES } }, select: { code: true, name: true } });
  const oldSet = new Set(oldCourses.map((c) => c.code));
  const tgtSet = new Set(tgtCourses.map((c) => c.code));
  const missingOld = OLD_CODES.filter((c) => !oldSet.has(c));
  const missingTgt = TGT_CODES.filter((c) => !tgtSet.has(c));
  if (missingOld.length || missingTgt.length) {
    throw new Error(`课程缺失：老课 ${missingOld.join(",")} | 目标 ${missingTgt.join(",")}`);
  }
  console.log(`[预检] 老课程 ${oldCourses.length} / 目标课程 ${tgtCourses.length} ✓`);
  console.log(`目标课程: ${tgtCourses.map((c) => `${c.code} ${c.name}`).join(" | ")}`);

  // ── 预检 2：删除集外键引用（应全为 0）────────────────────────────
  const [crCount, csCount, preCount, depCount] = await Promise.all([
    prisma.courseRecord.count({ where: { courseCode: { in: OLD_CODES } } }),
    prisma.courseResource.count({ where: { courseCode: { in: OLD_CODES } } }),
    prisma.coursePrerequisite.count({ where: { courseCode: { in: OLD_CODES } } }),
    prisma.coursePrerequisite.count({ where: { prerequisiteCode: { in: OLD_CODES } } }),
  ]);
  const fk = { courseRecord: crCount, courseResource: csCount, prereqTarget: preCount, prereqSource: depCount };
  console.log(`[预检] 删除集外键引用（应为 0）: ${JSON.stringify(fk)}`);
  if (crCount + csCount + preCount + depCount > 0) {
    throw new Error(`删除集存在未处理外键: ${JSON.stringify(fk)}，请先处理。`);
  }

  // ── 备份（预检通过后才备份，避免孤儿备份）────────────────────────
  if (!D) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bakPath = `${DB_PATH}.bak-${ts}`;
    fs.copyFileSync(DB_PATH, bakPath);
    console.log(`[备份] → ${path.basename(bakPath)}`);
  }

  // ── TeacherCourse 合并计划 ──────────────────────────────────────────
  const oldTc = await prisma.teacherCourse.findMany({ where: { courseCode: { in: OLD_CODES } } });
  const tgtTc = await prisma.teacherCourse.findMany({ where: { courseCode: { in: TGT_CODES } } });
  const tgtTcByKey = new Map(tgtTc.map((t) => [`${t.courseCode}|${t.teacherId}`, t]));

  // 组内（同老师→同目标）先选出幸存者：样本量最大，平手取字段更全/字典序小
  const byTeacherTgt = new Map();
  for (const t of oldTc) {
    const k = `${t.teacherId}|${OLD_TO_TGT.get(t.courseCode)}`;
    if (!byTeacherTgt.has(k)) byTeacherTgt.set(k, []);
    byTeacherTgt.get(k).push(t);
  }
  const tcIntraDel = [];   // 组内被合并删除的行 id（老课行）
  const tcSurvivors = [];  // 组内幸存者（含单元素组）
  for (const [k, rows] of byTeacherTgt) {
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    let keep = rows[0];
    for (const r of rows.slice(1)) keep = better(keep, r);
    for (const r of rows) if (r.id !== keep.id) tcIntraDel.push(r.id);
    tcSurvivors.push(keep);
  }
  tcIntraDel.sort();

  // 幸存者再与目标已有行 PK：样本量更大者存活
  const tcRePoint = [];    // 重指向旧行（无目标行，或旧行胜出删目标行后）
  const tcOldDel = [];     // 删除旧行（目标行样本更大/持平）
  const tcTgtDel = [];     // 删除目标行（旧行样本更大，由重指向替位）
  const oldById = new Map(oldTc.map((t) => [t.id, t]));
  for (const t of tcSurvivors) {
    const tgt = OLD_TO_TGT.get(t.courseCode);
    const existing = tgtTcByKey.get(`${tgt}|${t.teacherId}`);
    if (!existing) { tcRePoint.push({ id: t.id, from: t.courseCode, to: tgt }); continue; }
    if (better(t, existing) === t) { tcTgtDel.push(existing.id); tcRePoint.push({ id: t.id, from: t.courseCode, to: tgt }); }
    else { tcOldDel.push(t.id); }
  }
  tcOldDel.sort(); tcTgtDel.sort();
  console.log(`\nTeacherCourse: 总 ${oldTc.length} 行 | 组内合并删 ${tcIntraDel.length} | 目标行胜保留删旧 ${tcOldDel.length} | 旧行胜删目标行 ${tcTgtDel.length} | 重指向 ${tcRePoint.length}`);

  // 输出碰撞明细（含老师姓名与双方样本量）便于人工复核
  const allTids = new Set([...tcIntraDel, ...tcOldDel].map((id) => oldById.get(id)?.teacherId).filter(Boolean));
  const allTgTids = new Set(tcTgtDel.map((id) => tgtTc.find((t) => t.id === id)?.teacherId).filter(Boolean));
  for (const r of tcRePoint) allTids.add(oldById.get(r.id)?.teacherId);
  const tNames = await prisma.teacher.findMany({ where: { id: { in: [...allTids, ...allTgTids] } }, select: { id: true, name: true } });
  const tNameMap = new Map(tNames.map((x) => [x.id, x.name]));
  const tgtById = new Map(tgtTc.map((t) => [t.id, t]));
  for (const id of tcTgtDel) {
    const tg = tgtById.get(id);
    const winner = tcRePoint.find((r) => {
      const o = oldById.get(r.id);
      return o && o.teacherId === tg.teacherId && r.to === tg.courseCode;
    });
    const oldRow = winner ? oldById.get(winner.id) : null;
    console.log(`  旧行胜删目标行: ${tNameMap.get(tg?.teacherId) ?? tg?.teacherId} | 旧 ${oldRow?.courseCode}(n=${oldRow?.studentCount}) 胜 目标 ${tg?.courseCode}(n=${tg?.studentCount})`);
  }
  for (const id of tcOldDel) {
    const oldRow = oldById.get(id);
    const tg = tgtTcByKey.get(`${OLD_TO_TGT.get(oldRow.courseCode)}|${oldRow.teacherId}`);
    console.log(`  目标行胜删旧: ${tNameMap.get(oldRow?.teacherId) ?? oldRow?.teacherId} | 目标 ${tg?.courseCode}(n=${tg?.studentCount}) 胜 旧 ${oldRow?.courseCode}(n=${oldRow?.studentCount})`);
  }
  const tcRePointDetail = [];
  for (const r of tcRePoint) {
    const old = oldById.get(r.id);
    tcRePointDetail.push(`${tNameMap.get(old?.teacherId) ?? old?.teacherId} ${r.from}(n=${old?.studentCount}) -> ${r.to}`);
  }
  console.log(`  重指向示例: ${tcRePointDetail.slice(0, 8).join(" | ")}${tcRePointDetail.length > 8 ? " …" : ""}`);

  // ── ProgramCourse 合并计划 ──────────────────────────────────────────
  const oldPc = await prisma.programCourse.findMany({ where: { courseCode: { in: OLD_CODES } } });
  const tgtPc = await prisma.programCourse.findMany({ where: { courseCode: { in: TGT_CODES } } });
  const tgtPcSet = new Set(tgtPc.map((p) => `${p.programVersionId}|${p.courseCode}`));
  const tgtPcByKey = new Map(tgtPc.map((p) => [`${p.programVersionId}|${p.courseCode}`, p]));

  const byPvTgt = new Map();
  for (const p of oldPc) {
    const k = `${p.programVersionId}|${OLD_TO_TGT.get(p.courseCode)}`;
    if (!byPvTgt.has(k)) byPvTgt.set(k, []);
    byPvTgt.get(k).push(p);
  }
  const pcPlan = [];
  for (const [k, rows] of byPvTgt) {
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const [pvId] = k.split("|");
    const tgt = OLD_TO_TGT.get(rows[0].courseCode);
    const isCompulsory = rows.some((r) => r.isCompulsory);
    const requirementGroupId = rows.find((r) => r.requirementGroupId)?.requirementGroupId ?? null;
    const suggestedSemester = Math.min(...rows.map((r) => r.suggestedSemester ?? 10));
    const existing = tgtPcSet.has(`${pvId}|${tgt}`) ? tgtPcByKey.get(`${pvId}|${tgt}`) : null;
    if (existing) {
      pcPlan.push({
        existingId: existing.id, action: "mergeIntoExisting",
        isCompulsory: existing.isCompulsory || isCompulsory,
        requirementGroupId: existing.requirementGroupId ?? requirementGroupId,
        suggestedSemester: Math.min(existing.suggestedSemester ?? 10, suggestedSemester),
        deleteIds: rows.map((r) => r.id), from: rows.map((r) => r.courseCode).join("+"), to: tgt,
      });
    } else if (rows.length > 1) {
      const keep = rows[0];
      pcPlan.push({ id: keep.id, from: keep.courseCode, to: tgt, action: "merge",
        isCompulsory, requirementGroupId, suggestedSemester, deleteIds: rows.slice(1).map((r) => r.id) });
    } else {
      pcPlan.push({ id: rows[0].id, from: rows[0].courseCode, to: tgt, action: "update", deleteIds: [] });
    }
  }
  const pcUpdate = pcPlan.filter((p) => p.action === "update");
  const pcMerge = pcPlan.filter((p) => p.action === "merge");
  const pcIntoExisting = pcPlan.filter((p) => p.action === "mergeIntoExisting");
  console.log(`\nProgramCourse: 总 ${oldPc.length} 行 | 重指向 ${pcUpdate.length} | 组内合并 ${pcMerge.length} | 并入已有 ${pcIntoExisting.length}`);
  for (const p of pcMerge) {
    console.log(`  组内合并: ${p.from} +${p.deleteIds.length} -> ${p.to} (必修=${p.isCompulsory} 学期=${p.suggestedSemester})`);
  }

  if (D) {
    console.log("\n[dry-run] 未落库。数据核对：");
    console.log(`  课程变化: 删除 ${OLD_CODES.length} 门（${oldCourses.map((c) => c.code).join(",")}）`);
    console.log(`  TeacherCourse: 重指向 ${tcRePoint.length} / 删旧行 ${tcIntraDel.length + tcOldDel.length} / 删目标行 ${tcTgtDel.length}`);
    console.log(`  ProgramCourse: 重指向 ${pcUpdate.length} / 合并 ${pcMerge.length} / 并入已有 ${pcIntoExisting.length}`);
    await prisma.$disconnect();
    return;
  }

  // ── apply：事务执行（显式 timeout，防 Prisma 默认 5s 超时）──────────
  const r = await prisma.$transaction(async (tx) => {
    // 1. TeacherCourse：删组内 loser 旧行 + 删目标行（旧行胜出）+ 删目标行胜出的旧行
    const delOldIds = [...tcIntraDel, ...tcOldDel];
    for (let i = 0; i < delOldIds.length; i += 500) {
      if (delOldIds.slice(i, i + 500).length) await tx.teacherCourse.deleteMany({ where: { id: { in: delOldIds.slice(i, i + 500) } } });
    }
    for (let i = 0; i < tcTgtDel.length; i += 500) {
      if (tcTgtDel.slice(i, i + 500).length) await tx.teacherCourse.deleteMany({ where: { id: { in: tcTgtDel.slice(i, i + 500) } } });
    }
    for (const rw of tcRePoint) {
      await tx.teacherCourse.update({ where: { id: rw.id }, data: { courseCode: rw.to } });
    }
    // 2. ProgramCourse：重指向 / 合并 / 并入已有
    for (const p of pcUpdate) {
      await tx.programCourse.update({ where: { id: p.id }, data: { courseCode: p.to } });
    }
    for (const p of pcMerge) {
      await tx.programCourse.update({
        where: { id: p.id },
        data: { courseCode: p.to, isCompulsory: p.isCompulsory, requirementGroupId: p.requirementGroupId, suggestedSemester: p.suggestedSemester },
      });
      if (p.deleteIds.length) await tx.programCourse.deleteMany({ where: { id: { in: p.deleteIds } } });
    }
    for (const p of pcIntoExisting) {
      await tx.programCourse.update({
        where: { id: p.existingId },
        data: { isCompulsory: p.isCompulsory, requirementGroupId: p.requirementGroupId, suggestedSemester: p.suggestedSemester },
      });
      if (p.deleteIds.length) await tx.programCourse.deleteMany({ where: { id: { in: p.deleteIds } } });
    }
    // 3. 删除老课程
    await tx.course.deleteMany({ where: { code: { in: OLD_CODES } } });
    return {};
  }, { timeout: 120000 });

  // ── 落库后核对（非预期即 throw）─────────────────────────────────────
  const afterOld = await prisma.course.count({ where: { code: { in: OLD_CODES } } });
  const afterTcOld = await prisma.teacherCourse.count({ where: { courseCode: { in: OLD_CODES } } });
  const afterPcOld = await prisma.programCourse.count({ where: { courseCode: { in: OLD_CODES } } });
  const dupTc = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) c FROM (SELECT teacherId, courseCode FROM TeacherCourse WHERE courseCode IN (${TGT_CODES.map(() => "?").join(",")}) GROUP BY teacherId, courseCode HAVING COUNT(*) > 1)`, ...TGT_CODES);
  const dupPc = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) c FROM (SELECT programVersionId, courseCode FROM ProgramCourse WHERE courseCode IN (${TGT_CODES.map(() => "?").join(",")}) GROUP BY programVersionId, courseCode HAVING COUNT(*) > 1)`, ...TGT_CODES);
  const total = await prisma.course.count();
  console.log("\n[apply] 事务完成：PC 重指向/合并/并入已执行");
  console.log(`[apply] 课程总数: ${total}`);
  console.log(`[apply] 老课程余: ${afterOld}（应为 0）| 老课老师行余: ${afterTcOld}（应为 0）| 老课培养行余: ${afterPcOld}（应为 0）`);
  console.log(`[apply] 目标课程 TeacherCourse @@unique 重复: ${dupTc[0].c}（应为 0）| ProgramCourse @@unique 重复: ${dupPc[0].c}（应为 0）`);
  const errs = [];
  if (afterOld !== 0) errs.push(`老课程余 ${afterOld} ≠ 0`);
  if (afterTcOld !== 0) errs.push(`老课老师行余 ${afterTcOld} ≠ 0`);
  if (afterPcOld !== 0) errs.push(`老课培养行余 ${afterPcOld} ≠ 0`);
  if (Number(dupTc[0].c) !== 0) errs.push(`目标 TeacherCourse @@unique 重复 ${dupTc[0].c} ≠ 0`);
  if (Number(dupPc[0].c) !== 0) errs.push(`目标 ProgramCourse @@unique 重复 ${dupPc[0].c} ≠ 0`);
  if (errs.length) throw new Error("落库后核对失败: " + errs.join("; "));
  console.log("[apply] 落库后核对全部通过 ✓");
}

main().catch((e) => { console.error(e); process.exit(1); });
