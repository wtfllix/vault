# Vault 2.0 验证记录

验证时间：2026-11-12。未改动实际旧数据库；测试在用户提供的 PostgreSQL 15.19 数据库内创建随机隔离 schema，结束时清理。实际 .env 已从 Git 索引移除，内容和原密钥未更改、权限收紧至 0600；.env.test、临时会话、测试报告与截图均被 Git 忽略。

## 已执行

| 检查                                     | 结果               | 范围                                                                      |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| pnpm install --frozen-lockfile --offline | 通过               | 严格锁文件和 Argon2/esbuild 本机构建脚本；脚本使用沙箱外权限完成          |
| pnpm test                                | 8 通过，1 跳过     | 不依赖数据库的安全和存储单元测试；未带数据库环境时，集成测试明确跳过      |
| pnpm test:integration                    | 1 完整集成场景通过 | 真实 PostgreSQL，涵盖下方全部数据库断言                                   |
| pnpm build                               | 通过               | 生产构建；仍有一个超过 500 KB 的入口 chunk 警告                           |
| Playwright                               | 6 通过，15.6 秒    | 本机真实 Nginx、生产前端、Fastify、隔离 PostgreSQL，使用本机已有 Chromium |
| pnpm audit --json                        | 通过：0 个已知漏洞 | 覆盖生产与开发依赖；结果仅代表本次公告库扫描，不是绝对安全保证            |
| Prettier 格式检查                        | 通过               | 全部新代码和相关配置统一格式                                              |
| git diff --check                         | 通过               | 没有空白错误                                                              |

依赖修复：Fastify 从 5.8.2 升至 5.12.8，Vite 从 5.4.21 升至 6.4.6，并更新受影响的 fast-uri、find-my-way、PostCSS、Browserslist、nanoid 等传递依赖。升级前扫描分别发现生产和开发工具链公告，升级后完整扫描为 0。

后端集成断言：

- 原旧表结构和 `{iv,tag,ct}` 密文成功迁移，ID 和自定义字段保留。
- 旧备注移入加密 envelope，旧明文 note 列清空；错误旧密钥导致启动失败。
- 并发初始化只有一次成功，另一次返回 409；错误 Origin 被拒绝。
- Cookie 为 HttpOnly、Secure、SameSite=Strict；数据库仅保存 Session 哈希。
- 私有请求在正文解析前即鉴权；未提供 CSRF 的写入被拒绝；错误字段类型不会被自动转换。
- Session 跨服务重启可用；撤销后重启也无效；改密撤销旧会话；全部退出生效。
- 初版曾验证五分钟复验窗口；此行为已按后续要求移除，现采用下文的七天会话回归。
- 健康轮询不延长无活动时限；超时会话被拒绝。
- IP 和 Owner 维度限流、失败退避及重启后的持久限流生效。
- 密钥列表不包含明文、加密内容或备注。
- 文件上传、SHA-256、同名拒绝、下载鉴权、目录循环拒绝、递归删除与恢复正常。
- 两次相同版本的 Notes 更新只能成功一次，另一次返回 409。

浏览器验收：

1. 桌面：上传并刷新后仍存在；原生下载 API 经 Nginx 返回正确 206、Content-Range 和字节；安全预览、笔记自动保存、并发冲突另存副本、密钥默认隐藏与按需解密、30 秒自动隐藏。
2. 移动：390px 下 Files、Notes、Secrets 主要流程可用，笔记编辑全屏、详情独立显示，无横向溢出。
3. 详情竞态：延迟第一条文件详情响应，切换到第二条，旧响应不会覆盖第二条；320/390/768/1024/1440px 文件页面无横向溢出；匿名下载拒绝。
4. Markdown：脚本、事件属性、图片 HTML 和 javascript: 链接被移除，无脚本执行。
5. Command Palette：Ctrl+K 搜索标题与名称，结果不包含密钥明文。
6. 断网：保存状态为 Save failed；加密草稿不包含明文；联网刷新后恢复草稿并等待服务器持久化，再显示 Saved。

## 性能

三个模块、命令面板和设置按需加载；CodeMirror 和各语言包也按需加载。入口 JS gzip 约 197 KB，CodeMirror 基础包 gzip 约 99 KB。Files 首次使用还需加载表格和模块 chunk。静态资源与文本 API 启用 gzip，下载对象禁用 gzip；静态内容使用版本化文件名缓存，私人 API/下载 no-store。

本次截图使用合成测试数据，位于 artifacts/vault-desktop.png 与 artifacts/vault-mobile.png。HTML 浏览器报告位于 playwright-report/index.html（本地忽略文件）。

## 尚未执行的部署验收

- 当前环境未安装 Docker/Podman，因此没有执行 docker compose build/up 或容器内健康检查。
- 没有在真实 VPS 域名和证书上验证 HTTPS/HTTP2；已提供宿主反向代理示例。
- 备份恢复说明已提供，尚未进行容器备份/恢复演练。
- 没有替实际旧 Vault 数据库执行升级；旧数据兼容由隔离库内的旧格式合成夹具验证。
- 没有实测中国大陆到美国 VPS 的网络速度。

正式部署前：先按 DEPLOYMENT.md 备份、确认实际旧加密密钥并配置兼容密钥环，再在目标机器执行 docker compose config --quiet、docker compose up -d --build、恢复演练和 HTTPS/HTTP2 下载检查。

非阻断提示：生产构建仍有入口 chunk 超过 500 KB 的提示；Fastify 5 对旧 disableRequestLogging 选项发出弃用提示，该选项在当前锁定的 5.x 中仍生效。

## 快速复制增量验证

Secrets 列表和隐藏详情新增直接复制按钮。API Key 复制 key，账号与数据库记录复制 password，SSH 复制 privateKey，自定义/长文本复制 content，配置文件复制 UTF-8 文本内容（非文本拒绝）。不会回退复制 Provider、URL 或其他元数据，也不会将明文写入组件显示状态。切换记录或离开页面会取消未完成的复制请求。

新增 3 项单元测试验证字段选择、原值保留、配置文本解码、二进制拒绝，以及延迟解密时的原生剪贴板写入。桌面与移动浏览器均已验证实际剪贴板值正确、列表复制不会打开详情、隐藏详情复制后仍无明文。原有显示和逐字段复制保留。

## Node 22 CI 兼容修复

GitHub Actions 运行 43147962380 在测试入口失败，日志为 `node: bad option: --test-isolation=none`；镜像构建任务因此被跳过。原因是 CI/Docker 使用 Node 22，而原测试参数采用了 Node 23.6 才启用的新名称。

两个测试脚本均改用 Node 22 支持、Node 24 仍兼容的 `--experimental-test-isolation=none`。没有跳过或禁用任何测试。已下载并校验官方 Node 22.23.4 二进制，与失败运行的 Node 版本一致，重新执行测试入口、数据库集成与构建。

参考：[失败运行](https://github.com/wtfllix/vault/actions/runs/43147962380)、[Node 22 参数文档](https://nodejs.org/download/release/v22.21.0/docs/api/cli.html#--experimental-test-isolationmode)。修复后的远程结果以 GitHub Actions 对应提交为准。

## Recent 与界面文案精简增量验证

Favorites 导航、各模块收藏按钮和编辑器收藏开关已移除，新增 Recent。新增使用记录表为追加式迁移，保留旧收藏字段及密文。评分和兼容设计见 IMPLEMENTATION.md。

本次实际执行结果：

- `pnpm test`：8 项单元测试通过；未提供数据库环境的这条命令仍明确跳过集成入口。
- `pnpm test:integration`：外层完整安全/工作空间场景及新增 Recent 子场景均通过（共 2 项）。随机隔离 PostgreSQL schema 内验证并发请求去重、最近时间与频次共同排序、模块筛选、分页及越界页总数、无正文和密文泄漏、失败及未授权请求不计数、软删除/恢复、重启持久化和后续次数递增。
- `pnpm test:ui`：完整 7 项浏览器测试通过，18.1 秒。除原有流程外，实际打开文件夹、笔记和密钥后，验证 Recent 汇总、刷新、筛选、跨模块跳转、旧 Favorites 链接兼容和 320px 手机操作无横向溢出。
- `pnpm build`：生产构建通过；原有入口 chunk 大于 500 KB 的非阻断提示仍存在。
- Prettier 检查与 `git diff --check` 通过。
- 本机开发预览 `/api/health` 返回 200，未认证请求 `/api/recent` 返回 401。沿用既有预览数据库、文件及会话，不清空预览数据。

浏览器测试曾发现新列表图标混入按钮可访问名称，已给名称按钮补充准确的 aria-label 并隐藏装饰图标。筛选测试改为点击 Ant Design 实际可见标签，避免对隐藏 radio 输入执行不可见点击。最终完整回归全部通过。

此次未运行目标 VPS Docker/GHCR 发布与 HTTPS 验证，不能将本机结果视为目标部署验收。

Recent 首页调整：根地址默认进入 Recent，旧 `vault-last-module` 偏好不再覆盖首页，Vault 标识返回 Recent，显式详情链接继续有效。生产构建通过，完整 7 项浏览器测试再次通过（17.3 秒），包含旧 Files 偏好下的默认首页与从笔记点击 Vault 返回 Recent 的实际操作。

## 七天免重复主密码验证增量验证

先新增七天 Cookie/配置测试并确认旧 24 小时默认值导致失败，再移除五分钟复验并修改默认周期。最终执行结果：

- `pnpm test`：9 项单元测试通过，未加载测试数据库环境的集成入口明确跳过。新增验证两个默认期限均为七天、Cookie 安全属性与 Max-Age、可配置延长至三十天。
- `pnpm test:integration`：2 项（完整集成场景及 Recent 子场景）通过。将会话创建、验证、活动与绝对到期时间模拟到登录后 6 天 23 小时，重启应用后仍可打开会话、解密、新增、编辑、删除和恢复密钥，不调用复验接口。原有登出立即撤销、重启不恢复已撤销会话、改密撤销全部会话和全部设备退出断言通过；超过七天闲置或绝对到期后仍返回 401，心跳不会延长闲置时间。
- 完整 Playwright：8 项通过（18.7 秒），新增验证 Cookie 剩余期限超过六天、关闭浏览器上下文后沿用持久 Cookie 重新打开，可直接显示密钥，期间没有登录或复验请求，也没有主密码复验弹窗。
- `pnpm build`、相关源码 Prettier 检查和 `git diff --check` 通过。生产入口 chunk 警告与 Fastify 弃用提示仍为既有非阻断提示。

预览 API 已沿用原数据库、文件和 Session 更新。既有会话不自动延长，新的七天期限从下一次登录签发时生效。源码与 GHCR Compose、环境变量示例和部署说明已同步。此次未执行目标 VPS 镜像发布或容器验收。
