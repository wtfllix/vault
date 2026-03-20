# API Key Vault Web MVP

Web 版单用户密钥管理器（React + Fastify + PostgreSQL）。

## 1. 本地开发

1. 安装依赖：
```bash
pnpm install
```

2. 启动 PostgreSQL（示例）：
```bash
docker run --name akv-pg -e POSTGRES_DB=akv -e POSTGRES_USER=akv -e POSTGRES_PASSWORD=akv_change_me -p 5432:5432 -d postgres:16-alpine
```

3. 配置环境变量：
```bash
cp .env.example .env
```

4. 启动 API：
```bash
set -a && source .env && set +a
pnpm api-dev
```

5. 启动前端：
```bash
pnpm dev
```

浏览器访问：`http://localhost:1420`

## 2. Linux 一键部署（Docker Compose）

```bash
docker compose up -d --build
```

访问：`http://<服务器IP>:8080`

## 3. MVP 功能

- 首次启动设置主密码
- 后续主密码登录
- 密钥增删查
- 名称/类型搜索
- 数据库加密存储（AES-256-GCM）
