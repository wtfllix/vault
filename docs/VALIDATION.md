# Vault 2.0 验证记录

验证时间：2026-11-12。未改动实际旧数据库；测试在用户提供的 PostgreSQL 15.19 数据库内创建随机隔离 schema，结束时清理。实际 .env 已从 Git 索引移除，内容和原密钥未更改、权限收紧至 0600；.env.test、临时会话、测试报告与截图均被 Git 忽略。

## 已执行

| 检查 | 结果 | 范围 |
|---|---|---|
| pnpm install --frozen-lockfile --offline | 通过 | 严格锁文件和 Argon2/esbuild 本机构建脚本；脚本使用沙箱外权限完成 |
| pnpm test | 8 通过，1 跳过 | 不依赖数据库的安全和存储单元测试；未带数据库环境时，集成测试明确跳过 |
| pnpm test:integration | 1 完整集成场景通过 | 真实 PostgreSQL，涵盖下方全部数据库断言 |
| pnpm build | 通过 | 生产构建；仍有一个超过 500 KB 的入口 chunk 警告 |
| Playwright | 6 通过，15.6 秒 | 本机真实 Nginx、生产前端、Fastify、隔离 PostgreSQL，使用本机已有 Chromium |
| pnpm audit --json | 通过：0 个已知漏洞 | 覆盖生产与开发依赖；结果仅代表本次公告库扫描，不是绝对安全保证 |
| Prettier 格式检查 | 通过 | 全部新代码和相关配置统一格式 |
| git diff --check | 通过 | 没有空白错误 |

依赖修复：Fastify 从 5.8.2 升至 5.12.8，Vite 从 5.4.21 升至 6.4.6，并更新受影响的 fast-uri、find-my-way、PostCSS、Browserslist、nanoid 等传递依赖。升级前扫描分别发现生产和开发工具链公告，升级后完整扫描为 0。

后端集成断言：

- 原旧表结构和 `{iv,tag,ct}` 密文成功迁移，ID 和自定义字段保留。
- 旧备注移入加密 envelope，旧明文 note 列清空；错误旧密钥导致启动失败。
- 并发初始化只有一次成功，另一次返回 409；错误 Origin 被拒绝。
- Cookie 为 HttpOnly、Secure、SameSite=Strict；数据库仅保存 Session 哈希。
- 私有请求在正文解析前即鉴权；未提供 CSRF 的写入被拒绝；错误字段类型不会被自动转换。
- Session 跨服务重启可用；撤销后重启也无效；改密撤销旧会话；全部退出生效。
- 超出近期验证窗口的密钥读取返回 428，重新验证后恢复。
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
