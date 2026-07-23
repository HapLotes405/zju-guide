# 求是学径 — 项目启动 Skill

一次性初始化整个项目：安装依赖、搭建目录结构、配置 Docker、完成 CI/CD。

## 触发方式
用户说"初始化项目" / "搭建项目" / "bootstrap" / "从头开始" 时使用。

## 执行步骤

### Step 1: 创建 Next.js 项目
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

### Step 2: 安装依赖
```bash
pnpm add prisma @prisma/client jose zod react-hook-form @hookform/resolvers @tanstack/react-query lucide-react
pnpm add -D @types/node vitest @vitejs/plugin-react playwright
pnpm add -D @tailwindcss/typography class-variance-authority clsx tailwind-merge
```

### Step 3: 初始化 shadcn/ui
```bash
npx shadcn@latest init
npx shadcn@latest add button card input label select dialog dropdown-menu avatar badge separator skeleton table tabs
```

### Step 4: 初始化 Prisma
```bash
npx prisma init --datasource-provider postgresql
```

### Step 5: 创建目录结构
按照 `docs/SPECIFICATION.md` 中的目录结构创建所有空目录。

### Step 6: 配置 Docker
创建 `docker/Dockerfile`, `docker/docker-compose.yml`, `docker/nginx.conf`

### Step 7: 配置 CI/CD
创建 `.github/workflows/ci.yml`

### Step 8: 验证
```bash
pnpm dev      # 确认可以启动
pnpm build    # 确认可以构建
```

## 使用
```bash
/claude skills bootstrap-project
```
