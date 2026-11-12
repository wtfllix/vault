# 部署、迁移、备份与恢复

## 升级旧 Vault：先备份，再改配置

1. 停止写入，备份原数据库、原 `.env`、Compose 文件。保留 `akv_pgdata` 卷，禁止执行 `docker compose down -v`。
2. 记录部署时实际生效的 `APP_MASTER_KEY`。根旧 Compose 曾写死占位值，即使 `.env` 填了别的值，容器实际生效值仍可能来自 Compose。必须使用实际旧值；不要把密钥粘贴到工单或日志。
3. 若旧值是标准随机 32 字节 base64，继续原样设置 `APP_MASTER_KEY`。
4. 若旧值是口令或公开占位值，保留原值到 `APP_LEGACY_MASTER_KEY`，手动生成新的随机 `APP_MASTER_KEY`：`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`。应用只用旧值读取旧密文，用新值写新数据；不会自动替你替换配置。
5. 设置 `APP_ORIGIN=https://实际域名`，原 `DATABASE_URL`/数据库密码保持与已有数据库一致。更改 PostgreSQL 容器环境变量不会修改已有卷内账号密码。
6. 删除旧 JWT 配置。启动后旧 JWT 全部失效，使用原主密码重新登录，不需要重复初始化。
7. 执行 `docker compose config --quiet`，再 `docker compose up -d --build`。应用自动事务迁移，验证所有密文；任一密文无法解密则拒绝启动，不会静默覆盖数据。
8. 确认旧记录内容、备注、配置文件和编辑/删除正常后，保留备份。

SQL 迁移在 `server/migrations/`，通过 `schema_migrations` 记录版本并使用数据库 advisory lock。只增表/列和索引；旧记录 ID 保留。旧明文备注移入加密 envelope，事务提交后清空明文列。旧 `long_text` 和 `config_file` 仍在 Secrets，不自动转换模块。

回滚需恢复升级前数据库备份并运行旧镜像；不能用旧版本直接读取新版加密 envelope。不要对生产库执行测试。

## 密钥轮换

新密文包含版本和 key ID，旧无版本密文仍可读。`APP_PREVIOUS_KEYS` 是之前随机密钥的 JSON 数组，`APP_LEGACY_MASTER_KEY` 是唯一显式旧口令入口。

轮换分为：备份 → 将当前密钥加入旧密钥环 → 配置新随机写入密钥 → 校验启动与读取 → 维护窗口内显式重加密 → 确认数据库、草稿、旧备份的密钥依赖 → 再考虑移除旧密钥。当前不提供自动批量轮换操作，避免误改现有密文；保留旧密钥即可持续读取旧数据。密钥和数据库不要放在同一份未保护的备份中。

## HTTPS 与下载

根 Compose 只将 Web 绑定到 `127.0.0.1:8080`，不公开数据库和 API。宿主 Nginx/Caddy 提供 TLS 与 HTTP/2，再代理该端口。Nginx 示例适用于支持 `http2 on` 的版本，旧宿主版本使用 `listen 443 ssl http2`。

`APP_ORIGIN` 必须与浏览器地址的 scheme/host/port 完全一致，不包含路径或末尾 `/`。公网 CDN 不得缓存 `/api/` 或下载。

文件传输：浏览器下载 API → Session 校验 → 活跃文件元数据检查 → 随机对象 ID → `X-Accel-Redirect` → Nginx internal alias。磁盘对象不以用户文件名命名，内部 URL 直接访问返回 404，支持 HTTP Range、断点续传和原生下载。文件始终以 attachment 下载；HTML、SVG 和脚本不在站点上下文直接执行。安全预览只允许小文本或 PNG/JPEG/GIF/WebP，文本通过 React 转义。

API 以 node 用户运行，存储对象文件 0640、目录 2750，Nginx 以只读卷访问，GID 101 对齐。API 日志不记录请求体、Cookie、令牌或内容，Nginx 访问日志使用默认路径信息但不含 Cookie；不将凭据放入 URL。建议关闭下载 API 访问日志或仅记录去参数的路径。

## 存储管理

默认单文件 10 MB，总配额 10 GB，保留磁盘余量 256 MB。侧栏显示服务器真实 statfs 可用空间和数据库占用量；配额通过 `STORAGE_QUOTA_BYTES` 调整。

上传占用数据库预留空间后流式写临时文件，SHA-256 验证、fsync 和原子 rename，再标记 ready。中途失败清理本次对象；进程崩溃产生的孤儿在维护命令中清理：

```bash
docker compose exec api node server/src/gc.js
```

GC 只清理超过 24 小时的上传占位、临时文件和未被元数据引用的孤儿，保留回收站。可每周从宿主 cron 执行。回收站目前不提供永久删除按钮；可恢复性优先，空间不会因软删除释放。

文件夹最多 32 层；禁止移动到自身或后代，存在同名项目时返回冲突，不意外覆盖。恢复子文件前应先恢复父目录；文件夹恢复仅恢复同一次删除的后代。

## 一致性备份

备份期间暂停 API/Web 写入，数据库继续运行：

```bash
mkdir -m 700 -p backup
docker compose stop api web
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup/vault.sql
docker compose run --rm --no-deps -v "$PWD/backup:/backup" --entrypoint sh api -c 'tar -czf /backup/files.tar.gz -C /srv/vault .'
docker compose up -d api web
```

另行安全备份所有仍需解密的密钥，保留镜像版本和迁移版本。外部 PostgreSQL 部署使用相应数据库管理员工具做一致性 dump。备份目录写权限须允许镜像中的 node 用户；不要改成全局可写。

## 恢复演练

在独立 Compose 项目名和空数据库卷中进行：启动 db → 导入 vault.sql → 解压文件备份到 vault_files 并恢复 node:GID101 权限 → 配置备份对应的密钥环 → 启动 API/Web → 检查旧 Secrets、Notes、文件 SHA-256 和 Range 下载。

```bash
# 仅在新建的空恢复环境中执行，禁止指向仍在使用的数据库。
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup/vault.sql
```

备份和恢复命令在当前开发环境未做容器实测；正式升级前必须完成一次恢复演练。

## 本地开发

`.env` 设置 `NODE_ENV=development`、`APP_ORIGIN=http://localhost:1420` 和本地数据库连接。生产配置不会允许公网 HTTP Cookie。`pnpm api-dev` 自动读取 `.env`。隔离端到端测试自带本机 Nginx，无需修改实际 `.env`。

## 依赖与发布

Docker 使用 `pnpm install --frozen-lockfile`。CI 先进行单元、真实 PostgreSQL 和浏览器测试，再构建镜像。镜像部署建议固定 digest；GHCR 配置示例不再默认拉取旧 master-latest。

## 七天免重复验证

新登录默认有效 7 天，关闭浏览器、再次打开应用或重启 API 后，只要 Cookie 与数据库会话仍有效，就不需要再次输入主密码。查看、复制、编辑、删除和恢复密钥、全部设备退出不再触发五分钟主密码复验；修改主密码仍需填写当前密码。

源码 Compose 和 GHCR Compose 的默认值均已更新。如果 VPS 的 `.env` 已显式配置过旧期限，需将两项一起更新：

```dotenv
SESSION_SECONDS=604800
SESSION_IDLE_SECONDS=604800
```

`SESSION_SECONDS` 是从登录开始计算的绝对有效期，`SESSION_IDLE_SECONDS` 是无实际使用时的闲置期限；实际期限取两者的较早者。按上述配置，登录满七天后重新登录，不会因页面的后台心跳无限续期。可显式配置更长周期，最大支持 30 天（2592000 秒）。

更新镜像与配置并重建 API 容器后，下次登录签发的 Cookie 和会话采用新期限。已经签发的 Cookie/会话保留原到期时间；不会自动延长旧会话，更不会恢复已撤销或已过期的登录。接口持续校验 Session、Origin 与 CSRF；退出、全部设备退出和修改主密码后立即撤销会话。无需为此改动数据库结构或加密密钥。
