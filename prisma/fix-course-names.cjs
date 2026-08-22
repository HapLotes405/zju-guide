// =============================================================================
// fix-course-names.cjs — 用队友提供的课程名映射表修补缺失（占位符）课程名
//
// 数据来源：course_name_fixes(1).txt（676 行 code=name，与库内 676 个占位课程一一对应）
// 背景：来源文档带水印，抽取时把 "浙/江/大/学/U/Z/I/H…" 等字符零散插进了课程名，
//       本脚本先做逐条人工核对的显式清洗（含 3 轮对抗性审查补充），再落库。
//       另修复 1 处源文档错别字（异性催化→异相催化）与 1 处截断名（创业实践：从0到1，
//       由库中同课 MGMT0701G 印证）。
//
// 安全约束（与 sync-courses.cjs 一致）：
//   * 只补写「占位符/空名」课程，真实课程名绝不覆盖
//   * 无法可靠恢复的课程名保持占位符，宁缺毋滥
//
// 用法：
//   node prisma/fix-course-names.cjs --dry-run   # 只输出将做的修改，不落库
//   node prisma/fix-course-names.cjs --apply     # 落库
// =============================================================================
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const PLACEHOLDER_PREFIX = "(课程名待补充:";
const isRealName = (n) => !!n && !!String(n).trim() && !String(n).trim().startsWith(PLACEHOLDER_PREFIX);
// 清洗：去首尾空白 + 压缩内部空白 + 移除 *△ 等批注符号（不含 #：C# 合法）
const clean = (n) => String(n || "").replace(/[*△▲◇☆★○●◎□■✦✧◆]/g, "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// 显式清洗表：code → 去水印后的真实课程名
// 每个条目都经过人工逐条核对（对照“合法英文/合法浙大/合法大数据”等例外）。
// ---------------------------------------------------------------------------
const CORRECTIONS = {
  "01121220T": "行为金融",
  "01121260": "本土化与现代经济学",
  "02192300": "房地产法",
  "03121691": "运动心理学",
  "031A0100": "习近平总书记关于教育的重要论述",
  "04122701": "中国画基础技法Ⅰ",
  "04124900": "西方哲学史II：西方近代哲学",
  "04128200": "展示策划与设计",
  "04128280": "中国历史地理概述",
  "04196091": "中西关系史", // ⚠️ 推测（原文“中西关学系史”去水印“学”），待核实
  "04196191": "英国史",
  "04196440": "中国近代学术思想史",
  "04198380": "印度宗教哲学",
  "04198490": "中古汉译文献导读",
  "05122551": "基础日语Ⅳ",
  "05127630": "法语国家与地区研究",
  "05128230": "文学理论与批评",
  "05128260": "日语会话III",
  "05128270": "日语基础写作Ⅰ",
  "05191470T": "计算机辅助翻译",
  "05195210T": "法语阅读与写作",
  "05197840": "莎士比亚戏剧",
  "05197980": "口译与心理",
  "05198260": "文学跨学科研究与文学经典阅读",
  "05198620": "综合俄语II",
  "05198720": "英语综合能力提升I",
  "06120120T": "抽象代数",
  "06121480": "统计气象学",
  "06199101": "认知工效学",
  "07120880": "代谢生态学及实验",
  "081C0100": "工程流体力学（甲）Ⅰ",
  "09120100": "高分子合成工艺",
  "09120980": "弹性力学基础",
  "09193370": "有限单元法及其工程应用",
  "10120072": "控制理论（乙）",
  "10188310": "智能控制系统设计与实践",
  "12121830": "城市规划社会调查专题研究",
  "12122890": "建筑营造基础Ⅰ",
  "12122920": "国土空间规划理论与方法",
  "12188060": "传统建筑测绘",
  "12196010": "专题美术Ⅱ",
  "14188221": "认识实习",
  "14195590": "环境工程制图",
  "15120461": "生物医学信号处理",
  "16120771": "园林设计初步",
  "16121011": "生物仪器分析",
  "16121770": "植物基因组学",
  "16195540": "环境生物学",
  "16196040": "园林计算机辅助设计",
  "17120170": "动物育种学",
  "17121310": "动物生理学Ⅰ",
  "17188231": "动物医学科研训练",
  "17188240": "动物疫病防控技能综合实践",
  "17188260": "兽医临床诊断综合实践",
  "18120251": "口腔解剖生理学",
  "18120700": "医学统计学",
  "18122820": "遗传与发育Ⅱ",
  "18180010": "风湿免疫科实习",
  "18181313": "口腔修复科临床实习",
  "18188480": "外科实习",
  "18190042": "肿瘤外科实习",
  "18190130": "肛肠外科实习",
  "18198170T": "医学细胞生物学",
  "19120830": "药物仪器分析",
  "20122860": "农业概论",
  "20125090": "金融创新与金融科技",
  "20188080": "会计实践前沿与专业实训",
  "20188110": "专业认知与见习",
  "20188120": "会计专业实践与劳动",
  "21121700": "人工智能基础",
  "24120952": "信息检索",
  "24121710I": "国际组织",
  "24122521": "大数据分析",
  "24122690": "数字素养",
  "24122700": "农产品市场与价格分析",
  "24195560": "实用统计软件与定量分析",
  "24196050": "公共财政和预算",
  "25120250": "广告摄影",
  "25121270": "影视摄像与后期制作",
  "25190530": "科幻电影研究",
  "26120233": "自动控制原理",
  "361P0010": "大学生KAB创业基础",
  "481E0060T": "体育Ⅳ",
  "55120110": "中国传统文化",
  "56120220": "现代建筑历史与理论",
  "56190030": "动物考古",
  "59120160": "制冷低温与空调原理及实践",
  "63120010": "薄膜材料技术与物理",
  "65190060": "生物医用高分子",
  "65190070": "光电功能高分子",
  "66190200": "激光技术及应用",
  "67188140": "智能移动系统设计实验",
  "67190190": "固体物理基础",
  "74120650": "海洋灾害监测与预警",
  "79120010": "实验设计与心理统计I",
  "80120090": "材料性能（Ⅱ）",
  "80190070": "生物材料基础",
  "82120070": "数据科学的数学基础",
  "82190050": "李群与李代数",
  "821T0180": "微积分（乙）Ⅱ",
  "83120460": "现代测量学",
  "83188040": "地质认识实习",
  "83188110": "地质填图实习",
  "83188160": "地学综合实习",
  "84120150": "量子精密测量及传感技术",
  "84190100": "光网络技术",
  "85190090": "面向ICCAD的软件基础技术",
  "85190160": "模拟信号处理系统设计",
  "86190120": "机器人智能感知与分析",
  "U71P0010": "创业基础",
  // —— 第二轮对抗性审查补充：字水印残留（"学"插入复合词）——
  "05191590": "英美戏剧",
  "061Q0010": "电磁学",
  "16122010": "植物保护学Ⅱ（园艺）",
  "20123190": "农村社会学",
  "24122510": "信息资源管理经典文献选读",
  "361P0040": "职业生涯规划",
  "55120050": "社会研究方法理论与实践",
  "63120020": "太阳电池材料",
  "77120020": "基础化学实验Ⅰ",
  "81190050": "界面和胶体科学导论",
  // —— 源文档错别字（非水印，异相催化为规范术语）——
  "59120230": "异相催化与可持续发展",
  // —— 截断名恢复：库中已有同课 MGMT0701G「创业实践：从0到1」（学分/分类一致）印证 ——
  "201P0010": "创业实践：从0到1",
};

// 无法可靠恢复的名字：保持占位符，等待人工确认
const UNCERTAIN = {
  "70120220": "UO",                // 整名被水印破坏，仅剩碎片（疑临床轮转科目，待人工外查）
  "72120110": "B学",               // 整名被水印破坏，仅剩碎片（疑基础医学课程，待人工外查）
};

const D = "--dry-run" === process.argv[2] || "--dry-run" === process.argv[3];

async function main() {
  // ---- 1. 解析队友文件（一次性脚本：文件路径由环境变量 COURSE_FIX_FILE 指定，不写死个人路径） ----
  const srcPath = process.env.COURSE_FIX_FILE;
  if (!srcPath) throw new Error("需要设置 COURSE_FIX_FILE 环境变量，指向队友的课程名修复文件");
  const lines = fs.readFileSync(srcPath, "utf-8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const raw = new Map(); // code -> rawName
  for (const l of lines) {
    const eq = l.indexOf("=");
    if (eq < 0) { console.warn("skip no-eq line:", l); continue; }
    raw.set(l.slice(0, eq).trim(), l.slice(eq + 1).trim());
  }
  if (raw.size !== 676) throw new Error("unexpected file size: " + raw.size);

  // ---- 2. 校验 correction/uncertain 的 code 都在文件里 ----
  for (const code of Object.keys({ ...CORRECTIONS, ...UNCERTAIN })) {
    if (!raw.has(code)) throw new Error("code not in file: " + code);
  }

  // ---- 3. 构造 code -> 目标名（清洗后） ----
  const target = new Map();
  for (const [code, rawName] of raw) {
    let name;
    if (code in UNCERTAIN) {
      name = `${PLACEHOLDER_PREFIX}${code})`; // 保持占位符
    } else if (code in CORRECTIONS) {
      name = clean(CORRECTIONS[code]);
    } else {
      name = clean(rawName);
    }
    if (!name) throw new Error("cleaned name empty for " + code);
    target.set(code, name);
  }

  // ---- 4. 查库，构造修改清单（只改占位符课程，真实名不碰） ----
  const ph = await prisma.course.findMany({
    where: { name: { startsWith: PLACEHOLDER_PREFIX } },
    select: { code: true, name: true },
  });
  const phMap = new Map(ph.map((p) => [p.code, p.name]));

  const changes = [];
  const noFile = [];
  for (const c of ph) {
    const t = target.get(c.code);
    if (t === undefined) { noFile.push(c.code); continue; }
    if (t !== c.name) changes.push({ code: c.code, old: c.name, new: t });
  }
  const fileNotPlaceholder = [...target.keys()].filter((code) => !phMap.has(code));

  console.log("file entries:", raw.size);
  console.log("DB placeholder courses:", ph.length);
  console.log("placeholders not covered by file:", noFile.length, noFile.slice(0, 10));
  console.log("file codes not in placeholder set:", fileNotPlaceholder.length, fileNotPlaceholder.slice(0, 10));
  console.log("corrections applied:", Object.keys(CORRECTIONS).length);
  console.log("uncertain kept as placeholder:", Object.keys(UNCERTAIN).length);
  console.log("courses to UPDATE:", changes.length);

  // ---- 5. dry-run：输出改动清单（含全部 correction 逐条） ----
  const corrected = changes.filter((c) => c.code in CORRECTIONS);
  const sanitized = changes.filter((c) => !(c.code in CORRECTIONS));
  console.log("\n== corrections (去水印，逐条) ==");
  for (const c of corrected) console.log(`${c.code}: ${c.old}  ->  ${c.new}`);
  console.log("\n== sanitize-only (" + sanitized.length + ") 前 10 条 ==");
  for (const c of sanitized.slice(0, 10)) console.log(`${c.code}: ${c.old}  ->  ${c.new}`);
  console.log("sanitize-only 中还有变化的样例数:", sanitized.length);
  if (sanitized.length) {
    const stillDiff = sanitized.filter((c) => c.new !== clean(c.old));
    console.log("（含批注符号被剥离的:", stillDiff.length, "）");
  }

  if (D) { console.log("\n[dry-run] 未落库"); await prisma.$disconnect(); return; }

  // ---- 6. 落库 ----
  const tx = await prisma.$transaction(async (p) => {
    let n = 0;
    for (const c of changes) {
      const cur = await p.course.findUnique({ where: { code: c.code }, select: { name: true } });
      if (!cur || !isRealName(cur.name)) { // 双保险：仅覆盖非真实名
        await p.course.update({ where: { code: c.code }, data: { name: c.new } });
        n++;
      }
    }
    return n;
  });
  console.log("\n[apply] 已更新课程数:", tx);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
