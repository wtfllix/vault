use rusqlite::{Connection, Result};
use crate::crypto::DbCrypto;

pub struct Database {
    conn: Connection,
}

impl Database {
    // 打开或创建数据库
    pub fn open(path: &str, crypto: &DbCrypto) -> Result<Self> {
        // 检查是否是新数据库
        let is_new = !std::path::Path::new(path).exists();
        
        if is_new {
            // 创建新数据库，写入头部
            crypto.write_header(path)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(1),
                    Some(e.to_string())
                ))?;
        }
        
        // 打开数据库
        let conn = Connection::open(path)?;
        
        // 设置 SQLCipher 密钥
        let key = crypto.get_sqlcipher_key();
        conn.execute_batch(&format!("PRAGMA key = \"{}\";", key))?;
        
        // 验证密钥（尝试查询）
        conn.execute("SELECT count(*) FROM sqlite_master", [])
            .map_err(|_| rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(26),
                Some("密码错误".to_string())
            ))?;
        
        // 初始化表结构
        let db = Self { conn };
        db.init_tables()?;
        
        Ok(db)
    }
    
    // 初始化表
    fn init_tables(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS secrets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                secret_type TEXT NOT NULL,
                name TEXT NOT NULL,
                encrypted_data TEXT NOT NULL,
                note TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        
        // 创建索引
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_type ON secrets(secret_type)",
            [],
        )?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_name ON secrets(name)",
            [],
        )?;
        
        Ok(())
    }
    
    // 获取所有密钥（不含敏感数据）
    pub fn get_secrets(&self) -> Result<Vec<crate::Secret>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, secret_type, name, encrypted_data, note, created_at 
             FROM secrets 
             ORDER BY created_at DESC"
        )?;
        
        let secrets = stmt.query_map([], |row| {
            Ok(crate::Secret {
                id: row.get(0)?,
                secret_type: row.get(1)?,
                name: row.get(2)?,
                encrypted_data: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(secrets)
    }
    
    // 添加密钥
    pub fn add_secret(&self, secret_type: &str, name: &str, encrypted_data: &str, note: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO secrets (secret_type, name, encrypted_data, note) 
             VALUES (?1, ?2, ?3, ?4)",
            [secret_type, name, encrypted_data, note],
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    // 删除密钥
    pub fn delete_secret(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM secrets WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }
    
    // 获取单个密钥详情
    pub fn get_secret_by_id(&self, id: i64) -> Result<crate::Secret> {
        let mut stmt = self.conn.prepare(
            "SELECT id, secret_type, name, encrypted_data, note, created_at 
             FROM secrets 
             WHERE id = ?1"
        )?;
        
        let secret = stmt.query_row([id], |row| {
            Ok(crate::Secret {
                id: row.get(0)?,
                secret_type: row.get(1)?,
                name: row.get(2)?,
                encrypted_data: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        
        Ok(secret)
    }
    
    // 搜索密钥
    pub fn search_secrets(&self, query: &str) -> Result<Vec<crate::Secret>> {
        let pattern = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, secret_type, name, encrypted_data, note, created_at 
             FROM secrets 
             WHERE name LIKE ?1 OR note LIKE ?1 OR secret_type LIKE ?1
             ORDER BY created_at DESC"
        )?;
        
        let secrets = stmt.query_map([&pattern], |row| {
            Ok(crate::Secret {
                id: row.get(0)?,
                secret_type: row.get(1)?,
                name: row.get(2)?,
                encrypted_data: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(secrets)
    }
}
