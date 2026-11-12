# Vault 2.0 实施记录

## Phase 0：兼容边界

原 React/Ant Design、Fastify/PostgreSQL 和 Docker Compose 架构保留。原表 app_config、secrets 的主键和 encrypted_data 不重建。原 master_password_hash 继续作为唯一 Owner 的散列；旧 JWT 全部失效，改用 PostgreSQL Session。

旧密文格式 `{iv,tag,ct}` 继续可读。旧密钥归一化：base64 解码恰为 32 字节则直接使用，否则 SHA-256(raw.trim())。新部署必须使用随机 32 字节 base64 密钥。旧弱密钥只允许通过显式 APP_LEGACY_MASTER_KEY 进入只读旧密钥环；必须配置新的安全 APP_MASTER_KEY，不能自动替换旧配置或批量重写旧密文。启动逐条验证旧密文，失败则停止。

新密文格式 `{v:2,kid,iv,tag,ct}`。使用 key ID 选择解密密钥，并通过 AAD 绑定格式和 key ID。轮换采取先加入旧密钥、再切换写入密钥、校验和备份、离线显式重加密的流程。删除旧密钥前必须确认数据库和备份中不再有依赖。

旧类型 apikey/password/database/ssh/custom/long_text/config_file 均保留，不自动迁移到 Files/Notes。旧 note 属敏感内容，迁移到加密 envelope 后清空明文列；新列表不返回 note 或内容摘要。名称、类型、标签、环境为非敏感元数据，界面提醒不要填写凭据。

## 迁移

server/migrations 为编号 SQL；迁移在单个事务中获取 advisory lock，记录 schema_migrations。001 兼容旧表并增加 Session、限流、文件和笔记。应用层在同一锁保护下加密旧 note，并验证所有密文，事务失败全部回滚。迁移不删除表或记录。回滚应用前需备份并恢复数据库；不提供会丢数据的自动 down。

文件对象为随机 UUID，数据库使用 uploading/ready 状态。上传临时文件独占创建、限制大小、流式 SHA-256、同步落盘后原子 rename，再提交 ready。失败清理；维护命令清理超过 24 小时的孤儿和临时文件。软删除不会立即删除磁盘对象。

## 阶段与测试

- Phase 1：配置、兼容加密、原子初始化、持久 Session、CSRF、限流、请求 schema；先写单元及集成测试。
- Phase 2：自定义 AppShell、主题和响应式导航。
- Phase 3：Secrets 元数据列表、按需解密、30 秒清除、独立编辑快照。
- Phase 4：Files 存储、文件夹/移动/回收站/恢复、Nginx 内部下载。
- Phase 5：Notes CodeMirror、版本冲突、自动保存、安全 Markdown、加密可恢复草稿。
- Phase 6：全局标题搜索、命令面板和快捷键。
- Phase 7：响应式检查、构建、集成和部署验证、备份恢复。

测试执行情况见 docs/VALIDATION.md；未运行的项目不得标记通过。

## 本次交付状态（2026-11-12）

Phase 0–6 已实现；Phase 7 的响应式、按需加载、真实 Nginx 下载、自动化回归及部署文档已完成。Docker 启动、目标 HTTPS/HTTP2、备份恢复演练和中美网络表现需在目标环境验收，未宣称通过。

为消除依赖公告，构建工具从 Vite 5 升级到兼容现有 React 插件的 Vite 6.4 修复线；Fastify 保持 5.x 并升级至 5.12.8。未改用其他框架、ORM 或部署服务。

实际 .env 已停止 Git 跟踪，内容未覆盖。PostgreSQL Session 替代旧 JWT 属明确的会话兼容断点：旧用户使用原主密码重新登录，记录 ID、原密文和原类型语义保留。完整结果见 VALIDATION.md。

## Recent（替代 Favorites）

导航、列表和编辑器中的收藏入口已移除；旧 `favorite` 字段与兼容接口保留，编辑旧密钥时保留其值。旧 Favorites 链接自动映射至 Recent。直接打开应用默认进入 Recent，不再恢复上次使用的模块；点击 Vault 标识也返回 Recent。显式模块和详情链接仍按链接打开。

新增幂等迁移 `002_recent.sql`，以模块和记录 ID 为主键保存最后使用时间与累计次数，不修改原密文、主密码或现有记录。成功获取文件详情/预览/下载、笔记正文、密钥元数据/按需解密会记录使用；列表、搜索、自动保存及失败/未授权请求不计数。同一记录两秒内的并行请求合并一次，避免详情、预览以及开发模式重复请求抬高次数。记录从升级后的首次使用开始累积，不以修改时间伪造历史。

排序由 PostgreSQL 计算：`ln(1 + use_count) × 2^(-距最后使用秒数 / 604800)`，即时间权重每七天减半，频率权重按对数增长；同分按最后使用时间、模块和 ID 稳定排序。Recent 仅返回名称、模块、类型和使用统计；回收站、未就绪文件不显示。恢复后沿用原使用记录。支持模块筛选和分页，刷新、服务重启和多设备登录后共享持久化记录。

## 七天会话与取消重复主密码验证

按后续产品要求覆盖最初的敏感操作复验策略：移除 `fresh` 校验、五分钟验证窗口和前端 428 自动重试/主密码弹窗，Secrets 全部操作及退出所有设备只要求有效登录会话。当前密码仅在明确的修改主密码流程中再次核验。旧 `verified_at` 列及 `/api/auth/reauth` 接口保留兼容历史客户端，新界面不再调用该接口，也不以 `verified_at` 限制操作。

Session 与闲置期限默认均为 604800 秒（7 天），Cookie 同步采用七天 Max-Age；配置可延长至 30 天。退出撤销、密码修改撤销全部会话、精确 Origin/CSRF 和登录限流保持有效。新期限仅用于新签发的会话；既有 Cookie 和 `expires_at` 不自动延长。部署者显式设置旧期限时需更新环境变量，详见 DEPLOYMENT.md。
