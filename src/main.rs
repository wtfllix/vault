use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHasher,
};
use rand::RngCore;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;

// 数据库头部
#[repr(C)]
struct DbHeader {
    magic: [u8; 4],
    version: u32,
    salt: [u8; 16],
    argon2_memory: u32,
    argon2_iterations: u32,
    argon2_parallelism: u32,
    reserved: [u8; 32],
}

impl DbHeader {
    fn new() -> Self {
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        Self {
            magic: *b"AKV1",
            version: 1,
            salt,
            argon2_memory: 65536,
            argon2_iterations: 3,
            argon2_parallelism: 4,
            reserved: [0; 32],
        }
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(64);
        bytes.extend_from_slice(&self.magic);
        bytes.extend_from_slice(&self.version.to_le_bytes());
        bytes.extend_from_slice(&self.salt);
        bytes.extend_from_slice(&self.argon2_memory.to_le_bytes());
        bytes.extend_from_slice(&self.argon2_iterations.to_le_bytes());
        bytes.extend_from_slice(&self.argon2_parallelism.to_le_bytes());
        bytes.extend_from_slice(&self.reserved);
        bytes
    }

    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 64 || &bytes[0..4] != b"AKV1" {
            return None;
        }
        let mut salt = [0u8; 16];
        salt.copy_from_slice(&bytes[8..24]);
        Some(Self {
            magic: [b'A', b'K', b'V', b'1'],
            version: u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
            salt,
            argon2_memory: u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]),
            argon2_iterations: u32::from_le_bytes([bytes[28], bytes[29], bytes[30], bytes[31]]),
            argon2_parallelism: u32::from_le_bytes([bytes[32], bytes[33], bytes[34], bytes[35]]),
            reserved: [0; 32],
        })
    }
}

fn derive_key(password: &str, header: &DbHeader) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    let argon2 = Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        argon2::Params::new(
            header.argon2_memory,
            header.argon2_iterations,
            header.argon2_parallelism,
            Some(32)
        ).map_err(|e| format!("Argon2 params error: {}", e))?
    );

    let salt = SaltString::encode_b64(&header.salt)
        .map_err(|e| format!("Salt error: {}", e))?;
    let password_hash = argon2.hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Hash error: {}", e))?;

    let mut key = [0u8; 32];
    if let Some(hash) = password_hash.hash {
        key.copy_from_slice(hash.as_bytes());
    }
    Ok(key)
}

fn create_db(path: &str, password: &str) -> Result<Connection, Box<dyn std::error::Error>> {
    let header = DbHeader::new();
    let key = derive_key(password, &header)?;

    // 写入头部
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    file.write_all(&header.to_bytes())?;
    drop(file);

    // 打开加密数据库
    let conn = Connection::open(path)?;
    let key_hex = format!("x'{}'", hex::encode(key));
    conn.execute(&format!("PRAGMA key = {}", key_hex), [])?;

    // 创建表
    conn.execute(
        "CREATE TABLE secrets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            secret_type TEXT NOT NULL,
            name TEXT NOT NULL,
            encrypted_data TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    Ok(conn)
}

fn open_db(path: &str, password: &str) -> Result<Connection, Box<dyn std::error::Error>> {
    let mut file = File::open(path)?;
    let mut header_bytes = [0u8; 64];
    file.read_exact(&mut header_bytes)?;

    let header = DbHeader::from_bytes(&header_bytes)
        .ok_or("无效的数据库文件")?;

    let key = derive_key(password, &header)?;

    let conn = Connection::open(path)?;
    let key_hex = format!("x'{}'", hex::encode(key));
    conn.execute(&format!("PRAGMA key = {}", key_hex), [])?;

    // 验证密码
    conn.query_row("SELECT 1 FROM sqlite_master LIMIT 1", [], |_| Ok(()))?;

    Ok(conn)
}

#[derive(Serialize, Deserialize)]
struct Secret {
    id: i64,
    secret_type: String,
    name: String,
    encrypted_data: String,
    note: String,
    created_at: String,
}

fn add_secret(conn: &Connection, secret_type: &str, name: &str, data: &str, note: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO secrets (secret_type, name, encrypted_data, note) VALUES (?1, ?2, ?3, ?4)",
        [secret_type, name, data, note],
    )?;
    Ok(conn.last_insert_rowid())
}

fn list_secrets(conn: &Connection) -> Result<Vec<Secret>> {
    let mut stmt = conn.prepare(
        "SELECT id, secret_type, name, encrypted_data, note, created_at FROM secrets ORDER BY created_at DESC"
    )?;

    let secrets = stmt.query_map([], |row| {
        Ok(Secret {
            id: row.get(0)?,
            secret_type: row.get(1)?,
            name: row.get(2)?,
            encrypted_data: row.get(3)?,
            note: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>>>()?;

    Ok(secrets)
}

fn delete_secret(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM secrets WHERE id = ?1", [id])?;
    Ok(())
}

fn main() {
    println!("API Key 保险箱 - CLI 版本\n");

    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        println!("用法:");
        println!("  {} create <数据库路径>  - 创建新数据库", args[0]);
        println!("  {} open <数据库路径>    - 打开数据库", args[0]);
        return;
    }

    let command = &args[1];
    let db_path = args.get(2).map(|s| s.as_str()).unwrap_or("vault.db");

    match command.as_str() {
        "create" => {
            print!("设置主密码: ");
            io::stdout().flush().unwrap();
            let password = read_password();

            match create_db(db_path, &password) {
                Ok(_) => println!("数据库创建成功: {}", db_path),
                Err(e) => println!("创建失败: {}", e),
            }
        }
        "open" => {
            if !Path::new(db_path).exists() {
                println!("数据库不存在: {}", db_path);
                return;
            }

            print!("输入主密码: ");
            io::stdout().flush().unwrap();
            let password = read_password();

            match open_db(db_path, &password) {
                Ok(conn) => {
                    println!("数据库打开成功！\n");
                    run_cli(conn);
                }
                Err(e) => println!("打开失败 (密码错误或文件损坏): {}", e),
            }
        }
        _ => println!("未知命令: {}", command),
    }
}

fn read_password() -> String {
    let mut password = String::new();
    io::stdin().read_line(&mut password).unwrap();
    password.trim().to_string()
}

fn run_cli(conn: Connection) {
    loop {
        println!("\n选项:");
        println!("1. 添加密钥");
        println!("2. 列出密钥");
        println!("3. 删除密钥");
        println!("4. 退出");
        print!("选择: ");
        io::stdout().flush().unwrap();

        let mut choice = String::new();
        io::stdin().read_line(&mut choice).unwrap();

        match choice.trim() {
            "1" => add_secret_cli(&conn),
            "2" => list_secrets_cli(&conn),
            "3" => delete_secret_cli(&conn),
            "4" => break,
            _ => println!("无效选择"),
        }
    }
}

fn add_secret_cli(conn: &Connection) {
    print!("类型 (apikey/password/database/ssh/custom): ");
    io::stdout().flush().unwrap();
    let mut secret_type = String::new();
    io::stdin().read_line(&mut secret_type).unwrap();

    print!("名称: ");
    io::stdout().flush().unwrap();
    let mut name = String::new();
    io::stdin().read_line(&mut name).unwrap();

    print!("数据 (JSON 格式): ");
    io::stdout().flush().unwrap();
    let mut data = String::new();
    io::stdin().read_line(&mut data).unwrap();

    print!("备注: ");
    io::stdout().flush().unwrap();
    let mut note = String::new();
    io::stdin().read_line(&mut note).unwrap();

    match add_secret(conn, secret_type.trim(), name.trim(), data.trim(), note.trim()) {
        Ok(id) => println!("添加成功，ID: {}", id),
        Err(e) => println!("添加失败: {}", e),
    }
}

fn list_secrets_cli(conn: &Connection) {
    match list_secrets(conn) {
        Ok(secrets) => {
            if secrets.is_empty() {
                println!("没有密钥");
                return;
            }
            println!("\n{:<5} {:<12} {:<20} {:<30}", "ID", "类型", "名称", "数据");
            println!("{}", "-".repeat(70));
            for s in secrets {
                let data_preview = if s.encrypted_data.len() > 25 {
                    format!("{}...", &s.encrypted_data[..25])
                } else {
                    s.encrypted_data.clone()
                };
                println!("{:<5} {:<12} {:<20} {:<30}", s.id, s.secret_type, s.name, data_preview);
            }
        }
        Err(e) => println!("查询失败: {}", e),
    }
}

fn delete_secret_cli(conn: &Connection) {
    print!("输入要删除的 ID: ");
    io::stdout().flush().unwrap();
    let mut id_str = String::new();
    io::stdin().read_line(&mut id_str).unwrap();

    if let Ok(id) = id_str.trim().parse::<i64>() {
        match delete_secret(conn, id) {
            Ok(_) => println!("删除成功"),
            Err(e) => println!("删除失败: {}", e),
        }
    } else {
        println!("无效的 ID");
    }
}
