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

> 当前 `docker-compose.yml` 已按 2GB VPS 做了低内存优化：
> - 容器内存上限：`db=512m`、`api=384m`、`web=128m`
> - Docker 日志滚动限制，避免日志挤爆磁盘与内存
> - PostgreSQL 参数下调（`shared_buffers/work_mem/max_connections`）

建议额外开启 2G swap（防止峰值 OOM）：
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

常用监控命令：
```bash
free -h
docker stats
dmesg -T | grep -Ei 'killed process|out of memory|oom'
```

## 3. MVP 功能

- 首次启动设置主密码
- 后续主密码登录
- 密钥增删查
- 名称/类型搜索
- 数据库加密存储（AES-256-GCM）
