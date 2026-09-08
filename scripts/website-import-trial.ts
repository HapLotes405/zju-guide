// Read-only source extraction experiment. Does not create resources or use a DB.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  parseCourseLinks,
  matchCourses,
  WEBSITE_SOURCES,
  scanSource,
} from "../src/lib/website-sources";

async function main() {
  const live = process.argv.includes("--live");
  const courses = JSON.parse(await readFile("prisma/data/zju_courses.json", "utf8")) as {
    code: string;
    name: string;
  }[];
  const report = [];
  for (const source of WEBSITE_SOURCES) {
    const cap = source.id === "turing" ? 20 : 10;
    const fixtureName = source.id === "turing" ? "turing-home" : "bms-courses";
    const fixtureUrl = source.id === "turing" ? source.baseUrl : `${source.baseUrl}courses/`;
    const scan = live
      ? await scanSource(source.id)
      : {
          items: parseCourseLinks(
            await readFile(`tests/fixtures/website-import/${fixtureName}.html`, "utf8"),
            fixtureUrl,
            source.id,
          ),
          scanned: 1,
          errors: [],
        };
    const items = scan.items
      .slice(0, cap)
      .map((item) => ({ ...item, ...matchCourses(item.title, courses) }));
    report.push({
      source: source.name,
      mode: live ? "live" : "saved-public-html",
      scanned: scan.scanned,
      discovered: scan.items.length,
      selected: items.length,
      withExactSuggestion: items.filter((x) => x.courseCodes.length === 1).length,
      ambiguous: items.filter((x) => x.courseCodes.length > 1).length,
      unmatched: items.filter((x) => !x.courseCodes.length).length,
      errors: scan.errors,
      items,
    });
  }
  await mkdir("output/website-import", { recursive: true });
  const output = {
    recordedAt: new Date().toISOString(),
    mode: live ? "live" : "saved-public-html",
    note: "仅验证目录解析和建议；尚未代表链接可访问性、人工审核正确率或数据库投稿成功率。",
    sources: report,
  };
  await writeFile(
    `output/website-import/${live ? "live" : "fixture"}-trial.json`,
    JSON.stringify(output, null, 2),
  );
  console.log(
    JSON.stringify(
      report.map(({ items, ...counts }) => counts),
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
