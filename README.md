# Vault - API Key 保险箱

一个简单、安全、跨平台的命令行密钥管理工具，专为技术人员设计。

## 特性

- 🔐 **安全加密** - 使用 Argon2id + SQLCipher AES-256 加密，数据库文件泄露也无法破解
- 💻 **跨平台** - 支持 Windows、macOS、Linux
- 📦 **单文件** - 无需安装，单个可执行文件即可运行
- 🔑 **多类型支持** - API Key、账号密码、数据库连接、SSH 密钥、自定义
- 🚀 **快速访问** - 命令行界面，高效操作
- 💾 **数据同步** - 数据库文件可放在云盘或服务器，多设备同步

## 下载安装

### 从 Releases 下载

访问 [Releases](https://github.com/wtfllix/vault/releases) 页面下载对应平台的可执行文件。

### 各平台

| 平台 | 文件 |
|------|------|
| Windows | `vault-windows-x64.exe` |
| macOS | `vault-macos-x64` |
| Linux | `vault-linux-x64` |

## 使用方法

### 创建新数据库

```bash
# 创建加密数据库
./vaultt create my-vault.db

# 设置主密码（务必牢记，忘记无法恢复）
```

### 打开数据库

```bash
./vaultt open my-vault.db

# 输入主密码
```

### 交互式菜单

```
选项:
1. 添加密钥
2. 列出密钥
3. 删除密钥
4. 退出
```

### 支持的密钥类型

#### 1. API Key
```json
{
  "key": "sk-xxxxxxxxxxxx"
}
```

#### 2. 账号密码
```json
{
  "url": "https://example.com",
  "username": "admin",
  "password": "xxxxxxxx"
}
```

#### 3. 数据库连接
```json
{
  "type": "MySQL",
  "host": "localhost",
  "port": 3306,
  "username": "root",
  "password": "xxxxxxxx",
  "database": "mydb"
}
```

#### 4. SSH 密钥
```json
{
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "publicKey": "ssh-rsa AAAA...",
  "passphrase": "optional"
}
```

#### 5. 自定义
```json
{
  "content": "任意文本内容"
}
```

## 数据同步

### 使用云盘同步

将数据库文件放在云盘同步目录：

```bash
# Dropbox
./vaultt open ~/Dropbox/vaultt.db

# iCloud
./vaultt open ~/Library/Mobile\ Documents/com~apple~CloudDocs/vaultt.db

# OneDrive
./vaultt open ~/OneDrive/vaultt.db
```

### 使用 MinIO/S3

```bash
# 下载数据库
mc cp myminio/vaultt/data.db ./vaultt.db
./vaultt open vaultt.db

# 使用完后上传
mc cp vaultt.db myminio/vaultt/data.db
```

### 使用 SFTP

```bash
# 下载
scp user@server:/path/vaultt.db ./vaultt.db
./vaultt open vaultt.db

# 上传
scp ./vaultt.db user@server:/path/vaultt.db
```

## 安全说明

### 加密方案

1. **密钥派生** - 使用 Argon2id 从主密码派生加密密钥
   - 内存消耗：64 MB
   - 迭代次数：3
   - 并行度：4

2. **数据库加密** - SQLCipher AES-256-CBC
   - 整个数据库文件加密
   - 包括表结构、索引、数据

3. **安全特性**
   - 无固定密钥存储在代码中
   - 随机盐值，防止彩虹表攻击
   - 密码错误无法打开数据库

### 密码建议

- 使用 12 位以上强密码
- 包含大小写字母、数字、特殊字符
- 定期更换主密码（通过导出/导入）

### 备份建议

```bash
# 定期备份
cp vaultt.db vaultt-backup-$(date +%Y%m%d).db

# 或者导出为 JSON（在应用内操作）
```

## 编译源码

### 依赖

- Rust 1.70+
- SQLite3 / SQLCipher

### 编译步骤

```bash
# 克隆仓库
git clone https://github.com/wtfllix/vault.git
cd vaultt

# 编译
cargo build --release

# 可执行文件在 target/release/vaultt
```

### 交叉编译

```bash
# Windows (在 Linux 上)
cargo build --release --target x86_64-pc-windows-gnu

# macOS (在 Linux 上，需要 osxcross)
cargo build --release --target x86_64-apple-darwin
```

## 技术栈

- **语言**: Rust
- **数据库**: SQLite + SQLCipher
- **加密**: Argon2id, AES-256-CBC
- **CI/CD**: GitHub Actions

## 项目结构

```
vaultt/
├── src/
│   └── main.rs          # 主程序
├── .github/
│   └── workflows/
│       └── build.yml    # 自动构建
├── Cargo.toml           # Rust 依赖
└── README.md            # 本文件
```

## 路线图

- [ ] Tauri GUI 版本
- [ ] 浏览器插件
- [ ] 移动端 App
- [ ] 密码生成器
- [ ] 自动填充
- [ ] 生物识别解锁

## 贡献

欢迎提交 Issue 和 PR！

## 许可证

MIT License

## 致谢

- [rusqlite](https://github.com/rusqlite/rusqlite) - SQLite 绑定
- [SQLCipher](https://www.zetetic.net/sqlcipher/) - 数据库加密
- [Argon2](https://github.com/P-H-C/phc-winner-argon2) - 密码哈希

---

**注意**: 请务必牢记主密码，忘记密码将导致数据永久丢失！
