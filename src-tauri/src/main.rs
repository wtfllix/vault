#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;
mod db;

use crypto::DbCrypto;
use db::Database;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

struct AppState {
    db: Mutex<Option<Database>>,
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

#[derive(Serialize, Deserialize)]
struct NewSecret {
    secret_type: String,
    name: String,
    data: serde_json::Value,
    note: String,
}

// 初始化数据库（创建新数据库或打开已有）
#[tauri::command]
fn init_db(password: String, path: String, state: State<AppState>) -> Result<(), String> {
    let crypto = DbCrypto::new(&password).map_err(|e| e.to_string())?;
    let db = Database::open(&path, &crypto).map_err(|e| e.to_string())?;
    
    let mut state_db = state.db.lock().unwrap();
    *state_db = Some(db);
    
    Ok(())
}

// 检查数据库是否存在
#[tauri::command]
fn db_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// 获取所有密钥
#[tauri::command]
fn get_secrets(state: State<AppState>) -> Result<Vec<Secret>, String> {
    let state_db = state.db.lock().unwrap();
    let db = state_db.as_ref().ok_or("数据库未初始化")?;
    
    db.get_secrets().map_err(|e| e.to_string())
}

// 添加密钥
#[tauri::command]
fn add_secret(secret: NewSecret, state: State<AppState>) -> Result<i64, String> {
    let state_db = state.db.lock().unwrap();
    let db = state_db.as_ref().ok_or("数据库未初始化")?;
    
    let encrypted_data = serde_json::to_string(&secret.data).map_err(|e| e.to_string())?;
    
    db.add_secret(&secret.secret_type, &secret.name, &encrypted_data, &secret.note)
        .map_err(|e| e.to_string())
}

// 删除密钥
#[tauri::command]
fn delete_secret(id: i64, state: State<AppState>) -> Result<(), String> {
    let state_db = state.db.lock().unwrap();
    let db = state_db.as_ref().ok_or("数据库未初始化")?;
    
    db.delete_secret(id).map_err(|e| e.to_string())
}

// 获取密钥详情
#[tauri::command]
fn get_secret_detail(id: i64, state: State<AppState>) -> Result<Secret, String> {
    let state_db = state.db.lock().unwrap();
    let db = state_db.as_ref().ok_or("数据库未初始化")?;
    
    db.get_secret_by_id(id).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            init_db,
            db_exists,
            get_secrets,
            add_secret,
            delete_secret,
            get_secret_detail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
