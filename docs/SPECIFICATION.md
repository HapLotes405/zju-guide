# 求是学径 — 项目开发规范 v1.0

> 本文档是项目的唯一真相源（Single Source of Truth）。所有 agent 和开发者必须遵循本规范。
> 任何规范的修改必须先更新本文档，再执行代码变更。

---

## 一、技术栈

| 层级 | 技术 | 版本要求 |
|------|------|---------|
| 全栈框架 | Next.js (App Router) | ≥15.x |
| 语言 | TypeScript (strict mode) | ≥5.x |
| 样式 | Tailwind CSS | v4.x |
| 组件库 | shadcn/ui (Radix primitives) | latest |
| 图标 | lucide-react | latest |
| 数据库 ORM | Prisma | ≥6.x |
| 数据库 | PostgreSQL (生产) / SQLite (开发) | PG≥16, SQLite≥3 |
| 认证 | jose (JWT) | latest |
| 数据获取 | TanStack Query (React Query) | ≥5.x |
| 表单 | react-hook-form + zod | latest |
| 测试 | Vitest + Playwright | latest |
| 容器化 | Docker + Docker Compose | latest |
| CI/CD | GitHub Actions | — |
| 包管理 | pnpm | ≥9.x |

### 不使用的技术
- ❌ NestJS（学习门槛过高，Next.js API Routes 已足够）
- ❌ NextAuth.js（引入不必要的复杂性，自建JWT更可控）
- ❌ Redux/Zustand（MVP阶段 React Context + TanStack Query 够用）
- ❌ D3/visx（图谱用简单的SVG/列表展示）

---

## 二、目录结构

```
mse-wiki/
├── .claude/                    # Agent & Skill 配置
│   ├── agents/                 # 角色 Agent 定义
│   │   ├── role-1-frontend.md
│   │   ├── role-2-ui-ux.md
│   │   ├── role-3-backend.md
│   │   ├── role-4-database.md
│   │   └── role-5-devops.md
│   ├── skills/                 # 项目专用技能
│   └── workflows/              # Orca 工作流脚本
│
├── prisma/
│   ├── schema.prisma           # 数据库 Schema（唯一真相源）
│   ├── migrations/             # 迁移文件（自动生成，不可手动改）
│   └── seed.ts                 # 种子数据
│
├── src/
│   ├── app/                    # Next.js App Router（页面+API路由）
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx            # 首页 /
│   │   ├── (auth)/             # 认证相关页面
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/        # 登录后页面
│   │   │   ├── layout.tsx      # 仪表盘布局（含导航）
│   │   │   ├── page.tsx        # 首页仪表盘（四类路径组件）
│   │   │   ├── import/page.tsx # JSON 导入 + 专业确认
│   │   │   ├── major/
│   │   │   │   └── [id]/page.tsx  # 专业主页
│   │   │   ├── course/
│   │   │   │   └── [code]/page.tsx # 课程详情页
│   │   │   ├── search/page.tsx    # 资料搜索页
│   │   │   └── contribute/page.tsx # 投稿页
│   │   ├── admin/              # 管理后台
│   │   │   ├── layout.tsx
│   │   │   ├── review/page.tsx    # 审核后台
│   │   │   └── import/page.tsx    # 培养方案导入后台
│   │   └── api/                # API Routes
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   └── register/route.ts
│   │       ├── me/
│   │       │   ├── programs/route.ts
│   │       │   └── imports/route.ts
│   │       ├── majors/
│   │       │   └── [id]/route.ts
│   │       ├── courses/
│   │       │   ├── route.ts
│   │       │   └── [code]/route.ts
│   │       ├── resources/
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       ├── submissions/
│   │       │   ├── route.ts
│   │       │   └── [id]/review/route.ts
│   │       ├── admin/
│   │       │   ├── review-queue/route.ts
│   │       │   └── audit-logs/route.ts
│   │       └── search/route.ts
│   │
│   ├── components/             # 共享组件
│   │   ├── ui/                 # shadcn/ui 组件（自动生成）
│   │   ├── layout/             # 布局组件（Header, Sidebar, Footer）
│   │   ├── course/             # 课程相关组件
│   │   │   ├── CourseCard.tsx
│   │   │   ├── CourseDetail.tsx
│   │   │   ├── LearningStage.tsx
│   │   │   ├── TeacherReview.tsx
│   │   │   └── ResourceList.tsx
│   │   ├── path/               # 路径组件
│   │   │   ├── RequiredCourses.tsx
│   │   │   ├── GenEdProgress.tsx
│   │   │   ├── OverdueWarning.tsx
│   │   │   └── MinorProgress.tsx
│   │   ├── auth/               # 认证组件
│   │   ├── import/             # 导入组件
│   │   └── admin/              # 管理组件
│   │
│   ├── lib/                    # 工具库
│   │   ├── prisma.ts           # Prisma 客户端单例
│   │   ├── auth.ts             # JWT 工具（sign/verify）
│   │   ├── api-client.ts       # 前端 API 调用封装
│   │   ├── path-engine.ts      # 四类路径计算引擎
│   │   ├── json-adapter.ts     # 教务JSON适配器
│   │   ├── validators.ts       # Zod schema（前后端共享）
│   │   └── constants.ts        # 常量（学期、学分要求等）
│   │
│   ├── types/                  # TypeScript 类型定义
│   │   ├── api.ts              # API 请求/响应类型
│   │   ├── domain.ts           # 领域模型类型
│   │   └── import.ts           # 导入 JSON 类型
│   │
│   └── hooks/                  # 自定义 Hooks
│       ├── use-auth.ts
│       ├── use-courses.ts
│       └── use-submissions.ts
│
├── docs/                       # 项目文档
│   ├── SPECIFICATION.md        # 本文档
│   ├── API.md                  # API 文档（OpenAPI 生成）
│   └── DATABASE.md             # 数据库设计文档
│
├── tests/
│   ├── unit/                   # 单元测试
│   ├── integration/            # API 集成测试
│   └── e2e/                    # Playwright E2E
│
├── fixtures/                   # 测试数据
│   ├── valid-import.json
│   ├── missing-fields.json
│   ├── duplicate-import.json
│   └── old-schema.json
│
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx.conf
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── public/                     # 静态资源
├── .env.example                # 环境变量模板（不含敏感值）
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## 三、命名规范

### 文件命名
| 类型 | 规范 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `CourseCard.tsx` |
| 页面路由 | kebab-case 目录, `page.tsx` | `course/[code]/page.tsx` |
| API 路由 | kebab-case 目录, `route.ts` | `api/courses/route.ts` |
| 工具函数 | kebab-case | `path-engine.ts` |
| 类型定义 | kebab-case | `domain.ts` |
| Hook | `use-` 前缀, kebab-case | `use-auth.ts` |
| 测试文件 | `*.test.ts` 或 `*.spec.ts` | `path-engine.test.ts` |

### 变量/函数命名
| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `CourseCard` |
| 函数 | camelCase | `calculateRequiredCredits` |
| 变量 | camelCase | `passedCourses` |
| 常量 | UPPER_SNAKE_CASE | `MAX_CREDITS_PER_SEMESTER` |
| 类型/接口 | PascalCase | `Course`, `UserProgram` |
| 枚举成员 | UPPER_SNAKE_CASE | `ResourceType.EXAM_PAPER` |
| Prisma 模型 | PascalCase, 单数 | `User`, `Course`, `Resource` |
| 数据库表 | snake_case, 复数（Prisma自动映射） | `users`, `course_resources` |

### CSS 类名
- 使用 Tailwind 原子类，不写自定义 CSS
- 需要自定义样式时使用 `@layer components` 或 `@apply`
- 组件变体用 CVA (class-variance-authority)

---

## 四、TypeScript 规范

### 编译选项
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false
  }
}
```

### 类型原则
- **禁止 `any`**。不确定类型时用 `unknown`，然后用 zod 校验
- **优先 interface over type**（用于对象），`type` 用于联合/交叉类型
- **API 类型从 Prisma 导出**，前端从 OpenAPI 生成
- **zod schema 是运行时类型源头**，TypeScript type 从 zod infer

```typescript
// ✅ 正确：zod 是类型源头
import { z } from "zod";
export const CourseSchema = z.object({
  code: z.string().regex(/^[A-Z]{2,4}\d{3,4}[A-Z]?$/),
  name: z.string().min(1).max(100),
  credits: z.number().min(0).max(20),
});
export type Course = z.infer<typeof CourseSchema>;

// ❌ 错误：手写类型，与运行时校验分离
export interface Course {
  code: string;
  name: string;
  credits: number;
}
```

### 导入顺序
```typescript
// 1. Node.js 内置模块
import { cookies } from "next/headers";

// 2. 第三方库
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

// 3. 项目内部模块（@/ 别名）
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// 4. 相对路径导入（同目录组件）
import { CourseCard } from "./CourseCard";

// 5. 类型导入
import type { Course } from "@/types/domain";
```

---

## 五、React/Next.js 组件规范

### 组件结构模板
```typescript
// 1. 导入
import { type FC } from "react";
import { CourseCard } from "@/components/course/CourseCard";
import type { Course } from "@/types/domain";

// 2. Props 类型
interface CourseListProps {
  courses: Course[];
  onSelect?: (course: Course) => void;
  loading?: boolean;
}

// 3. 组件（函数声明，不是箭头函数）
export function CourseList({ courses, onSelect, loading = false }: CourseListProps) {
  // 4. Hooks
  // const query = useQuery(...)

  // 5. 派生状态
  // const sortedCourses = useMemo(...)

  // 6. 事件处理
  // const handleClick = ...

  // 7. 条件渲染
  if (loading) return <CourseListSkeleton />;
  if (courses.length === 0) return <EmptyState />;

  // 8. 主渲染
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {courses.map((course) => (
        <CourseCard key={course.code} course={course} onClick={onSelect} />
      ))}
    </div>
  );
}
```

### 状态管理规则
| 状态类型 | 方案 |
|---------|------|
| 服务端数据 | TanStack Query (`useQuery` / `useMutation`) |
| 表单状态 | react-hook-form |
| 全局 UI 状态 | React Context（登录态、主题） |
| 组件局部状态 | `useState` / `useReducer` |
| URL 状态 | `useSearchParams` / `useRouter` |

### 页面级组件规则
- 每个页面文件 `< 200 行`
- 页面只负责组合，业务逻辑在 hooks 和 lib 中
- `"use client"` 只在需要交互的叶子组件使用，页面尽量保持 Server Component

---

## 六、API 规范

### Route Handler 模板
```typescript
// src/app/api/courses/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { CourseQuerySchema } from "@/lib/validators";

// GET /api/courses?major=xxx&semester=xxx
export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  const { searchParams } = request.nextUrl;

  const query = CourseQuerySchema.parse({
    major: searchParams.get("major"),
    semester: searchParams.get("semester"),
  });

  const courses = await prisma.course.findMany({
    where: { major: query.major, suggestedSemester: query.semester },
    include: { resources: true },
  });

  return NextResponse.json({ data: courses });
}

// POST /api/courses — admin only
export async function POST(request: NextRequest) {
  await requireRole(request, "admin");
  const body = await request.json();
  const course = await prisma.course.create({ data: body });
  return NextResponse.json({ data: course }, { status: 201 });
}
```

### API 响应格式
所有 API 统一返回：
```typescript
// 成功
{ "data": T }

// 列表（含分页）
{ "data": T[], "pagination": { "page": number, "pageSize": number, "total": number } }

// 错误
{ "error": { "code": string, "message": string, "details"?: unknown } }
```

### HTTP 状态码
| 场景 | 状态码 |
|------|-------|
| 查询成功 | 200 |
| 创建成功 | 201 |
| 请求参数错误 | 400 |
| 未登录 | 401 |
| 无权限 | 403 |
| 资源不存在 | 404 |
| 重复提交 | 409 |
| 服务器错误 | 500 |

### 鉴权中间件链
```typescript
// 每个 API route 的第一个语句：
const user = await requireAuth(request);           // 强制登录
await requireRole(request, "admin");               // 强制管理员
await requireOwnership(request, "resource", id);   // 强制资源所有权
```

---

## 七、数据库规范

### Prisma Schema 规则
- **所有表都要有** `id` (UUID), `createdAt`, `updatedAt`
- **外键**：命名 `{referencedTable}Id`，如 `courseId`, `submitterId`
- **枚举**：使用 PostgreSQL 原生 enum（先在 schema 中定义，再在模型中引用）
- **索引**：为所有外键和常用查询字段加 `@@index`
- **软删除**：审核相关的表加 `deletedAt` 字段

### 迁移规则（来自团队文档）
- 角色4负责维护迁移，**任何字段变化必须带迁移和 seed**
- 迁移文件不可手动修改，只能通过 `prisma migrate dev` 生成
- 每次迁移后更新 `prisma/seed.ts`
- 禁止在生产环境运行 `prisma migrate dev`（用 `prisma migrate deploy`）

### JSON 数据规则
- 导入的原始教务 JSON 存入 `jsonb` 字段，不做解析修改
- JSON 不存储密码、Cookie、session token
- 日志中不出现学号、成绩明细

---

## 八、Git 工作流

### 分支策略
```
main        ← 永远可部署
├── develop ← 日常开发基准分支
│   ├── feat/xxx      ← 功能分支
│   ├── fix/xxx       ← 修复分支
│   └── refactor/xxx  ← 重构分支
└── release/xxx ← 发布分支
```

### Commit 规范 (Conventional Commits)
```
feat: 新功能
fix: 修复bug
docs: 文档变更
style: 格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具变更
perf: 性能优化
ci: CI/CD变更
db: 数据库变更

示例:
feat(course): 课程详情页老师评价卡片
fix(auth): 修复JWT过期不刷新问题
db: 添加resources表copyright字段
```

### PR 规则（来自团队文档）
- **1 PR = 1 验收项**，不超过 400 行变更
- 合并前必须通过：lint → typecheck → test → build
- 身份导入、权限、生产迁移至少 1 人复核
- PR 标题格式：`[type](scope): description`

---

## 九、测试规范

### 测试金字塔
```
        /\
       /E2E\        ← Playwright: 核心用户流程 2-3条
      /------\
     /集成测试\      ← API endpoint 测试
    /----------\
   /  单元测试   \    ← 路径引擎、JSON适配器、校验逻辑
  /--------------\
```

### 必须测试的场景
1. **路径引擎**：给定修读记录，验证四类组件的计算结果
2. **JSON导入**：正常/缺字段/重复/旧schema 四类fixture
3. **权限**：越权请求被拒绝（visitor → admin API）
4. **审核流程**：投稿→待审→通过→公开 全链路
5. **导入幂等**：同一份JSON导入两次不产生重复数据

### 测试文件位置
```
tests/
├── unit/
│   ├── path-engine.test.ts
│   ├── json-adapter.test.ts
│   └── validators.test.ts
├── integration/
│   ├── auth.test.ts
│   ├── courses.test.ts
│   └── submissions.test.ts
└── e2e/
    └── main-flow.spec.ts
```

---

## 十、安全规范（来自团队文档）

### 绝对红线
- ❌ 不保存教务网密码、验证码、Cookie、localStorage 会话
- ❌ 不保存 CC98 用户会话
- ❌ 日志中不出现学号、密码、成绩明细、Cookie
- ❌ 不直接托管/分发电子书文件
- ❌ 不在前端暴露敏感环境变量

### 数据保护
- ✅ 用户密码使用 bcrypt/argon2 哈希
- ✅ JWT 设置合理过期时间（access 24h, refresh 7d）
- ✅ 原始导入 JSON 限权访问（仅管理员和目标用户）
- ✅ 投稿内容 HTML 白名单清洗（防 XSS）
- ✅ 上传文件检查 MIME、大小、哈希去重
- ✅ 所有管理员操作记录 audit_logs（操作者、时间、理由）

---

## 十一、环境变量

```bash
# .env.example — 不含真实值，可提交到 Git
DATABASE_URL="postgresql://user:password@localhost:5432/mse-wiki"
JWT_SECRET="generate-a-random-secret"
JWT_REFRESH_SECRET="generate-another-random-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CC98_BASE_URL="https://www.cc98.org"
```

---

## 十二、文档维护规则

- `docs/SPECIFICATION.md` — 本文档，项目规范唯一真相源
- `docs/API.md` — 由角色3维护，从 OpenAPI spec 生成
- `docs/DATABASE.md` — 由角色4维护，从 Prisma Schema 生成 ER 图
- `README.md` — 项目概述 + 快速启动 + 技术栈一览
- 任何新规则先在本文档落地，再执行

---

## 十三、Agent 协作规则

本项目使用 5 个专用 Agent 对应 5 个开发角色。Agent 之间的协作规则：

1. **角色3（后端）是API契约的owner** — 所有接口变更由角色3先更新 OpenAPI spec，其他 agent 再据此开发
2. **角色4（数据库）是Schema的owner** — 任何涉及数据库的变更必须由角色4执行迁移
3. **前端 agent（1+2）不直接操作数据库** — 通过 API 获取数据
4. **角色5（DevOps）是基础设施的owner** — Docker、CI/CD、环境变量由角色5统一管理
5. **跨角色变更需要PR复核** — 身份、权限、生产配置至少两人review

---

*本规范最后更新：2026-07-23*
*维护者：角色5（DevOps & PM）*
