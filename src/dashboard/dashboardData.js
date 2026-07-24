"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const { getDb } = require("../db/init");
const { TZ, STALE_BUSINESS_DAYS, subtractBusinessDays } = require("../utils/businessDays");

function safeParse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (_) {
    return json;
  }
}

// 「滞留」判定のカットオフ（現在から STALE_BUSINESS_DAYS 営業日前の UTC ISO）
function staleCutoff() {
  return subtractBusinessDays(dayjs().tz(TZ), STALE_BUSINESS_DAYS).toISOString();
}

// 滞留（出荷依頼済み・未返信・3営業日超）の vendor_orders 一覧
function getStaleVendorOrders() {
  const cutoff = staleCutoff();
  return getDb()
    .prepare(
      `SELECT vo.id, vo.order_id, vo.vendor_name, vo.email_sent_at, o.order_number
       FROM vendor_orders vo
       JOIN orders o USING(order_id)
       WHERE vo.status = 'emailed'
         AND vo.email_sent_at IS NOT NULL
         AND vo.email_sent_at < ?
       ORDER BY vo.email_sent_at ASC`
    )
    .all(cutoff);
}

function staleOrderIdSet() {
  return new Set(getStaleVendorOrders().map((r) => r.order_id));
}

// 注文一覧（ベンダー状態の集計つき）
function getOrdersOverview() {
  const orders = getDb()
    .prepare(
      `SELECT o.order_id, o.order_number, o.created_at_jst, o.customer_name,
              o.status AS order_status, o.total_vendors, o.error_reason,
              COUNT(vo.id)                                                   AS vendor_count,
              SUM(CASE WHEN vo.status IN ('shipped','fulfilled') THEN 1 ELSE 0 END) AS done_count,
              SUM(CASE WHEN vo.status = 'delayed' THEN 1 ELSE 0 END)         AS delayed_count,
              SUM(CASE WHEN vo.status = 'emailed' THEN 1 ELSE 0 END)         AS waiting_count
       FROM orders o
       LEFT JOIN vendor_orders vo USING(order_id)
       GROUP BY o.order_id
       ORDER BY o.created_at_jst DESC`
    )
    .all();

  const staleIds = staleOrderIdSet();
  return orders.map((o) => ({ ...o, stale: staleIds.has(o.order_id) }));
}

// サマリー統計
function getStats() {
  const db = getDb();
  const now = dayjs().tz(TZ);
  const startToday = now.startOf("day").toISOString();
  const start7d = now.subtract(7, "day").toISOString();

  const total = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const today = db.prepare("SELECT COUNT(*) c FROM orders WHERE created_at_jst >= ?").get(startToday).c;
  const last7d = db.prepare("SELECT COUNT(*) c FROM orders WHERE created_at_jst >= ?").get(start7d).c;
  const orderByStatus = db.prepare("SELECT status, COUNT(*) c FROM orders GROUP BY status").all();
  const vendorByStatus = db.prepare("SELECT status, COUNT(*) c FROM vendor_orders GROUP BY status").all();
  const stale = staleOrderIdSet().size;

  return { total, today, last7d, orderByStatus, vendorByStatus, stale, staleBusinessDays: STALE_BUSINESS_DAYS };
}

// 注文詳細（ベンダー明細つき）
function getOrderDetail(orderId) {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
  if (!order) return null;

  const vendors = db
    .prepare("SELECT * FROM vendor_orders WHERE order_id = ? ORDER BY id")
    .all(orderId)
    .map((v) => ({
      ...v,
      vendor_emails: safeParse(v.vendor_emails),
      item_names: safeParse(v.item_names),
    }));

  const staleIds = staleOrderIdSet();
  return { order: { ...order, stale: staleIds.has(order.order_id) }, vendors };
}

module.exports = {
  getOrdersOverview,
  getStats,
  getOrderDetail,
  getStaleVendorOrders,
};
