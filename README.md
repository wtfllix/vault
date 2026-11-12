# Vault 2.0

轻量、私人、自部署的数字工作空间：**Files · Notes · Secrets**。

- **Files**：拖拽上传、真实进度、SHA-256、文件夹、移动、重命名、安全预览、原生下载和回收站。
- **Notes**：CodeMirror 6，七种文本/代码类型，Markdown 预览，1 秒自动保存，版本冲突保护与加密草稿恢复。
- **Secrets**：保留旧 API Key Vault 数据，元数据列表，按需解密，默认隐藏，30 秒自动清除明文，标签、环境与收藏。
- **私人空间**：全局命令面板、跨模块名称搜索、收藏、回收站、主题、移动端导航。

React + Ant Design / Fastify / PostgreSQL / VPS 本地磁盘 / Nginx。没有注册、分享、协作、ORM 或额外存储服务。

## 新部署

需要 Docker Compose、域名和 HTTPS 反向代理。仅在全新目录使用：

```bash
node scripts/init-config.mjs https://vault.example.com
docker compose config --quiet
docker compose up -d --build
```

`.env` 若已存在，生成器会拒绝覆盖。配置宿主 HTTPS 代理，示例见 [deploy/https-nginx.conf.example](deploy/https-nginx.conf.example)。首次打开输入 `.env` 内的 `BOOTSTRAP_TOKEN` 和至少 12 字符主密码。初始化后可移除 `BOOTSTRAP_TOKEN`，不影响后续登录。

**旧部署必须先阅读 [迁移、部署和备份说明](docs/DEPLOYMENT.md)**，保留原数据库卷和原加密密钥，不能直接生成新 `.env` 覆盖旧配置。

## 开发

Node >=22.9，pnpm 10，PostgreSQL 15/16。

```bash
pnpm install --frozen-lockfile
# 复制 .env.example 为本地 .env，填入随机密钥和开发库连接。
# 本地显式设置 NODE_ENV=development、APP_ORIGIN=http://localhost:1420
pnpm api-dev
pnpm dev
```

API 开发脚本读取 `.env`，本地 HTTP 仅允许 development + localhost/127.0.0.1。生产必须使用 HTTPS。

原生下载由 Nginx 的内部目录发送；只启动 Vite 时，Files 上传和管理可用，但下载不会传送文件字节。运行完整 Compose 或隔离测试栈可验证下载。

## 测试

```bash
pnpm test
pnpm build
# .env.test 中设置 TEST_DATABASE_URL；测试仅创建随机隔离 schema。
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:ui
```

端到端测试需要本机 `nginx`，从真实生产构建提供页面，连接隔离 PostgreSQL schema，测试 Range、下载鉴权、笔记冲突、密钥明文保护、命令搜索及移动端。若使用已安装浏览器，可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`。

执行结果与限制见 [docs/VALIDATION.md](docs/VALIDATION.md)。架构、兼容边界和迁移设计见 [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。

## 安全边界

Session 存于 PostgreSQL，数据库仅存令牌哈希；Cookie 使用 HttpOnly、Secure、SameSite=Strict。写操作要求精确 Origin 和 CSRF token，退出立即撤销，改密撤销全部 Session。敏感操作要求近期重新验证主密码。

Notes 正文和 Secrets 内容/备注由服务端 AES-256-GCM 加密；名称、类型、标签、环境是可检索元数据，不能放凭据。Files 在 VPS 文件系统保存原始内容，应保护磁盘权限和备份。这是服务器端加密，非零知识保险箱。
