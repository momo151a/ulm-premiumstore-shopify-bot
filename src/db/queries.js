"use strict";

const { getDb } = require("./init");

function isOrderProcessed(orderId) {
  const row = getDb()
    .prepare("SELECT 1 FROM orders WHERE order_id = ?")
    .get(orderId);
  return !!row;
}

function insertOrder(order) {
  getDb()
    .prepare(
      `INSERT INTO orders
        (order_id, order_number, created_at_jst, customer_name, customer_email,
         customer_phone, customer_address, total_vendors, status, processed_at)
       VALUES
        (@order_id, @order_number, @created_at_jst, @customer_name, @customer_email,
         @customer_phone, @customer_address, @total_vendors, @status, @processed_at)`
    )
    .run(order);
}

function updateOrderStatus(orderId, status, errorReason = null) {
  getDb()
    .prepare("UPDATE orders SET status = ?, error_reason = ? WHERE order_id = ?")
    .run(status, errorReason, orderId);
}

// 複数ベンダーが同時に発送完了フォームを送信した際の重複完了メール送信を防ぐ排他制御
// 戻り値: true = 自分が更新できた、false = すでに他の処理が更新済み
function tryMarkOrderFulfilled(orderId) {
  const result = getDb()
    .prepare("UPDATE orders SET status = 'fulfilled' WHERE order_id = ? AND status != 'fulfilled'")
    .run(orderId);
  return result.changes > 0;
}

function updateOrderSlackThread(orderId, threadTs) {
  getDb()
    .prepare("UPDATE orders SET slack_thread_ts = ? WHERE order_id = ?")
    .run(threadTs, orderId);
}

function getOrder(orderId) {
  return getDb()
    .prepare("SELECT * FROM orders WHERE order_id = ?")
    .get(orderId);
}

function insertVendorOrder(vendorOrder) {
  const result = getDb()
    .prepare(
      `INSERT INTO vendor_orders
        (order_id, vendor_row, vendor_name, vendor_emails,
         fulfillment_order_id, line_item_ids, item_names, status)
       VALUES
        (@order_id, @vendor_row, @vendor_name, @vendor_emails,
         @fulfillment_order_id, @line_item_ids, @item_names, @status)`
    )
    .run(vendorOrder);
  return result.lastInsertRowid;
}

function updateVendorOrderEmailSent(id) {
  getDb()
    .prepare("UPDATE vendor_orders SET status = 'emailed', email_sent_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

function updateVendorOrderShipped(id, { trackingNumber, carrier, shippedAt, shopifyFulfillmentId }) {
  getDb()
    .prepare(
      `UPDATE vendor_orders
       SET tracking_number = ?, carrier = ?, shipped_at = ?,
           shopify_fulfillment_id = ?, status = 'shipped'
       WHERE id = ?`
    )
    .run(trackingNumber, carrier, shippedAt, shopifyFulfillmentId, id);
}

function updateVendorOrderCustomerNotified(id) {
  getDb()
    .prepare("UPDATE vendor_orders SET customer_notified_at = ?, status = 'fulfilled' WHERE id = ?")
    .run(new Date().toISOString(), id);
}

function getVendorOrdersByOrderId(orderId) {
  return getDb()
    .prepare("SELECT * FROM vendor_orders WHERE order_id = ?")
    .all(orderId);
}

function findVendorOrderByOrderIdAndVendorName(orderId, vendorName) {
  return getDb()
    .prepare("SELECT * FROM vendor_orders WHERE order_id = ? AND vendor_name = ?")
    .get(orderId, vendorName);
}

function updateVendorOrderDelayed(id, { delayedReason, delayedAt }) {
  getDb()
    .prepare(
      `UPDATE vendor_orders
       SET delayed_reason = ?, delayed_at = ?, status = 'delayed'
       WHERE id = ?`
    )
    .run(delayedReason, delayedAt, id);
}

function isFormSubmissionProcessed(submissionId) {
  const row = getDb()
    .prepare("SELECT 1 FROM processed_form_submissions WHERE submission_id = ?")
    .get(submissionId);
  return !!row;
}

function markFormSubmissionProcessed(submissionId) {
  getDb()
    .prepare("INSERT OR IGNORE INTO processed_form_submissions (submission_id, processed_at) VALUES (?, ?)")
    .run(submissionId, new Date().toISOString());
}

module.exports = {
  isOrderProcessed,
  insertOrder,
  updateOrderStatus,
  tryMarkOrderFulfilled,
  updateOrderSlackThread,
  getOrder,
  insertVendorOrder,
  updateVendorOrderEmailSent,
  updateVendorOrderShipped,
  updateVendorOrderCustomerNotified,
  updateVendorOrderDelayed,
  getVendorOrdersByOrderId,
  findVendorOrderByOrderIdAndVendorName,
  isFormSubmissionProcessed,
  markFormSubmissionProcessed,
};
