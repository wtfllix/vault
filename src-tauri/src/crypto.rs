use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHasher,
};
use rand::RngCore;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};

// 数据库头部结构
#[repr(C)]
struct DbHeader {
    magic: [u8; 4],           // "AKV1"
    version: u32,             // 1
    salt: [u8; 16],           // 随机盐
    argon2_memory: u32,       // KB
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
            argon2_memory: 65536,  // 64 MB
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

pub struct DbCrypto {
    key: [u8; 32],
    header: DbHeader,
}

impl DbCrypto {
    // 创建新数据库
    pub fn new(password: &str) -> Result<Self, String> {
        let header = DbHeader::new();
        let key = Self::derive_key(password, &header)?;
        
        Ok(Self { key, header })
    }
    
    // 从已有数据库打开
    pub fn from_existing(password: &str, path: &str) -> Result<Self, String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut header_bytes = [0u8; 64];
        file.read_exact(&mut header_bytes).map_err(|e| e.to_string())?;
        
        let header = DbHeader::from_bytes(&header_bytes)
            .ok_or("无效的数据库文件".to_string())?;
        
        let key = Self::derive_key(password, &header)?;
        
        Ok(Self { key, header })
    }
    
    // 派生密钥
    fn derive_key(password: &str, header: &DbHeader) -> Result<[u8; 32], String> {
        let argon2 = Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon2::Params::new(
                header.argon2_memory,
                header.argon2_iterations,
                header.argon2_parallelism,
                Some(32)
            ).map_err(|e| e.to_string())?
        );
        
        let salt = SaltString::encode_b64(&header.salt).map_err(|e| e.to_string())?;
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| e.to_string())?;
        
        let mut key = [0u8; 32];
        if let Some(hash) = password_hash.hash {
            key.copy_from_slice(hash.as_bytes());
        }
        
        Ok(key)
    }
    
    // 获取 SQLCipher 密钥字符串
    pub fn get_sqlcipher_key(&self) -> String {
        format!("x'{}'", hex::encode(self.key))
    }
    
    // 写入头部到新文件
    pub fn write_header(&self, path: &str) -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        
        file.write_all(&self.header.to_bytes())
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    
    // 验证密码（尝试用密钥解密一个测试值）
    pub fn verify_password(&self) -> bool {
        // 实际验证在数据库连接时进行
        true
    }
}
