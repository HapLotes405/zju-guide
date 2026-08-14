// =============================================================================
// delete-old-courses.cjs — 删除「无查老师数据」的老代码课程（一次性数据治理）
//
// 决策依据（用户拍板）：
//   * 老代码课程（数字开头）中有查老师数据(TeacherCourse)的 → 保留，数据不动
//   * 老代码课程中无查老师数据的 → 删除
//   * 删除的课程若按归一化名能匹配到新代码 → 其培养方案(ProgramCourse)行重指向新代码；
//     否则其 ProgramCourse 行随课程删除
//
// 安全约束（含对抗性审查加固）：
//   * 备份 dev.db（自动，带时间戳；仅 apply 模式）
//   * 连接自证：断言 Prisma 打开的就是 dev.db（防 DATABASE_URL 被环境变量覆盖）
//   * 删除前断言：删除集课程上不存在 TeacherCourse / CourseRecord /
//     CourseResource / CoursePrerequisite 引用（已确认全部为 0，若有则中止）
//   * 一对多（多个新代码同名）→ 选培养方案引用数最多者；再比查老师数据；最后比 code；
//     老课名带 (H)/(A)/(B) 轨道标记时优先带对应后缀的码
//   * PC 行重指向为【确定性合并】：按 (programVersionId, 目标码) 分组，
//     primary = 目标已存在行（否则最小老码行），必修取 OR、要求组取非空、学期取 primary，
//     所有冲突逐条记入日志（dry-run 与 apply 共用同一 mergePlan，计数一致）
//   * 采纳审计高置信映射（EXTRA_MAPPINGS，无老师数据课程，避免误删可挽回的 PC 行）
//   * deleteMany 按 code 分批，避免超出 SQLite 变量上限（约 32766）
//
// 用法：
//   node prisma/delete-old-courses.cjs --dry-run   # 只输出将做的修改，不落库
//   node prisma/delete-old-courses.cjs --apply     # 落库
// =============================================================================
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const DB_PATH = path.resolve(__dirname, "dev.db");

const isOld = (code) => /^\d/.test(code);
const CHUNK = 500; // deleteMany(code in ...) 分批，防超 SQLite 变量上限

function norm(name) {
  let n = String(name || "").trim();
  const ROMAN = { "Ⅰ":"I","Ⅱ":"II","Ⅲ":"III","Ⅳ":"IV","Ⅴ":"V","Ⅵ":"VI","Ⅶ":"VII","Ⅷ":"VIII","Ⅸ":"IX","Ⅹ":"X" };
  for (const [k,v] of Object.entries(ROMAN)) n = n.split(k).join(v);
  n = n.replace(/[（[]/g,"(").replace(/[）\]]/g,")")
        .replace(/：/g,":").replace(/，/g,",").replace(/；/g,";")
        .replace(/[／/]/g,"/").replace(/[、]/g,",").replace(/[·・]/g,"")
        .replace(/[*△▲◇☆★○●◎□■✦✧◆]/g,"")
        .replace(/\s+/g,"").replace(/　/g,"").toLowerCase();
  return n;
}

const D = "--dry-run" === process.argv[2] || "--dry-run" === process.argv[3];

// 审计采纳的高置信映射（无老师数据的删除集课程 → 新码；对照 _audit-out.json noTc[].high）
// 仅采纳干净 1:1 的去标记匹配；1→N 拆分（如 12188271 专题设计训练）不采纳
const EXTRA_MAPPINGS = {
  "04124841":   "HIST1003M",  // 世界古代中世纪史（Q）→ 世界古代中世纪史
  "07190110":   "BIO3070M",   // 保护生物学 → 保护生物学（甲）
  "04125490EQ": "HIST1005M",  // 中国古代史（上）（Q）→ 中国古代史（上）
};

// 校验 Prisma 实际连接的库文件就是我们要操作的 dev.db（防 process.env 覆盖 .env）
const normPath = (p) => String(p || "").replace(/\\/g, "/").toLowerCase();
async function assertDbPath() {
  const rows = await prisma.$queryRawUnsafe("SELECT file FROM pragma_database_list WHERE name='main'");
  const file = rows && rows[0] && rows[0].file;
  const connected = normPath(file);
  const expect = normPath(DB_PATH);
  if (!connected || !connected.endsWith(expect.replace(/^.*prisma\//, "prisma/"))) {
    throw new Error(
      `DB mismatch: Prisma connected to "${file}", script expects "${DB_PATH}". ` +
      `Refusing to run against the wrong database.`,
    );
  }
  console.log(`[校验] 连接的库文件: ${file} ✓`);
}

async function main() {
  await assertDbPath();
  // ── 备份（仅 apply 模式；dry-run 不落库，无需备份）──────────────────
  if (!fs.existsSync(DB_PATH)) { console.error(`dev.db not found: ${DB_PATH}`); process.exit(1); }
  if (!D) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bakPath = `${DB_PATH}.bak-${ts}`;
    fs.copyFileSync(DB_PATH, bakPath);
    console.log(`[备份] → ${path.basename(bakPath)}`);
  }

  // ── 计算 保留集 / 删除集 ─────────────────────────────────────────────
  const courses = await prisma.course.findMany({ select: { code: true, name: true, credits: true } });
  const oldC = courses.filter((c) => isOld(c.code));
  console.log(`\n老代码课程总数: ${oldC.length} | 全库课程: ${courses.length}`);

  const tcOldCodes = await prisma.teacherCourse.findMany({ select: { courseCode: true } });
  const tcOldSet = new Set(tcOldCodes.filter((t) => isOld(t.courseCode)).map((t) => t.courseCode));
  const keep = oldC.filter((c) => tcOldSet.has(c.code));     // 有老师数据 → 保留
  const deleteCodes = oldC.filter((c) => !tcOldSet.has(c.code)).map((c) => c.code);
  const deleteSet = new Set(deleteCodes);
  console.log(`  有老师数据 → 保留: ${keep.length} 门`);
  console.log(`  无老师数据 → 删除: ${deleteCodes.length} 门`);

  // 标记：被保留课程里是否有占位名（原任务遗留）
  const phKept = keep.filter((c) => String(c.name).startsWith("(课程名待补充:"));
  if (phKept.length) console.log(`  ⚠ 保留的课程中仍有占位名: ${phKept.map((c) => c.code).join(", ")}`);

  // ── 构造 老→新 映射（仅针对删除集）──────────────────────────────────
  const newC = courses.filter((c) => !isOld(c.code));
  const newByNorm = new Map();
  for (const c of newC) {
    const k = norm(c.name);
    if (!newByNorm.has(k)) newByNorm.set(k, []);
    newByNorm.get(k).push(c.code);
  }
  const pcCnt = new Map();
  for (const r of await prisma.programCourse.groupBy({ by: ["courseCode"], _count: { _all: true } })) {
    pcCnt.set(r.courseCode, r._count._all);
  }
  const tcCnt = new Map();
  for (const r of await prisma.teacherCourse.groupBy({ by: ["courseCode"], _count: { _all: true } })) {
    tcCnt.set(r.courseCode, r._count._all);
  }
  const rankKey = (code) => -(pcCnt.get(code) || 0) * 10000 - (tcCnt.get(code) || 0); // 越小越优先
  const trackMarker = (name) => {
    const n = String(name || "");
    if (/(\(|（)H(\)|）)/i.test(n)) return "H";
    if (/(\(|（)A(\)|）)/i.test(n)) return "A";
    if (/(\(|（)B(\)|）)/i.test(n)) return "B";
    return null;
  };
  const markerMatch = (code, m) => m === "H" ? /H$/.test(code) : m === "A" ? /A$/.test(code) : /B$/.test(code);
  const pick = (name, cands) => {
    const m = trackMarker(name);
    if (m) {
      const marked = cands.filter((c) => markerMatch(c, m));
      if (marked.length) return marked.sort((a, b) => rankKey(a) - rankKey(b))[0];
    }
    return cands.slice().sort((a, b) => rankKey(a) - rankKey(b))[0];
  };
  const oldToNew = new Map();  // 老 code -> 选定的新 code
  const oneToManyList = [];
  let mapped = 0;
  for (const code of deleteCodes) {
    const row = courses.find((c) => c.code === code);
    const k = norm(row.name);
    const cands = newByNorm.get(k);
    if (cands && cands.length) {
      oldToNew.set(code, pick(row.name, cands));
      if (cands.length > 1) oneToManyList.push({ code, name: row.name, cands, picked: oldToNew.get(code) });
      mapped++;
    }
  }
  // 采纳审计高置信映射
  let extraMapped = 0;
  for (const [code, target] of Object.entries(EXTRA_MAPPINGS)) {
    if (deleteSet.has(code) && !oldToNew.has(code) && newC.some((c) => c.code === target)) {
      oldToNew.set(code, target);
      extraMapped++;
    }
  }
  console.log(`  删除集中按归一化名匹配到新代码: ${mapped} | 审计采纳补充: ${extraMapped} | 一对多: ${oneToManyList.length}`);
  const unmappedDelete = deleteCodes.filter((c) => !oldToNew.has(c));
  console.log(`  删除集中无映射（培养方案行随课程删除）: ${unmappedDelete.length}`);

  // ── 断言：删除集上不存在其余外键引用 ─────────────────────────────
  const crCnt = await prisma.courseRecord.count({ where: { courseCode: { in: deleteCodes } } });
  const crsCnt = await prisma.courseResource.count({ where: { courseCode: { in: deleteCodes } } });
  const tcCnt2 = await prisma.teacherCourse.count({ where: { courseCode: { in: deleteCodes } } });
  const preA = await prisma.coursePrerequisite.count({ where: { courseCode: { in: deleteCodes } } });
  const preB = await prisma.coursePrerequisite.count({ where: { prerequisiteCode: { in: deleteCodes } } });
  const fk = { courseRecord: crCnt, courseResource: crsCnt, teacherCourse: tcCnt2, prereqTarget: preA, prereqSource: preB };
  console.log(`\n删除集上的其余外键引用（应为 0）: ${JSON.stringify(fk)}`);
  for (const [k, v] of Object.entries(fk)) {
    if (v > 0) throw new Error(`删除集上存在 ${k} 引用 ${v} 条，中止（需先处理）`);
  }

  // ── 确定性 PC 合并计划（dry-run 与 apply 共用）─────────────────────
  const pcRows = await prisma.programCourse.findMany({
    where: { courseCode: { in: deleteCodes } },
    select: { id: true, programVersionId: true, courseCode: true, suggestedSemester: true, isCompulsory: true, requirementGroupId: true },
  });
  const targets = [...new Set(oldToNew.values())];
  const existingTarget = await prisma.programCourse.findMany({
    where: { courseCode: { in: targets } },
    select: { programVersionId: true, courseCode: true, requirementGroupId: true, isCompulsory: true, suggestedSemester: true },
  });
  const existingByKey = new Map(existingTarget.map((r) => [`${r.programVersionId}|${r.courseCode}`, r]));

  const contribByKey = new Map(); // key -> 老码 PC 行[]
  let pcUnmapped = 0;
  for (const pc of pcRows) {
    const target = oldToNew.get(pc.courseCode);
    if (!target) { pcUnmapped++; continue; }
    const key = `${pc.programVersionId}|${target}`;
    if (!contribByKey.has(key)) contribByKey.set(key, []);
    contribByKey.get(key).push(pc);
  }

  // mergePlan: 每 key 的最终行状态
  const mergePlan = [];   // { key, programVersionId, target, existing, needCreate, needUpdate, isCompulsory, requirementGroupId, suggestedSemester }
  const conflicts = [];   // { key, type, detail }
  for (const [key, rows] of contribByKey) {
    rows.sort((a, b) => (a.courseCode < b.courseCode ? -1 : a.courseCode > b.courseCode ? 1 : 0)); // 确定性
    const existing = existingByKey.get(key);
    const [pvId, target] = key.split("|");
    let isCompulsory = existing ? existing.isCompulsory : rows[0].isCompulsory;
    let requirementGroupId = existing ? existing.requirementGroupId : rows[0].requirementGroupId;
    let chgComp = false, chgGroup = false;

    for (const r of rows) {
      // 必修取 OR（永不静默把必修降为选修）
      if (r.isCompulsory && !isCompulsory) { isCompulsory = true; chgComp = true; }
      if (r.requirementGroupId && !requirementGroupId) { requirementGroupId = r.requirementGroupId; chgGroup = true; }
      if (existing) {
        if (r.isCompulsory !== existing.isCompulsory)
          conflicts.push({ key, type: "isCompulsory", detail: `目标 ${existing.courseCode}(必修=${existing.isCompulsory}) vs 老码 ${r.courseCode}(必修=${r.isCompulsory}) → 取必修=${isCompulsory}` });
        if (r.suggestedSemester !== existing.suggestedSemester)
          conflicts.push({ key, type: "semester", detail: `目标 ${existing.courseCode}(学期${existing.suggestedSemester}) vs 老码 ${r.courseCode}(学期${r.suggestedSemester}) → 取 ${existing.suggestedSemester}` });
      } else if (r !== rows[0]) {
        if (r.isCompulsory !== rows[0].isCompulsory)
          conflicts.push({ key, type: "isCompulsory", detail: `老码 ${rows[0].courseCode}(必修=${rows[0].isCompulsory}) vs 老码 ${r.courseCode}(必修=${r.isCompulsory}) → 取必修=${isCompulsory}` });
        if (r.suggestedSemester !== rows[0].suggestedSemester)
          conflicts.push({ key, type: "semester", detail: `老码 ${rows[0].courseCode}(学期${rows[0].suggestedSemester}) vs 老码 ${r.courseCode}(学期${r.suggestedSemester}) → 取 ${rows[0].suggestedSemester}` });
      }
    }
    mergePlan.push({
      key, programVersionId: pvId, target,
      existing: !!existing,
      needCreate: !existing,
      needUpdate: !!existing && (chgComp || chgGroup),
      isCompulsory, requirementGroupId,
      suggestedSemester: existing ? existing.suggestedSemester : rows[0].suggestedSemester,
    });
  }

  const pcCreate = mergePlan.filter((p) => p.needCreate).length;
  const pcUpdate = mergePlan.filter((p) => p.needUpdate).length;
  const pcExist = mergePlan.filter((p) => p.existing).length;
  console.log(`\nProgramCourse 合并计划: 重指创建 ${pcCreate} | 目标已存在 ${pcExist}（其中需更新 ${pcUpdate}）| 无映射删除 ${pcUnmapped}`);
  console.log(`  必修/学期 冲突（已按规则确定性解决并记日志）: ${conflicts.length} 处`);
  if (D && conflicts.length) {
    console.log("\n  [冲突明细]");
    conflicts.forEach((c) => console.log(`    ${c.key} | ${c.type} | ${c.detail}`));
  }

  // 删除集课程的映射明细（供审计 + 用户确认项）
  const audit = deleteCodes.map((code) => {
    const row = courses.find((c) => c.code === code);
    return { code, name: row.name, mappedTo: oldToNew.get(code) || null };
  });
  const unmappedAudit = audit.filter((a) => !a.mappedTo);

  // 用户需确认的高危项：聚焦「2025 最新版培养方案」引用 + 体育课规模
  const pcRowsByCourse = new Map();
  for (const pc of pcRows) pcRowsByCourse.set(pc.courseCode, (pcRowsByCourse.get(pc.courseCode) || 0) + 1);
  const pvs = await prisma.programVersion.findMany({ select: { id: true, majorName: true, year: true, isActive: true } });
  const pv2025 = pvs.filter((p) => p.year === 2025);
  const pv2025Ids = new Set(pv2025.map((p) => p.id));
  const hit2025 = [];
  for (const pc of pcRows) {
    if (pv2025Ids.has(pc.programVersionId) && !oldToNew.has(pc.courseCode)) {
      const pv = pv2025.find((p) => p.id === pc.programVersionId);
      hit2025.push({ code: pc.courseCode, name: audit.find((a) => a.code === pc.courseCode)?.name, pv: `${pv.majorName}${pv.year}`, active: pv.isActive });
    }
  }
  const peCourses = unmappedAudit.filter((a) => /^体育[ⅠⅡⅢⅣⅤⅥⅦⅧ]/.test(a.name));
  console.log("\n=== 用户需确认的高危项 ===");
  if (hit2025.length) {
    const byCode = new Map();
    hit2025.forEach((h) => { const arr = byCode.get(h.code) || { name: h.name, plans: [] }; arr.plans.push(`${h.pv}${h.active ? "(激活)" : ""}`); byCode.set(h.code, arr); });
    for (const [code, v] of byCode) console.log(`  ⚠ ${code} ${v.name} → 删除，但被 2025 最新版引用: ${v.plans.join(", ")}`);
  } else {
    console.log("  无删除集课程被 2025 最新版培养方案引用 ✓");
  }
  if (peCourses.length) {
    const pePc = peCourses.reduce((s, a) => s + (pcRowsByCourse.get(a.code) || 0), 0);
    console.log(`  ⚠ 体育Ⅰ–Ⅷ 系列 ${peCourses.length} 门无映射删除，其 PC 行 ${pePc} 行随课程消失（占无映射 PC 行的 ${(pePc / (pcUnmapped || 1) * 100).toFixed(0)}%）`);
    console.log(`    课程: ${peCourses.map((a) => a.code).join(", ")}`);
  }

  console.log(`\n=== dry-run 统计摘要 ===`);
  console.log(`保留(有老师数据): ${keep.length}`);
  console.log(`删除: ${deleteCodes.length}（映射到新码 ${mapped + extraMapped}、无映射 ${unmappedDelete.length}）`);
  console.log(`PC 行: 创建 ${pcCreate} / 更新 ${pcUpdate} / 跳过(无变更) ${pcExist - pcUpdate} / 无映射删除 ${pcUnmapped} / 冲突 ${conflicts.length}`);

  if (D) {
    console.log("\n[简单映射抽查 15 条]（归一化名完全一致的 1:1 映射）:");
    const simple = audit.filter((a) => a.mappedTo && !oneToManyList.some((o) => o.code === a.code));
    simple.slice(0, 15).forEach((a) => console.log(`  ${a.code} ${a.name} -> ${a.mappedTo}`));
    console.log(`  ... 共 ${simple.length} 条`);
    if (extraMapped) {
      console.log("\n[审计采纳的高置信映射]");
      for (const [code, target] of Object.entries(EXTRA_MAPPINGS))
        if (oldToNew.get(code) === target) console.log(`  ${code} ${courses.find((c) => c.code === code)?.name} -> ${target}`);
    }
    console.log("\n[无映射删除课程前 20 门]（培养方案行随课程删除）:");
    unmappedAudit.slice(0, 20).forEach((a) => console.log(`  ${a.code} ${a.name} (${pcRowsByCourse.get(a.code) || 0} PC行)`));
    console.log(`  ... 共 ${unmappedAudit.length} 门`);
    console.log("\n[一对多选码 全部 " + oneToManyList.length + " 处]（选培养方案引用最多者；带轨道标记优先）:");
    oneToManyList.forEach((a) => console.log(`  ${a.code} ${a.name} -> ${oldToNew.get(a.code)}  (候选 ${a.cands.join(", ")})`));
    console.log(`\n[dry-run] 未落库`);
    await prisma.$disconnect();
    return;
  }

  // ── 落库（事务）────────────────────────────────────────────────────
  const res = await prisma.$transaction(async (tx) => {
    // 1) 删除删除集课程的全部 PC 行（含无映射与已映射老码行）
    await delByCodes(tx, pcRows.map((r) => r.courseCode), (slice) =>
      tx.programCourse.deleteMany({ where: { courseCode: { in: slice } } }),
    );
    // 2) 重建/更新合并后的 PC 行
    let created = 0, updated = 0;
    for (const p of mergePlan) {
      if (p.needUpdate) {
        await tx.programCourse.updateMany({
          where: { programVersionId: p.programVersionId, courseCode: p.target },
          data: { isCompulsory: p.isCompulsory, requirementGroupId: p.requirementGroupId },
        });
        updated++;
      } else if (p.needCreate) {
        await tx.programCourse.create({
          data: {
            programVersionId: p.programVersionId,
            courseCode: p.target,
            suggestedSemester: p.suggestedSemester,
            isCompulsory: p.isCompulsory,
            requirementGroupId: p.requirementGroupId,
          },
        });
        created++;
      }
    }
    // 3) 删除课程（分批）
    for (let i = 0; i < deleteCodes.length; i += CHUNK) {
      await tx.course.deleteMany({ where: { code: { in: deleteCodes.slice(i, i + CHUNK) } } });
    }
    return { created, updated };
  }, { timeout: 300000 });

  console.log(`\n[apply] 事务完成: PC 创建 ${res.created} / 更新 ${res.updated}`);
  const remain = await prisma.course.count();
  const remainOld = (await prisma.course.findMany({ select: { code: true } })).filter((c) => isOld(c.code)).length;
  console.log(`[apply] 课程总数: ${remain}（删除 ${deleteCodes.length} 门）| 剩余老代码课程: ${remainOld}`);
  const remainOldCodes = (await prisma.course.findMany({ select: { code: true } })).map((c) => c.code).filter(isOld);
  const remainTcOld = await prisma.teacherCourse.count({ where: { courseCode: { in: remainOldCodes } } });
  console.log(`[apply] 剩余老代码课程上的查老师数据: ${remainTcOld} 行（应等于删除前保留集 ${tcOldSet.size} 门课程的数据）`);
  if (conflicts.length) {
    console.log(`\n[apply] ⚠ 迁移中有 ${conflicts.length} 处必修/学期冲突按规则合并（必修取 OR），明细见上方 dry-run 输出或日志。`);
  }
  await prisma.$disconnect();
}

async function delByCodes(tx, codes, fn) {
  const uniq = [...new Set(codes)];
  for (let i = 0; i < uniq.length; i += CHUNK) await fn(uniq.slice(i, i + CHUNK));
}

main().catch((e) => { console.error(e); process.exit(1); });
