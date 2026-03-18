use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHasher,
};
use rand::RngCore;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::fs;

#[derive(Serialize, Deserialize)]
struct Secret {
    id: i64,
    secret_type: String,
    name: String,
    encrypted_data: String,
    note: String,
    created_at: String,
}

#[derive(Serialize, Deserialize)]
struct DbConfig {
    salt: String,
    nonce: String,
    encrypted: bool,
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let argon2 = Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        argon2::Params::new(65536, 3, 4, Some(32))
            .map_err(|e| format!("Argon2 params error: {}", e))?
    );

    let salt_str = SaltString::encode_b64(salt)
        .map_err(|e| format!("Salt error: {}", e))?;
    let password_hash = argon2.hash_password(password.as_bytes(), &salt_str)
        .map_err(|e| format!("Hash error: {}", e))?;

    let mut key = [0u8; 32];
    if let Some(hash) = password_hash.hash {
        key.copy_from_slice(hash.as_bytes());
    }
    Ok(key)
}

fn encrypt(data: &str, key: &[u8; 32]) -> Result<(String, String), String> {
    let cipher = Aes256Gcm::new(key.into());
    
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let encrypted = cipher.encrypt(nonce, data.as_bytes())
        .map_err(|e| format!("加密失败: {}", e))?;
    
    Ok((base64::encode(&encrypted), hex::encode(&nonce_bytes)))
}

fn decrypt(encrypted_b64: &str, nonce_hex: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(key.into());
    
    let encrypted = base64::decode(encrypted_b64)
        .map_err(|e| format!("解码失败: {}", e))?;
    let nonce_bytes = hex::decode(nonce_hex)
        .map_err(|e| format!("解码nonce失败: {}", e))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let decrypted = cipher.decrypt(nonce, encrypted.as_ref())
        .map_err(|_| "解密失败，密码错误".to_string())?;
    
    String::from_utf8(decrypted)
        .map_err(|e| format!("UTF8解码失败: {}", e))
}

fn create_db(path: &str, password: &str) -> Result<(Connection, [u8; 32], String), String> {
    // 生成随机盐
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    
    // 派生密钥
    let key = derive_key(password, &salt)?;
    
    // 创建数据库
    let conn = Connection::open(path)
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    
    // 创建表
    conn.execute(
        "CREATE TABLE secrets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            secret_type TEXT NOT NULL,
            name TEXT NOT NULL,
            encrypted_data TEXT NOT NULL,
            data_nonce TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).map_err(|e| format!("创建表失败: {}", e))?;
    
    // 存储配置
    let config = DbConfig {
        salt: hex::encode(&salt),
        nonce: hex::encode(&[0u8; 12]), // 占位
        encrypted: true,
    };
    
    fs::write(format!("{}.config", path), serde_json::to_string(&config).unwrap())
        .map_err(|e| format!("写入配置失败: {}", e))?;
    
    Ok((conn, key, hex::encode(&salt)))
}

fn open_db(path: &str, password: &str) -> Result<(Connection, [u8; 32]), String> {
    // 读取配置
    let config_str = fs::read_to_string(format!("{}.config", path))
        .map_err(|_| "数据库配置不存在".to_string())?;
    let config: DbConfig = serde_json::from_str(&config_str)
        .map_err(|_| "无效的数据库配置".to_string())?;
    
    let salt = hex::decode(&config.salt)
        .map_err(|_| "无效的盐值".to_string())?;
    
    // 派生密钥
    let key = derive_key(password, &salt)?;
    
    // 打开数据库
    let conn = Connection::open(path)
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    
    // 验证密码（尝试解密一条记录）
    let test: Result<String, _> = conn.query_row(
        "SELECT encrypted_data FROM secrets LIMIT 1",
        [],
        |row| row.get(0)
    );
    
    if let Ok(data) = test {
        let nonce: String = conn.query_row(
            "SELECT data_nonce FROM secrets LIMIT 1",
            [],
            |row| row.get(0)
        ).unwrap_or_default();
        
        if !data.is_empty() && decrypt(&data, &nonce, &key).is_err() {
            return Err("密码错误".to_string());
        }
    }
    
    Ok((conn, key))
}

fn add_secret(conn: &Connection, key: &[u8; 32], secret_type: &str, name: &str, data: &str, note: &str) -> Result<i64, String> {
    let (encrypted, nonce) = encrypt(data, key)?;
    
    conn.execute(
        "INSERT INTO secrets (secret_type, name, encrypted_data, data_nonce, note) VALUES (?1, ?2, ?3, ?4, ?5)",
        [secret_type, name, &encrypted, &nonce, note],
    ).map_err(|e| format!("插入失败: {}", e))?;
    
    Ok(conn.last_insert_rowid())
}

fn list_secrets(conn: &Connection, key: &[u8; 32]) -> Result<Vec<Secret>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, secret_type, name, encrypted_data, data_nonce, note, created_at FROM secrets ORDER BY created_at DESC"
    ).map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
        ))
    }).map_err(|e| format!("查询失败: {}", e))?;

    let mut secrets = Vec::new();
    for row in rows {
        let (id, secret_type, name, encrypted_data, nonce, note, created_at) = row.map_err(|e| format!("读取行失败: {}", e))?;
        
        // 解密数据用于显示
        let decrypted = decrypt(&encrypted_data, &nonce, key).unwrap_or_else(|_| "***".to_string());
        let preview = if decrypted.len() > 30 {
            format!("{}...", &decrypted[..30])
        } else {
            decrypted
        };
        
        secrets.push(Secret {
            id,
            secret_type,
            name,
            encrypted_data: preview,
            note,
            created_at,
        });
    }

    Ok(secrets)
}

fn get_secret_detail(conn: &Connection, key: &[u8; 32], id: i64) -> Result<(Secret, String), String> {
    let mut stmt = conn.prepare(
        "SELECT id, secret_type, name, encrypted_data, data_nonce, note, created_at FROM secrets WHERE id = ?1"
    ).map_err(|e| format!("准备查询失败: {}", e))?;

    let (id, secret_type, name, encrypted_data, nonce, note, created_at) = stmt.query_row([id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
        ))
    }).map_err(|e| format!("查询失败: {}", e))?;

    let decrypted = decrypt(&encrypted_data, &nonce, key)?;

    Ok((Secret {
        id,
        secret_type: secret_type.clone(),
        name: name.clone(),
        encrypted_data: decrypted.clone(),
        note: note.clone(),
        created_at,
    }, decrypted))
}

fn delete_secret(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM secrets WHERE id = ?1", [id])
        .map_err(|e| format!("删除失败: {}", e))?;
    Ok(())
}

fn read_password() -> String {
    let mut password = String::new();
    io::stdin().read_line(&mut password).unwrap();
    password.trim().to_string()
}

fn run_cli(conn: Connection, key: [u8; 32]) {
    loop {
        println!("\n选项:");
        println!("1. 添加密钥");
        println!("2. 列出密钥");
        println!("3. 查看密钥详情");
        println!("4. 删除密钥");
        println!("5. 退出");
        print!("选择: ");
        io::stdout().flush().unwrap();

        let mut choice = String::new();
        io::stdin().read_line(&mut choice).unwrap();

        match choice.trim() {
            "1" => add_secret_cli(&conn, &key),
            "2" => list_secrets_cli(&conn, &key),
            "3" => view_secret_cli(&conn, &key),
            "4" => delete_secret_cli(&conn),
            "5" => break,
            _ => println!("无效选择"),
        }
    }
}

fn add_secret_cli(conn: &Connection, key: &[u8; 32]) {
    print!("类型 (apikey/password/database/ssh/custom): ");
    io::stdout().flush().unwrap();
    let mut secret_type = String::new();
    io::stdin().read_line(&mut secret_type).unwrap();

    print!("名称: ");
    io::stdout().flush().unwrap();
    let mut name = String::new();
    io::stdin().read_line(&mut name).unwrap();

    println!("请输入数据（多行输入，输入空行结束）：");
    let mut data_lines = Vec::new();
    loop {
        let mut line = String::new();
        io::stdin().read_line(&mut line).unwrap();
        if line.trim().is_empty() {
            break;
        }
        data_lines.push(line);
    }
    let data = data_lines.join("").trim().to_string();

    print!("备注: ");
    io::stdout().flush().unwrap();
    let mut note = String::new();
    io::stdin().read_line(&mut note).unwrap();

    match add_secret(conn, key, secret_type.trim(), name.trim(), &data, note.trim()) {
        Ok(id) => println!("添加成功，ID: {}", id),
        Err(e) => println!("添加失败: {}", e),
    }
}

fn list_secrets_cli(conn: &Connection, key: &[u8; 32]) {
    match list_secrets(conn, key) {
        Ok(secrets) => {
            if secrets.is_empty() {
                println!("没有密钥");
                return;
            }
            println!("\n{:<5} {:<12} {:<20} {:<30}", "ID", "类型", "名称", "内容预览");
            println!("{}", "-".repeat(70));
            for s in secrets {
                println!("{:<5} {:<12} {:<20} {:<30}", s.id, s.secret_type, s.name, s.encrypted_data);
            }
        }
        Err(e) => println!("查询失败: {}", e),
    }
}

fn view_secret_cli(conn: &Connection, key: &[u8; 32]) {
    print!("输入要查看的 ID: ");
    io::stdout().flush().unwrap();
    let mut id_str = String::new();
    io::stdin().read_line(&mut id_str).unwrap();

    if let Ok(id) = id_str.trim().parse::<i64>() {
        match get_secret_detail(conn, key, id) {
            Ok((secret, decrypted)) => {
                println!("\n=== 密钥详情 ===");
                println!("ID: {}", secret.id);
                println!("类型: {}", secret.secret_type);
                println!("名称: {}", secret.name);
                println!("数据: {}", decrypted);
                if !secret.note.is_empty() {
                    println!("备注: {}", secret.note);
                }
                println!("创建时间: {}", secret.created_at);
            }
            Err(e) => println!("查看失败: {}", e),
        }
    } else {
        println!("无效的 ID");
    }
}

fn delete_secret_cli(conn: &Connection) {
    print!("输入要删除的 ID: ");
    io::stdout().flush().unwrap();
    let mut id_str = String::new();
    io::stdin().read_line(&mut id_str).unwrap();

    if let Ok(id) = id_str.trim().parse::<i64>() {
        print!("确认删除 ID {}? (y/N): ", id);
        io::stdout().flush().unwrap();
        let mut confirm = String::new();
        io::stdin().read_line(&mut confirm).unwrap();
        
        if confirm.trim().to_lowercase() == "y" {
            match delete_secret(conn, id) {
                Ok(_) => println!("删除成功"),
                Err(e) => println!("删除失败: {}", e),
            }
        }
    } else {
        println!("无效的 ID");
    }
}

fn main() {
    println!("Vault - API Key 保险箱 (CLI 版)\n");

    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        println!("用法:");
        println!("  vault create <数据库路径>  - 创建新数据库");
        println!("  vault open <数据库路径>    - 打开数据库");
        return;
    }

    let command = &args[1];
    let db_path = args.get(2).map(|s| s.as_str()).unwrap_or("vault.db");

    match command.as_str() {
        "create" => {
            if std::path::Path::new(db_path).exists() {
                println!("数据库已存在: {}", db_path);
                return;
            }

            print!("设置主密码: ");
            io::stdout().flush().unwrap();
            let password = read_password();

            if password.is_empty() {
                println!("密码不能为空");
                return;
            }

            print!("确认主密码: ");
            io::stdout().flush().unwrap();
            let confirm = read_password();

            if password != confirm {
                println!("两次输入的密码不一致");
                return;
            }

            match create_db(db_path, &password) {
                Ok((conn, key, _)) => {
                    println!("数据库创建成功: {}", db_path);
                    println!("请牢记主密码，忘记将无法恢复数据！");
                    println!("\n是否立即添加密钥? (y/N)");
                    let mut add = String::new();
                    io::stdin().read_line(&mut add).unwrap();
                    if add.trim().to_lowercase() == "y" {
                        run_cli(conn, key);
                    }
                }
                Err(e) => println!("创建失败: {}", e),
            }
        }
        "open" => {
            if !std::path::Path::new(db_path).exists() {
                println!("数据库不存在: {}", db_path);
                return;
            }

            print!("输入主密码: ");
            io::stdout().flush().unwrap();
            let password = read_password();

            match open_db(db_path, &password) {
                Ok((conn, key)) => {
                    println!("数据库打开成功！\n");
                    run_cli(conn, key);
                }
                Err(e) => println!("打开失败: {}", e),
            }
        }
        _ => println!("未知命令: {}", command),
    }
}
