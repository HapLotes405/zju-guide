# 网站资源导入 MVP

管理员在“投稿 → 从网站导入”选择 TuringCourses 或 BMS Database，扫描公开课程目录，确认课程、标题、分类后批量送审。课程资源保存外部链接与来源信息；不下载附件或转载正文。

## 开发与部署基线

- 本地功能分支：`feat/website-resource-import`，基于新版参考提交 `82e08f1`。
- 实际目标仓库：`Eason-Iron/zju-guide`；本地 `origin` 已指向该 Fork，`upstream` 仅供读取。
- Fork 的默认分支是 `master`，检查时 HEAD 为 `ba972e3`，仍采用 SQLite。新版参考基线采用 PostgreSQL。
- Fork 现有 `.github/workflows/ci.yml` 只在 `main/develop` 做 CI，没有发布步骤；仓库中没有 Vercel/Netlify 配置。托管平台控制台的连接状态尚未核实。
- 因此不能将本分支直接合并到旧 Fork 并视为安全上线。先确认是否同步新版及现有数据库迁移安排，再验证真实自动部署通道。没有向上游或 Fork 推送任何本次改动。

## 接口与数据

- `GET /api/admin/website-imports`：来源清单与最近 50 个持久化任务。
- `POST /api/admin/website-imports {sourceId}`：创建扫描，支持两个预置 id、名称或对应 URL；当前从配置的站点根目录扫描，不支持自选子目录。
- `GET /api/admin/website-imports/:id`：任务进度、候选、匹配建议及课程名称。
- `PATCH /api/admin/website-imports/:id`：`action=update` 保存候选并确认课程；`cancel` 停止扫描；`withdraw` 撤回本批新建资源。
- `POST /api/admin/website-imports/:id {candidateIds}`：逐项返回送审、重复或失败结果。
- `GET /api/admin/submissions?batch=id`：按导入批次审核。

所有导入端点同时校验 JWT ADMIN 和数据库当前角色，且需要 `WEBSITE_IMPORT_ENABLED=true`。每批最多 30 条，每管理员每天最多 100 条（上海日期）；最多 3 个活动任务，每管理员每天最多 20 次扫描。扫描单页 2 MB、10 秒超时、瞬态失败重试一次、同站至少间隔 1 秒。

迁移 `20260908160000_website_import` 是相对 PostgreSQL 新版的增量迁移：新增任务和候选表，在 Resource 上添加可选来源字段、批次关联和唯一导入键。不会替旧版 SQLite 完成数据库转换。

任务由独立 worker 领取，租约 90 秒、每 20 秒续期；重启后重新扫描未完成任务，候选按链接幂等写入，人工修改不被覆盖。批量送审以 PostgreSQL 事务锁串行执行配额与去重检查。撤回将本批次资源设为 REJECTED、关闭投稿记录并留下审计；预先存在的重复资源不受影响。

## 本地运行

准备隔离 PostgreSQL 测试库，勿将验证命令指向生产数据库。环境变量设置：

```text
DATABASE_URL=postgresql://msewiki:msewiki@127.0.0.1:5432/msewiki_test
JWT_SECRET=仅供本地的随机值
JWT_REFRESH_SECRET=另一个本地随机值
WEBSITE_IMPORT_ENABLED=true
```

```sh
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma db push
pnpm dev
# 另一个终端，使用相同环境变量
pnpm worker:website-import
```

以已有 ADMIN 测试账户登录；新注册账户没有导入权限。不提供生产账户或通用管理员密码。

```sh
pnpm typecheck
pnpm test:unit
pnpm test
pnpm build
# 只读目录解析试验，输出 output/website-import/fixture-trial.json
pnpm exec tsx scripts/website-import-trial.ts
# 对公开来源发请求，不写数据库
pnpm exec tsx scripts/website-import-trial.ts --live
# 浏览器 UI 合同测试使用拦截响应，不代表数据库端到端测试
pnpm exec playwright test tests/e2e/website-import.spec.ts --workers=1
```

浏览器测试默认访问 localhost:3000；可通过 `NEXT_PUBLIC_APP_URL` 指向正在运行的本地实例。

## 试验记录

2026-09-08/09，本次会话保存的公开 HTML 目录解析：

| 来源 | 目录发现数 | 试验选取 | 唯一课程建议 | 多课程候选 | 未匹配 |
|---|---:|---:|---:|---:|---:|
| TuringCourses | 69 | 20 | 18 | 2 | 0 |
| BMS Database | 39 | 10 | 10 | 0 | 0 |

匹配依据来自仓库中的课程清单。以上是匹配建议覆盖情况，不是人工核验后的匹配准确率；发现总数亦不等于已经逐页验证可访问的资源数。

已运行 208 项单元测试与类型检查通过，生产构建通过。2 项浏览器交互合同测试通过（管理员确认、送审和撤回；普通用户隐藏入口），使用模拟 API 响应。数据库集成测试已编写，覆盖确认门禁、并发重复提交、跨批查重与撤回；尚未执行通过。便携 PostgreSQL 已初始化，但启动被自动审批系统因审批服务使用额度耗尽拒绝。数据库迁移实测、端到端投稿审核、真实页面逐项核验、人工耗时对照及线上 5 条试验仍待完成。

UI 截图与 JSON 原始结果在 `output/website-import/`；截图使用 API 拦截响应，只用于展示和验证交互。

## 上线和撤回步骤

1. 确认 Fork 基线与实际部署服务，核对生产数据库类型、版本及 migration 历史。
2. PostgreSQL 新版先做数据库备份，并验证备份可恢复；数据库若是 SQLite，另行完成转换和核对，禁止直接套用增量迁移。
3. 在测试环境验证 `prisma migrate deploy` 和 worker。现有 Compose 启动命令包含 `db push` 与 seed，不应将它当作本次受控迁移命令；上线前由现有部署流程明确执行迁移，避免在生产反复播种。
4. 保持功能开关关闭部署 app 与 worker，确认迁移后再向管理员启用。
5. 若使用现有 Docker Compose，可合并 `docker/website-import.compose.yml`，设置 `WEBSITE_IMPORT_ENABLED=true` 并启用 `--profile website-import`；只启动一个 worker。
6. 导入 5 条经人工验证的真实链接，逐条审核，核对课程页与资源页，记录批次 ID。
7. 观察 48 小时内的失败、重复和链接问题。异常时关闭开关、停止 worker，使用“撤回批次”撤回新资源；保留增量表及审计，不进行破坏性反向迁移。

新增的 `website-import-ci.yml` 只做验证，不会发布站点。没有创建周期监控，也没有安排尚未上线功能的定时任务。
