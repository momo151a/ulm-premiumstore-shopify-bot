"use strict";

const Database = require("better-sqlite3");
const { config } = require("../config");

let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(config.dbPath);
    _db.pragma("journal_mode = WAL"); // 並行書き込み対策
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id         TEXT PRIMARY KEY,
      order_number     TEXT NOT NULL,
      created_at_jst   TEXT NOT NULL,
      customer_name    TEXT,
      customer_email   TEXT,
      customer_phone   TEXT,
      customer_address TEXT,
      total_vendors    INTEGER DEFAULT 0,
      status           TEXT DEFAULT 'received',
      error_reason     TEXT,
      processed_at     TEXT NOT NULL,
      slack_thread_ts  TEXT
    );

    CREATE TABLE IF NOT EXISTS vendor_orders (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id                TEXT NOT NULL,
      vendor_row              INTEGER NOT NULL,
      vendor_name             TEXT NOT NULL,
      vendor_emails           TEXT NOT NULL,
      fulfillment_order_id    TEXT,
      line_item_ids           TEXT NOT NULL,
      email_sent_at           TEXT,
      tracking_number         TEXT,
      carrier                 TEXT,
      shipped_at              TEXT,
      shopify_fulfillment_id  TEXT,
      customer_notified_at    TEXT,
      delayed_reason          TEXT,
      delayed_at              TEXT,
      item_names              TEXT,
      status                  TEXT DEFAULT 'pending',
      FOREIGN KEY (order_id) REFERENCES orders(order_id)
    );

    CREATE TABLE IF NOT EXISTS processed_form_submissions (
      submission_id TEXT PRIMARY KEY,
      processed_at  TEXT NOT NULL
    );
  `);

  // 既存 DB へのマイグレーション（カラム追加）
  try { db.exec("ALTER TABLE orders ADD COLUMN slack_thread_ts TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE vendor_orders ADD COLUMN item_names TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE vendor_orders ADD COLUMN stale_notified_at TEXT"); } catch (_) {}

  console.log("[db] スキーマ初期化完了");
  return db;
}

module.exports = { initDb, getDb };
