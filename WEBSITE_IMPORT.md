# 网站资源导入 MVP

管理员在“投稿 → 从网站导入”选择 TuringCourses 或 BMS Database，扫描公开课程目录，确认课程、标题、分类后批量送审。课程资源保存外部链接与来源信息；不下载附件或转载正文。

## 开发与部署基线

- PR 目标为 `Ltto123/zju-guide` 的 `master`；贡献分支为 `Eason-Iron/zju-guide:feat/website-resource-import`，基于上游提交 `82e08f1`。
- 上游基线已采用 PostgreSQL，本功能提供增量迁移，不引入 SQLite → PostgreSQL 转换。仍运行旧版 SQLite 的部署需要单独规划数据迁移。
- `Eason-Iron/zju-guide` 仅作为外部贡献的代码来源，不是本功能的发布目标。
- 新增 CI 仅验证代码，不会发布服务器；最终部署环境、备份和 worker 的启动方式由维护者确认。
- 本地试验与 Fork CI 已通过，尚未部署到生产。CI 记录：[34332877804](https://github.com/Eason-Iron/zju-guide/actions/runs/34332877804)。

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
TEST_DATABASE_URL=postgresql://msewiki:msewiki@127.0.0.1:5432/msewiki_test
JWT_SECRET=仅供本地的随机值
JWT_REFRESH_SECRET=另一个本地随机值
WEBSITE_IMPORT_ENABLED=true
```

```sh
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
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

已运行 208 项单元测试、类型检查及生产构建通过；完整测试共 20 个文件、288 项通过，包含真实 PostgreSQL 集成测试。2 项浏览器交互合同测试通过（管理员确认、送审和撤回；普通用户隐藏入口），使用模拟 API 响应。2026-09-09 本地 PostgreSQL 18 在 127.0.0.1:55432 完成全部 5 个迁移；CI 使用 PostgreSQL 16。

真实来源 MVP 于 2026-09-09 09:04 UTC 在隔离本地测试库完成：worker 实际扫描两个来源，各达到 30 条候选上限；逐页核验 Turing 20 条与 BMS 10 条，全部可访问。按课程名和页面主标题程序核验，27 条完成候选确认 → DRAFT 送审 → 真实审核路由 APPROVED → 批次撤回；重复送审未增加投稿记录。另 3 条保留待人工核验（包括多课程候选），没有强行入库。所有试验批次已撤回，审计保留。逐项证据在 `output/website-import/live-db-trial.json`，试验脚本保存在本地 `tmp/live-db-trial.ts`。

这不是人工匹配准确率或浏览器端到端验证；人工耗时对照、线上 5 条试验及 48 小时观察尚未完成。集成测试只允许 localhost 且名称以 `_test` 结尾的数据库，通过 `TEST_DATABASE_URL` 同时配置初始化和测试进程，避免两者指向不同数据库。

UI 截图与 JSON 原始结果在 `output/website-import/`；截图使用 API 拦截响应，只用于展示和验证交互。

## 上线和撤回步骤

1. 确认实际部署服务和应用版本，核对生产数据库类型、版本及 migration 历史。
2. PostgreSQL 新版先做数据库备份，并验证备份可恢复；数据库若是 SQLite，另行完成转换和核对，禁止直接套用增量迁移。
3. 在测试环境验证 `prisma migrate deploy` 和 worker。现有 Compose 启动命令包含 `db push` 与 seed，不应将它当作本次受控迁移命令；上线前由现有部署流程明确执行迁移，避免在生产反复播种。
4. 保持功能开关关闭部署 app 与 worker，确认迁移后再向管理员启用。
5. 若使用现有 Docker Compose，可合并 `docker/website-import.compose.yml`，设置 `WEBSITE_IMPORT_ENABLED=true` 并启用 `--profile website-import`；只启动一个 worker。
6. 导入 5 条经人工验证的真实链接，逐条审核，核对课程页与资源页，记录批次 ID。
7. 观察 48 小时内的失败、重复和链接问题。异常时关闭开关、停止 worker，使用“撤回批次”撤回新资源；保留增量表及审计，不进行破坏性反向迁移。

新增的 `website-import-ci.yml` 只做验证，不会发布站点。没有创建周期监控，也没有安排尚未上线功能的定时任务。

## 转发给服务器管理员

请协助确认 `106.14.218.12:8080` 的以下信息：

1. 服务器由谁管理，使用 SSH、宝塔、1Panel、Docker Compose 或其他平台；提供平台项目链接或安全授予访问的方式。
2. 应用所在目录、启动/重启方式、容器或服务名，以及当前部署的仓库、分支、提交。
3. 数据库类型（SQLite/PostgreSQL）、版本、数据位置，以及备份和恢复方式；用户上传文件存储位置。
4. 是否已有 GitHub 自动部署：对应 workflow、webhook、runner 或平台项目；若使用 Secrets，只提供名称及是否配置，不发送值。
5. 能否先部署测试环境、执行迁移并运行一个后台 worker；可接受的维护时间及失败回滚方式。

密码、数据库连接密码、令牌和私钥应通过服务器平台或 GitHub Secrets 安全配置，不放入 PR 或聊天。
