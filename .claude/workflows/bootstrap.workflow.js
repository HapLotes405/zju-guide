// 求是学径 — Phase 0: 项目启动工作流
// 初始化项目：依赖安装 → Prisma 迁移 → 首次验证

export const meta = {
  name: 'bootstrap-zju-wiki',
  description: '初始化项目：安装依赖、Prisma迁移、Seed数据、首次build验证',
  phases: [
    { title: '环境与依赖', detail: '检查 Node/pnpm，安装所有依赖包' },
    { title: '数据库', detail: 'Prisma Schema 迁移 + 20门核心课程 Seed' },
    { title: '验证', detail: 'lint → typecheck → build 全通过' },
  ],
};

phase('环境与依赖');

// Step 1: 检查环境 + 安装依赖（并行可独立的部分）
await parallel([
  () => agent(
    '检查 Node.js >= 22、pnpm >= 9、Docker 是否可用。列出版本号。',
    { label: 'env-check', phase: '环境与依赖' }
  ),
  () => agent(
    `检查 package.json 的 scripts 字段。补充缺失的关键脚本：
    "typecheck": "tsc --noEmit"
    "test": "vitest run"
    "db:migrate": "prisma migrate dev"
    "db:seed": "prisma db seed"
    "db:studio": "prisma studio"
    然后运行 pnpm install`,
    { label: 'install-deps', phase: '环境与依赖' }
  ),
]);

phase('数据库');

// Step 2: 数据库迁移 + seed（角色4负责）
await agent(
  `你是角色4（数据库负责人）。Schema 在 prisma/schema.prisma 中。

  1. 如果 .env 不存在或 DATABASE_URL 未设置，开发用SQLite: "file:./dev.db"
  2. npx prisma migrate dev --name init
  3. npx prisma generate
  4. 编写 prisma/seed.ts 插入 20 门材料专业核心课程（参考 src/App.jsx INITIAL_COURSES）
     + 1个admin用户 + 1个测试用户
     seed 必须幂等（用 upsert）
  5. 运行 npx prisma db seed 验证`,
  { label: 'db-init', phase: '数据库', model: 'sonnet' }
);

phase('验证');

// Step 3: 全链路验证
await agent(
  `验证：
  1. src/lib/prisma.ts 导出 PrismaClient 单例
  2. src/app/page.tsx 存在且能渲染（如果没有就创建简单骨架）
  3. pnpm lint 通过
  4. pnpm build 通过
  5. 输出验证报告 ✅/❌`,
  { label: 'verify', phase: '验证', model: 'sonnet' }
);

log('Phase 0 完成。自动启动 Sprint 1...');
await workflow('sprint-1-core');
