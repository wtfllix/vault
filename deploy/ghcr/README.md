# Vault 2.0 镜像部署

使用这里的 Compose 与 .env.example，填写已经验证的 Vault 2.0 API_IMAGE、WEB_IMAGE（建议 digest）。不得用旧版 API 镜像配新版数据库。

新部署生成随机配置；已有部署按仓库 docs/DEPLOYMENT.md 保留原数据库卷、实际旧密钥和原数据库密码。设置准确的 HTTPS APP_ORIGIN，在宿主提供 HTTPS/HTTP2 代理，再启动 `docker compose --env-file .env up -d`。

持久化卷为 akv_pgdata 和 vault_files；不要执行 down -v。通过 `docker compose ps`、`docker compose logs --tail=100 api` 检查启动状态，日志不会输出密钥或底层解密错误详情。
