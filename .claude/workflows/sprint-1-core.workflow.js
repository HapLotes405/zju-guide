// 求是学径 — Sprint 1: 核心功能
// 认证 + JSON导入 + 四类路径 + 课程API

export const meta = {
  name: 'sprint-1-core',
  description: 'Sprint 1：认证系统、JSON导入、四类路径引擎、课程API',
  phases: [
    { title: '认证系统', detail: '注册/登录/JWT/RBAC' },
    { title: '课程数据', detail: '课程CRUD API + Seed验证' },
    { title: '路径引擎', detail: '四类路径计算 + API' },
    { title: '导入适配', detail: 'JSON 适配器 + 导入API' },
  ],
};

// Sprint 1 并行策略：
// - 角色3（后端）最先行动：认证 → 课程API → 路径API
// - 角色4（数据库）验证和补充seed数据
// - 角色5（DevOps）完善 JSON 适配器和 fixture
// - 角色1（前端）等API有雏形后开始对接

phase('认证系统');

// 角色3：认证是最先需要的基础设施
await agent(
  `你是角色3（后端负责人）。实现认证系统：

  1. 创建 src/lib/auth.ts：
     - signToken(payload, secret, expiresIn) / verifyToken(token, secret)
     - hashPassword(password) / comparePassword(password, hash)
     - requireAuth(request): 从 Authorization header 提取并验证 JWT
     - requireRole(request, role): 验证用户角色
  2. 创建 src/lib/prisma.ts：PrismaClient 单例
  3. 实现以下 API Routes：
     POST /api/auth/register  — body: {username, password} → 返回 {userId}
     POST /api/auth/login     — body: {username, password} → 返回 {accessToken, refreshToken}
     POST /api/auth/refresh   — body: {refreshToken} → 返回新 {accessToken, refreshToken}
     GET  /api/auth/me        — 返回当前用户信息
  4. 参考 docs/SPECIFICATION.md 第六节的 API 规范

  RBAC: visitor / contributor / admin 三种角色`,
  { label: 'auth-system', phase: '认证系统', model: 'opus' }
);

phase('课程数据');

// 角色3 + 角色4 并行：课程API + seed数据补充
await parallel([
  () => agent(
    `你是角色3。实现课程API：
    GET  /api/courses           — 列表，支持 ?major=&semester= 筛选
    GET  /api/courses/[code]    — 详情，含先修课和后续课
    参考 docs/SPECIFICATION.md》，所有响应用 {data: T} 格式`,
    { label: 'course-api', phase: '课程数据', model: 'opus' }
  ),
  () => agent(
    `你是角色4。验证和增强 seed 数据：
    1. 确认 20 门核心课程都已在数据库中
    2. 为每门课添加课程依赖关系（先修/并修），
       参考 src/App.jsx 中每个 course 的 prereqs/dependents 字段
    3. 创建 program_versions 记录："材料科学与工程 2025级"
    4. 创建 requirement_groups（通识/专业基础/专业核心/专业模块/个性修读）
    5. 关联课程到培养方案（program_courses）
    运行 npx prisma db seed 验证`,
    { label: 'enrich-seed', phase: '课程数据', model: 'sonnet' }
  ),
]);

phase('路径引擎');

// 角色3：路径引擎是平台核心算法
await agent(
  `你是角色3。实现四类路径引擎。

  1. 创建 src/lib/path-engine.ts，实现以下函数：

  // 输入：userId + 当前学期
  // 输出：带 reasonCode 的四类结果
  async function calculatePath(userId: string, currentSemester: number) {
    return {
      required: [...],    // 本学期必修
      genEd: {...},        // 通识要求进度
      overdue: [...],      // 逾期未修
      minor: {...},        // 辅修要求
    }
  }

  2. 每条结果附带：
     - programVersion: 培养方案版本
     - ruleSource: 规则来源
     - reasonCode: 判定原因

  3. 实现 API Routes：
     GET /api/me/path/required
     GET /api/me/path/gen-ed
     GET /api/me/path/overdue
     GET /api/me/path/minor

  4. 写单元测试：tests/unit/path-engine.test.ts — 用固定数据验证计算结果`,
  { label: 'path-engine', phase: '路径引擎', model: 'opus' }
);

phase('导入适配');

// 角色5 + 角色3 并行：适配器 + 导入API
await parallel([
  () => agent(
    `你是角色5。实现 JSON 适配器 src/lib/json-adapter.ts：

    功能：
    1. 支持多种教务JSON格式 → 标准化字段映射
    2. 脱敏处理：移除学号、姓名、具体分数
    3. Zod schema 校验
    4. 导出 normalize(rawJson): NormalizedRecord[] 函数

    创建 fixtures/ 目录下的测试数据：
    - valid-import.json（正常数据）
    - missing-fields.json（缺字段）
    - old-schema.json（旧格式）

    这些 fixture 不包含真实数据，使用脱敏样例`,
    { label: 'json-adapter', phase: '导入适配', model: 'sonnet' }
  ),
  () => agent(
    `你是角色3。实现导入API：
    POST /api/me/imports  — 接收 JSON，调用适配器，保存到 source_imports + course_records
    GET  /api/me/imports  — 获取导入历史

    要求：
    - 幂等：同一份 JSON 导入两次不产生重复数据
    - 校验：用 zod schema 校验，非法数据返回 400
    - 差异：如果已有记录，返回新增/变更的 diff`,
    { label: 'import-api', phase: '导入适配', model: 'opus' }
  ),
]);

log('Sprint 1 完成 — 认证、课程、路径引擎、JSON导入全部就绪');
