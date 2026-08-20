#!/usr/bin/env node
/**
 * validate-program-json.mjs — 培养方案递归树 JSON 自检脚本（零依赖，只需 Node）
 *
 * 用法:   node validate-program-json.mjs <文件1.json> [文件2.json ...]
 * 退出码: 0 = 无 ERROR（WARNING 可忽略）；1 = 有 ERROR
 *
 * 给洗数据的同学用：LLM 产出标准 JSON 后，交付前跑一遍，PASS 再交。
 * 校验范围对应 src/lib/program-document.ts 的契约 + scripts/import-program-tree.ts 的必填要求。
 * 若改了契约，请同步本脚本。
 */

import * as fs from "node:fs";
import * as path from "node:path";

const SELECTIONS = new Set(["REQUIRED", "CHOOSE_ONE", "CHOOSE_N", "FLEXIBLE", "CREDIT_ONLY"]);
const HALVES = new Set(["FW", "SS", "SHORT"]);

function analyze(doc) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  // ── 顶层 ──
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return { errors: ["文件根节点不是 JSON 对象"], warnings: [] };
  }
  const pv = doc.programVersion;
  if (!pv || typeof pv !== "object" || Array.isArray(pv)) {
    err("缺少 programVersion 对象（必填：majorName / year / totalCredits）");
    return { errors, warnings };
  }
  if (!Array.isArray(doc.moduleGroups)) {
    err("moduleGroups 必须是数组（至少为 []）");
    return { errors, warnings };
  }
  if (typeof doc.formatVersion !== "string") warn('缺少 formatVersion（建议填 "1.0"）');
  if (!doc.source || typeof doc.source !== "object") warn("缺少 source 对象（建议记录来源文件名/提取时间）");

  // ── programVersion ──
  if (typeof pv.majorName !== "string" || pv.majorName.trim() === "") err("programVersion.majorName 缺失或为空");
  if (!Number.isInteger(pv.year) || pv.year < 1900) err(`programVersion.year 非法：${pv.year}`);
  if (typeof pv.totalCredits !== "number" || !(pv.totalCredits > 0)) err(`programVersion.totalCredits 非法：${pv.totalCredits}`);
  if (pv.extraCredits !== undefined && (typeof pv.extraCredits !== "number" || pv.extraCredits < 0)) warn(`extraCredits 非法：${pv.extraCredits}`);
  if (pv.totalCreditsText !== undefined && typeof pv.totalCreditsText !== "string") warn(`totalCreditsText 应为字符串：${pv.totalCreditsText}`);
  if (pv.durationYears !== undefined && (typeof pv.durationYears !== "number" || pv.durationYears < 1)) warn(`durationYears 非法：${pv.durationYears}`);
  for (const f of ["coreCourses", "corePractices", "englishCourses"]) {
    if (pv[f] !== undefined && !Array.isArray(pv[f])) warn(`${f} 应为字符串数组`);
  }

  // ── moduleGroups 递归 ──
  const walk = (gs, depth) => {
    if (depth > 12) {
      err("moduleGroups 递归超过 12 层，疑似循环引用");
      return;
    }
    const names = new Set();
    for (const g of gs) {
      if (typeof g !== "object" || g === null) {
        err("moduleGroups 内含非对象项");
        continue;
      }
      const label = `组「${g.name ?? "?"}」`;
      if (typeof g.name !== "string" || g.name.trim() === "") err("组缺少 name（非空字符串）");
      else {
        if (names.has(g.name)) warn(`同级存在重名组：「${g.name}」（前端渲染 key 可能冲突）`);
        names.add(g.name);
      }
      if (!SELECTIONS.has(g.selection)) err(`${label}selection 非法：${g.selection}（应为 ${[...SELECTIONS].join("/")}）`);
      if (g.requiredCredits !== null && g.requiredCredits !== undefined && (typeof g.requiredCredits !== "number" || g.requiredCredits < 0)) {
        err(`${label}requiredCredits 非法：${g.requiredCredits}`);
      }
      if (g.ruleText !== undefined && typeof g.ruleText !== "string") warn(`${label}ruleText 应为字符串`);

      // 课程
      if (g.courses !== undefined && !Array.isArray(g.courses)) {
        err(`${label}courses 应为数组`);
      } else if (Array.isArray(g.courses)) {
        const codes = new Set();
        for (const c of g.courses) {
          if (typeof c !== "object" || c === null) {
            err(`${label}courses 内含非对象`);
            continue;
          }
          const clabel = `课程 ${c.courseCode ?? "?"}`;
          if (typeof c.courseCode !== "string" || c.courseCode.trim() === "") err(`${label}存在缺 courseCode 的课程`);
          else {
            if (codes.has(c.courseCode)) err(`${label}内课程号重复：${c.courseCode}`);
            codes.add(c.courseCode);
          }
          if (typeof c.courseName !== "string" || c.courseName.trim() === "") err(`${clabel}缺 courseName`);
          if (typeof c.credits !== "number" || c.credits < 0) err(`${clabel}credits 非法：${c.credits}`);
          if (!Array.isArray(c.semesters)) {
            err(`${clabel}缺 semesters 数组（可为 [] 表示原文未标注学期）`);
          } else {
            for (const s of c.semesters) {
              if (typeof s !== "object" || s === null) {
                err(`${clabel}semesters 内含非对象`);
                continue;
              }
              if (!Number.isInteger(s.year) || s.year < 1) err(`${clabel}semester.year 非法：${s.year}`);
              else if (s.year > 10) warn(`${clabel}semester.year 超过 10：${s.year}（本科最多 8 年）`);
              if (!HALVES.has(s.half)) err(`${clabel}semester.half 非法：${s.half}（应为 FW/SS/SHORT）`);
              if (typeof s.rawLabel !== "string") warn(`${clabel}semester.rawLabel 建议保留原文（如 "二(秋)"）`);
            }
          }
          if (c.marks !== undefined && (!Array.isArray(c.marks) || c.marks.some((mk) => typeof mk !== "string"))) {
            warn(`${clabel}marks 应为字符串数组（如 ["*"]）`);
          }
        }
      }

      // 子组
      if (g.children !== undefined) {
        if (!Array.isArray(g.children)) err(`${label}children 应为数组`);
        else walk(g.children, depth + 1);
      }
    }
  };
  walk(doc.moduleGroups, 0);

  // ── minorPrograms ──
  if (doc.minorPrograms !== undefined) {
    if (!Array.isArray(doc.minorPrograms)) err("minorPrograms 应为数组");
    else {
      for (const m of doc.minorPrograms) {
        if (typeof m !== "object" || m === null || typeof m.name !== "string" || m.name === "") {
          err("minorPrograms 内有缺 name 的项");
          continue;
        }
        if (m.requiredCredits !== null && m.requiredCredits !== undefined && (typeof m.requiredCredits !== "number" || m.requiredCredits < 0)) {
          err(`辅修「${m.name}」requiredCredits 非法：${m.requiredCredits}`);
        }
        if (m.courses !== undefined && !Array.isArray(m.courses)) err(`辅修「${m.name}」courses 应为数组`);
      }
    }
  }

  // ── guidanceByYear ──
  if (doc.guidanceByYear !== undefined) {
    if (!Array.isArray(doc.guidanceByYear)) err("guidanceByYear 应为数组");
    else {
      for (const y of doc.guidanceByYear) {
        if (typeof y !== "object" || y === null) {
          err("guidanceByYear 内有非对象项");
          continue;
        }
        if (!Number.isInteger(y.year) || y.year < 1) warn(`guidanceByYear.year 非法：${y.year}`);
        if (!Array.isArray(y.activities)) err(`guidanceByYear ${y.year ?? "?"} 缺 activities 数组`);
        else {
          for (const a of y.activities) {
            if (typeof a !== "object" || a === null) {
              err("activities 内有非对象项");
              continue;
            }
            if (typeof a.kind !== "string" || a.kind === "") err('activity.kind 缺失（如 "二课堂"）');
            if (!Array.isArray(a.items)) err(`activity「${a.kind ?? "?"}」缺 items 数组`);
            else {
              for (const it of a.items) {
                if (typeof it !== "object" || it === null) {
                  err("items 内有非对象项");
                  continue;
                }
                if (it.seq !== undefined && typeof it.seq !== "number") warn(`activity「${a.kind ?? "?"}」item.seq 应为数字`);
                if (typeof it.name !== "string" || it.name === "") err(`activity「${a.kind ?? "?"}」item.name 缺失`);
                for (const f of ["points", "termMarks", "remark"]) {
                  if (it[f] !== undefined && typeof it[f] !== "string") warn(`item「${it.name ?? "?"}」${f} 应为字符串`);
                }
              }
            }
          }
        }
      }
    }
  }

  // ── 学分对账（提示级）──
  const groupTarget = (g) => {
    const own = (g.courses ?? []).reduce((s, c) => s + (c.credits ?? 0), 0);
    const children = (g.children ?? []).reduce((s, c) => s + groupTarget(c), 0);
    return g.requiredCredits != null ? g.requiredCredits : own + children;
  };
  const treeTotal = (doc.moduleGroups ?? []).reduce((s, g) => s + groupTarget(g), 0);
  const officialTotal = (pv.totalCredits ?? 0) + (pv.extraCredits ?? 0);
  const diff = Math.abs(treeTotal - officialTotal);
  if (diff > 15) {
    warn(`顶层组目标合计 ${treeTotal.toFixed(1)} 与 totalCredits+extraCredits（${officialTotal.toFixed(1)}）差距 ${diff.toFixed(1)}，请核对（"其他必修环节/认定型"学分可解释部分差距）`);
  }
  if (typeof pv.totalCreditsText === "string" && pv.totalCreditsText !== "" && !String(pv.totalCreditsText).includes(String(pv.totalCredits))) {
    warn(`totalCreditsText("${pv.totalCreditsText}") 与 totalCredits(${pv.totalCredits}) 不一致`);
  }

  return { errors, warnings };
}

// ── 逐个文件 ──
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("用法: node validate-program-json.mjs <文件1.json> [文件2.json ...]");
  process.exit(1);
}

let anyError = false;
for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    console.log(`❌ FAIL  ${file}`);
    console.log(`     JSON 解析失败：${e.message}`);
    anyError = true;
    continue;
  }

  const { errors, warnings } = analyze(doc);

  // 文件名与内容一致性（提示级）
  const base = path.basename(file);
  const m = base.match(/^(\d{4})级(.+)\.json$/);
  if (m) {
    if (Number(m[1]) !== doc?.programVersion?.year) {
      warnings.push(`文件名年级(${m[1]}) 与 programVersion.year(${doc?.programVersion?.year}) 不一致`);
    }
  } else {
    warnings.push(`文件名不规范，建议命名为 {year}级{专业}.json，如 2025级化学工程与工艺.json`);
  }

  const pass = errors.length === 0;
  if (!pass) anyError = true;
  console.log(pass ? `✅ PASS  ${file}` : `❌ FAIL  ${file}`);
  for (const w of warnings) console.log(`   ⚠️ WARN  ${w}`);
  for (const e of errors) console.log(`   ❌ ERROR  ${e}`);
  if (pass && warnings.length > 0) console.log(`   （${warnings.length} 条提示，可忽略）`);
  console.log("");
}

process.exit(anyError ? 1 : 0);
