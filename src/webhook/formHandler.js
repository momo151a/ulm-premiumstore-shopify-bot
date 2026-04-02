"use strict";

const {
  findVendorOrderByOrderIdAndVendorName,
  updateVendorOrderShipped,
  updateVendorOrderCustomerNotified,
  updateVendorOrderDelayed,
  getVendorOrdersByOrderId,
  isFormSubmissionProcessed,
  markFormSubmissionProcessed,
  updateOrderStatus,
  tryMarkOrderFulfilled,
} = require("../db/queries");
const { createFulfillment, getOrderEmail } = require("../shopify/api");
const { composeCustomerEmail } = require("../email/composer");
const { sendEmail } = require("../email/sender");
const {
  notifyInfo,
  notifyError,
  notifyTrackingReceived,
  notifyDelayAlert,
  notifyFulfillmentCreated,
  notifyCustomerEmailed,
} = require("../slack/notifier");

async function handleFormSubmitted(data) {
  const {
    submissionId,
    orderNumber,
    vendorName,
    isDelayed,
    shippedAt,
    carrier,
    trackingNumber,
    delayDate,
    delayNote,
    otherNote,
  } = data;

  if (isFormSubmissionProcessed(submissionId)) {
    console.log(`[formHandler] submissionId ${submissionId} は処理済みのためスキップ`);
    return;
  }
  markFormSubmissionProcessed(submissionId);

  const order = findOrderByOrderNumber(orderNumber);
  if (!order) {
    await notifyError(
      `[formHandler] 注文 ${orderNumber} が DB に見つかりません（フォーム受信）`,
      `submissionId: ${submissionId}`
    );
    return;
  }

  const orderId = order.order_id;
  const threadTs = order.slack_thread_ts || null;

  const vendorOrder = findVendorOrderByOrderIdAndVendorName(orderId, vendorName);
  if (!vendorOrder) {
    await notifyError(
      `[formHandler] 注文 ${orderNumber} / ベンダー ${vendorName} の vendor_orders レコードが見つかりません`,
      `submissionId: ${submissionId}`,
      threadTs
    );
    return;
  }

  if (["shipped", "fulfilled"].includes(vendorOrder.status)) {
    console.log(`[formHandler] 注文 ${orderNumber} / ${vendorName} はすでに発送処理済み (status: ${vendorOrder.status})。スキップします`);
    await notifyInfo(
      `注文 ${orderNumber} / ${vendorName}: フォームが重複送信されましたがスキップしました（処理済み: ${vendorOrder.status}）`,
      threadTs
    );
    return;
  }

  // 遅延報告済みのベンダーから発送完了フォームが届いた場合は手動確認が必要
  if (vendorOrder.status === "delayed" && !isDelayed) {
    console.log(`[formHandler] 注文 ${orderNumber} / ${vendorName} は遅延報告済みですが発送完了フォームを受信しました。手動確認が必要です`);
    await notifyError(
      `注文 ${orderNumber} / ${vendorName}: 遅延報告済みのベンダーから発送完了フォームが届きました。内容を確認のうえ手動対応してください`,
      `追跡番号: ${trackingNumber || "未入力"} / 配送業者: ${carrier || "未入力"}`,
      threadTs
    );
    return;
  }

  if (isDelayed) {
    await handleDelayedReport({ order, vendorOrder, vendorName, delayDate, delayNote, otherNote, threadTs });
    return;
  }

  await handleNormalShipment({
    order, vendorOrder, orderId, orderNumber, vendorName,
    shippedAt, carrier, trackingNumber, otherNote, threadTs,
  });
}

async function handleDelayedReport({ order, vendorOrder, vendorName, delayDate, delayNote, otherNote, threadTs }) {
  const orderNumber = order.order_number;
  updateVendorOrderDelayed(vendorOrder.id, {
    delayedReason: delayNote || "",
    delayedAt: new Date().toISOString(),
  });
  await notifyDelayAlert(orderNumber, vendorName, { delayDate, delayNote, otherNote }, order, threadTs);
}

async function handleNormalShipment({
  order, vendorOrder, orderId, orderNumber, vendorName,
  shippedAt, carrier, trackingNumber, otherNote, threadTs,
}) {
  await notifyTrackingReceived(orderNumber, vendorName, trackingNumber, carrier, threadTs);

  let shopifyFulfillmentId = null;
  try {
    const foLineItems = JSON.parse(vendorOrder.line_item_ids || "[]");
    const fulfillment = await createFulfillment({
      fulfillmentOrderId: vendorOrder.fulfillment_order_id,
      lineItems: foLineItems,
      trackingInfo: { number: trackingNumber, company: carrier },
    });
    shopifyFulfillmentId = String(fulfillment.id);
    await notifyFulfillmentCreated(orderNumber, vendorName, threadTs);
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    await notifyError(`注文 ${orderNumber} / ${vendorName}: Shopify Fulfillment 作成失敗`, detail, threadTs);
    // Fulfillment 失敗でも顧客通知は継続する
  }

  updateVendorOrderShipped(vendorOrder.id, {
    trackingNumber,
    carrier,
    shippedAt: shippedAt || new Date().toISOString(),
    shopifyFulfillmentId,
  });

  await sendCustomerNotification({ order, orderId, orderNumber, justShippedVendorOrderId: vendorOrder.id, otherNote, threadTs });
}

async function sendCustomerNotification({ order, orderId, orderNumber, justShippedVendorOrderId, otherNote, threadTs }) {
  const allVendorOrders = getVendorOrdersByOrderId(orderId);
  const totalVendors = allVendorOrders.length;
  const fulfilledVendors = allVendorOrders.filter((v) => v.status === "shipped" || v.status === "fulfilled");
  const allShipped = fulfilledVendors.length === totalVendors;
  const type = allShipped ? "complete" : "partial";

  let customerEmail;
  try {
    customerEmail = await getOrderEmail(orderId);
  } catch (err) {
    await notifyError(`注文 ${orderNumber}: 顧客メールアドレス取得失敗`, err.message, threadTs);
    return;
  }

  if (!customerEmail) {
    await notifyError(`注文 ${orderNumber}: 顧客メールアドレスが空です`, "", threadTs);
    return;
  }

  const subject = type === "complete"
    ? `【発送完了】ご注文 ${orderNumber} の全商品を発送いたしました`
    : `【一部発送】ご注文 ${orderNumber} の商品を発送いたしました`;

  const body = composeCustomerEmail({
    order: { orderNumber, customerName: order.customer_name },
    vendorOrders: type === "complete"
      ? fulfilledVendors
      : [allVendorOrders.find((v) => v.id === justShippedVendorOrderId)],
    type: type === "complete" ? "complete" : "partial",
    remainingCount: totalVendors - fulfilledVendors.length,
    otherNote: otherNote || "",
  });

  if (allShipped) {
    // 複数ベンダーが同時に発送完了フォームを送信した場合の重複メール送信を防ぐ
    const claimed = tryMarkOrderFulfilled(orderId);
    if (!claimed) {
      console.log(`[formHandler] 注文 ${orderNumber}: 完了メールは別の処理が送信済みのためスキップ`);
      updateVendorOrderCustomerNotified(justShippedVendorOrderId);
      return;
    }
  }

  try {
    await sendEmail({ to: [customerEmail], subject, body });
    updateVendorOrderCustomerNotified(justShippedVendorOrderId);
    await notifyCustomerEmailed(orderNumber, type, totalVendors - fulfilledVendors.length, otherNote || "", threadTs);
  } catch (err) {
    await notifyError(`注文 ${orderNumber}: 顧客通知メール送信失敗`, err.message, threadTs);
  }
}

function findOrderByOrderNumber(orderNumber) {
  const { getDb } = require("../db/init");
  return getDb()
    .prepare("SELECT * FROM orders WHERE order_number = ?")
    .get(orderNumber);
}

module.exports = { handleFormSubmitted };
