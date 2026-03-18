# Windows 编译指南

## 方法 1：使用 vcpkg（推荐）

### 1. 安装依赖

```powershell
# 安装 Rust
# 访问 https://rustup.rs/ 下载安装程序

# 安装 vcpkg
git clone https://github.com/Microsoft/vcpkg.git C:\vcpkg
cd C:\vcpkg
.\bootstrap-vcpkg.bat

# 安装 SQLCipher（需要 10-20 分钟）
.\vcpkg install sqlcipher:x64-windows-static

# 设置环境变量
[Environment]::SetEnvironmentVariable("VCPKG_ROOT", "C:\vcpkg", "User")
```

### 2. 修改 Cargo.toml

将 `Cargo.toml` 中的 rusqlite 改为：

```toml
[dependencies]
rusqlite = { version = "0.31.0", features = ["bundled-sqlcipher-vendored-openssl"] }
```

### 3. 编译

```powershell
cd apikey-vault-cli
cargo build --release
```

编译后的文件：`target\release\apikey-vault.exe`

---

## 方法 2：使用预编译库

### 1. 下载 SQLCipher

从 https://github.com/sqlitebrowser/sqlitebrowser/wiki/SQLCipher-Windows 下载预编译库

### 2. 放置 DLL

将 `libcrypto-1_1-x64.dll` 和 `libsqlcipher-0.dll` 放在项目根目录

### 3. 修改 Cargo.toml

```toml
[dependencies]
rusqlite = { version = "0.31.0", features = ["sqlcipher"] }
```

### 4. 编译

```powershell
cargo build --release
```

---

## 方法 3：使用 Docker（最简单）

如果你有 Docker Desktop：

```powershell
# 使用 Linux 容器编译
docker run --rm -v ${PWD}:/app -w /app rust:latest bash -c "
  apt-get update && apt-get install -y libsqlcipher-dev
  cargo build --release
"
```

---

## 方法 4：GitHub Actions（自动化）

1. 将代码推送到 GitHub
2. 已包含 `.github/workflows/build.yml`
3. 每次推送自动编译所有平台版本
4. 在 Actions 页面下载编译好的 exe 文件

---

## 常见问题

### 错误：找不到 sqlcipher.h

确保设置了 `VCPKG_ROOT` 环境变量，或修改 `.cargo/config.toml`：

```toml
[env]
VCPKG_ROOT = "C:\\vcpkg"
```

### 错误：链接失败

尝试使用 `x64 Native Tools Command Prompt for VS 2022` 运行 cargo

### 减小体积

```powershell
cargo build --release --features=\"strip\"
# 或使用 UPX 压缩
upx target\release\apikey-vault.exe
```
