# API Key Vault

面向个人用户的自部署密钥保险箱，采用 `React + Fastify + PostgreSQL`，通过 Docker Compose 即可启动。

## 产品定位

- 单用户、自部署、开箱即用
- 适合保存 API Key、账号密码、数据库连接、SSH 密钥和配置文件
- 默认以 Web 容器项目继续开发，不再维护桌面端代码

## 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 启动 PostgreSQL

```bash
docker run --name akv-pg -e POSTGRES_DB=akv -e POSTGRES_USER=akv -e POSTGRES_PASSWORD=akv_change_me -p 5432:5432 -d postgres:16-alpine
```

3. 配置环境变量

```bash
cp .env.example .env
```

4. 启动 API

```bash
set -a && source .env && set +a
pnpm api-dev
```

5. 启动前端

```bash
pnpm dev
```

浏览器访问：`http://localhost:1420`

## Docker 部署

```bash
docker compose up -d --build
```

访问：`http://<服务器IP>:8080`

当前部署方案适合个人或轻量团队自用，默认包含：

- `web`: Vite 构建后的静态前端，由 Nginx 提供服务
- `api`: Fastify API
- `db`: PostgreSQL

## 当前功能

- 首次启动设置主密码
- 主密码登录
- 新建、查看、删除各类密钥记录
- 上传并下载配置文件
- 前端即时筛选和分类浏览

## 项目结构

```text
src/         React 前端
server/      Fastify API 与加密/认证逻辑
public/      静态资源
deploy/      部署示例
```

## 后续开发原则

- 只保留 Web 自部署路线
- 新功能统一落在 `src/` 与 `server/`
- 优先保证个人用户开箱即用、界面简洁、部署简单
