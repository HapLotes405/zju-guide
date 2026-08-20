// 导入 LLM 洗出来的递归树培养方案 JSON → ProgramVersion.programJson
// 用法:
//   npx tsx scripts/import-program-tree.ts program-data/2025级化学工程与工艺.json
//   npx tsx scripts/import-program-tree.ts program-data/          (目录下全部)
//
// 与 scripts/import-programs.ts（旧扁平格式）不同：
// 本脚本保留完整递归树，原样存入 programJson，不降维写 RequirementGroup/ProgramCourse。
// 批量洗 139 份时逐个文件跑即可。

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface ProgramDocument {
  formatVersion?: string;
  programVersion: {
    majorName: string;
    year: number;
    totalCredits?: number;
    [k: string]: unknown;
  };
  moduleGroups?: unknown[];
}

function assertDocument(raw: unknown, filePath: string): ProgramDocument {
  const doc = raw as ProgramDocument;
  if (!doc || typeof doc !== "object") throw new Error("不是对象");
  const pv = doc.programVersion;
  if (!pv || typeof pv.majorName !== "string" || pv.majorName.length === 0) {
    throw new Error("缺少 programVersion.majorName");
  }
  if (!Number.isInteger(pv.year) || pv.year < 1900) {
    throw new Error("缺少合法 programVersion.year");
  }
  if (!Array.isArray(doc.moduleGroups)) {
    throw new Error("缺少 moduleGroups 数组");
  }
  void filePath;
  return doc;
}

async function importFile(filePath: string): Promise<string> {
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const doc = assertDocument(raw, filePath);
  const { majorName, year } = doc.programVersion;
  const totalCredits = doc.programVersion.totalCredits ?? 0;

  await prisma.programVersion.upsert({
    where: { majorName_year: { majorName, year } },
    create: {
      majorName,
      year,
      totalCredits,
      isActive: true,
      publishedAt: new Date(),
      programJson: doc as object,
    },
    update: {
      totalCredits,
      isActive: true,
      programJson: doc as object,
    },
  });

  return `${majorName} (${year}级) · ${doc.moduleGroups?.length ?? 0} 个顶层组`;
}

async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error("用法: npx tsx scripts/import-program-tree.ts <file|dir> ...");
    process.exit(1);
  }

  const files = targets.flatMap((t) => {
    const stat = fs.statSync(t);
    if (stat.isDirectory()) {
      return fs
        .readdirSync(t)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(t, f));
    }
    return [t];
  });

  console.log(`导入 ${files.length} 个文件...`);
  let ok = 0;
  for (const file of files) {
    try {
      const result = await importFile(file);
      ok++;
      console.log(`  [OK] ${path.basename(file)} → ${result}`);
    } catch (e) {
      console.error(`  [FAIL] ${path.basename(file)}: ${(e as Error).message}`);
    }
  }
  console.log(`\n完成：成功 ${ok}/${files.length}`);
  await prisma.$disconnect();
}

main();
