// YZK: node test_db.js 

import Database from 'better-sqlite3';
import * as vec from 'sqlite-vec';
import fs from 'node:fs';
import path from 'node:path';

// 設定資料庫路徑（對應你原本 db.js 的設定）
const file = process.env.DB_PATH || '../../../data/app.db';
const db = new Database(file);

// 啟用 WAL 與外鍵
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 載入 sqlite-vec 擴充功能
try {
    vec.load(db);
    console.log("成功載入 sqlite-vec 擴充功能！");
} catch (e) {
    console.warn("載入 sqlite-vec 失敗或已載入:", e.message);
}

// ==========================================
// 1. 測試：檢查現有的資料表
// ==========================================
console.log("\n--- 目前資料庫中的表格清單 ---");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all();
console.log(tables.map(t => t.name));

// ==========================================
// 2. 清理動作：刪除 vec 虛擬表格
// ==========================================
// 如果你想手動清除 summary_vec 與 memory_vec，可以解除下方註解執行：

console.log("\正在刪除舊的向量虛擬表格...");
db.exec(`
    DROP TABLE IF EXISTS summary_vec;
    DROP TABLE IF EXISTS memory_vec;
`);
console.log("已成功刪除 summary_vec 與 memory_vec！");


// ==========================================
// 3. 測試：重新建立 vec 虛擬表格（示範 384 維）
// ==========================================
/*
const dim = 384; // 配合你的 embedding 模型維度
db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS summary_vec USING vec0(
        summary_id INTEGER PRIMARY KEY,
        embedding FLOAT[${dim}] distance_metric=cosine
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
        user_id INTEGER,
        memory_id INTEGER PRIMARY KEY,
        embedding FLOAT[${dim}] distance_metric=cosine
    );
`);
console.log(`已成功重建維度為 ${dim} 的向量虛擬表格！`);
*/

// 關閉連線
db.close();
console.log("\n資料庫測試與操作完成。");
