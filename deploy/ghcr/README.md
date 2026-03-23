# GHCR 纯镜像部署

这个目录用于“仅用镜像部署”，不依赖项目源码构建。

## 1. 准备文件

至少需要两个文件：
- `docker-compose.yml`
- `.env`（从 `.env.example` 复制）

## 2. 部署步骤

```bash
cp .env.example .env
# 编辑 .env，至少改密码和密钥
docker login ghcr.io
docker compose --env-file .env up -d
```

## 3. 常用运维

```bash
docker compose --env-file .env pull
docker compose --env-file .env up -d
docker compose ps
docker compose logs --tail=120 api web db
```
