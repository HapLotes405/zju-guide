// 求是学径 — Sprint 2: UI 开发 + 审核系统
// 前端页面 + 投稿审核闭环

export const meta = {
  name: 'sprint-2-ui-review',
  description: 'Sprint 2：课程详情页、投稿页、审核后台、四类路径前端',
  phases: [
    { title: '首页路径', detail: '四类路径前端组件 + 仪表盘' },
    { title: '课程详情', detail: '课程详情页 + 资源展示' },
    { title: '投稿审核', detail: '投稿页面 + 审核后台' },
    { title: '前后端联调', detail: '替换mock → 真实API → 状态齐全' },
  ],
};

// Sprint 2 策略：
// - 角色1（前端）实现首页四类路径卡片
// - 角色2（UI）实现课程详情 + 资源区 + 投稿 + 审核
// - 角色3（后端）补充资源/审核/搜索 API
// - 全部完成后联调

phase('首页路径');

// 角色1：仪表盘 + 四类路径
await agent(
  `你是角色1（前端架构）。实现首页仪表盘 src/app/(dashboard)/page.tsx：

  认证保护：未登录重定向到 /login
  四类路径卡片（调用 Sprint 1 的 API）：

  1. RequiredCourses 组件 —
     调用 GET /api/me/path/required，展示本学期必修课列表
     每门课显示：课号、名称、学分、学期、先修课提示
     点击跳转到 /course/[code]

  2. GenEdProgress 组件 —
     调用 GET /api/me/path/gen-ed，展示各要求组的进度条

  3. OverdueWarning 组件 —
     调用 GET /api/me/path/overdue，高亮逾期未修的课程
     黄色/红色警告样式

  4. MinorProgress 组件 —
     调用 GET /api/me/path/minor，展示辅修完成度

  所有组件覆盖 4 种状态：loading skeleton / empty / error toast / 正常数据
  参考 docs/SPECIFICATION.md 第四节和设计令牌`,
  { label: 'dashboard-path', phase: '首页路径', model: 'sonnet' }
);

phase('课程详情');

// 角色2：课程详情页
await agent(
  `你是角色2（UI/UX）。实现课程详情页 src/app/(dashboard)/course/[code]/page.tsx：

  8个区块（可用 Accordion 折叠）：
  1. 课程身份 — 课号/名称/学分/模块/学期
  2. 为什么学 — 前置课/后续课/常见误区
  3. 课前预习 — 预习知识点/推荐资料
  4. 课中跟课 — 周节奏/作业占比/签到方式
  5. 期末复习 — 复习路线/真题线索
  6. 老师评价 — 教学风格/给分/作业量 卡片
  7. 资源区 — 按类型分类、CC98跳转、审核状态badge
  8. 图谱区 — 简单树形列表展示课程依赖

  资源区组件 ResourceList：
  - 按 ResourceType 分组（ EBOOK | LECTURE_NOTE | EXAM_RECALL | BLOG | CC98_POST | TOOL_TEMPLATE ）
  - 每个资源显示：标题、来源链接、类型icon、版权标签、审核状态
  - CC98 帖子显示为跳转按钮，点击打开新标签页

  所有状态齐全（loading/empty/error/success）`,
  { label: 'course-detail', phase: '课程详情', model: 'sonnet' }
);

phase('投稿审核');

// 角色2 + 角色3 并行：前端页面 + 后端 API
await parallel([
  () => agent(
    `你是角色2。实现：
    1. 投稿页 src/app/(dashboard)/contribute/page.tsx
       - 选择资源类型（下拉框）
       - 填写标题、链接、摘要
       - 关联课程（搜索+多选）
       - 版权声明勾选
       - 提交后 toast 提示 + 跳转

    2. 审核后台 src/app/admin/review/page.tsx
       - 待审列表（表格：标题/类型/提交者/时间/操作）
       - 通过/驳回按钮
       - 驳回时弹出理由输入框
       - 已审核项折叠在下方

    所有表单用 react-hook-form + zod 校验`,
    { label: 'contribute-review-ui', phase: '投稿审核', model: 'sonnet' }
  ),
  () => agent(
    `你是角色3。实现资源 & 审核 API：
    POST   /api/resources              — 提交资源（contributor+）
    POST   /api/resources/[id]/submit  — 提交审核
    GET    /api/admin/review-queue     — 待审列表（admin）
    POST   /api/admin/review-queue/[id] — 审核操作 {result, reason}
    GET    /api/search?q=xxx           — 跨课程搜索

    审核流程保证：提交后状态为 PENDING → 管理员审核 → APPROVED 才公开`,
    { label: 'review-api', phase: '投稿审核', model: 'opus' }
  ),
]);

phase('前后端联调');

// 联调验证
await agent(
  `联调验证：
  1. 登录 → 首页看到四类路径（如果没导入数据，显示 empty state）
  2. 上传 fixtures/valid-import.json → 路径刷新
  3. 点击课程 → 进入详情页 → 资源区（可能为空）
  4. 投稿一个资源 → 审核后台可见待审项 → 审核通过 → 课程页可见
  5. 未登录访问 /admin/review → 跳转登录
  6. visitor 访问 admin API → 返回 403

  报告联调结果，列出所有不通过的项`,
  { label: 'integration-test', phase: '前后端联调', model: 'sonnet' }
);

log('Sprint 2 完成 — 前端页面、投稿审核、前后端联调通过');
