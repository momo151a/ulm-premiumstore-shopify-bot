"use strict";

const {
  isOrderProcessed,
  insertOrder,
  updateOrderStatus,
  updateOrderSlackThread,
  insertVendorOrder,
  updateVendorOrderEmailSent,
} = require("../db/queries");
const { loadVendorData, findVendorByProductTitle } = require("../vendor/vendorProvider");
const { getFulfillmentOrders } = require("../shopify/api");
const { composeVendorEmail } = require("../email/composer");
const { sendEmail } = require("../email/sender");
const { formatAddress, formatPhone } = require("../utils/normalizer");
const { toJst } = require("../utils/businessDays");
const {
  notifyOrderReceived,
  notifyVendorEmailSent,
  notifyMatchFailed,
  notifyError,
} = require("../slack/notifier");

async function groupItemsByVendor(lineItems, orderNumber, vendorRows) {
  const groups = new Map();
  const unmatched = [];

  for (const item of lineItems) {
    const vendorInfo = findVendorByProductTitle(item.title, vendorRows);
    if (!vendorInfo) {
      unmatched.push(item.title);
      continue;
    }
    const key = vendorInfo.rowNumber;
    if (!groups.has(key)) groups.set(key, { vendorInfo, items: [] });
    groups.get(key).items.push(item);
  }

  for (const title of unmatched) {
    await notifyMatchFailed(orderNumber, title);
  }

  return groups;
}

async function handleOrderCreated(data) {
  const orderId = String(data.id);
  const orderNumber = data.name;

  if (isOrderProcessed(orderId)) {
    console.log(`[orderHandler] 注文 ${orderNumber} は処理済みのためスキップ`);
    return;
  }

  const createdAtJst = toJst(data.created_at).toISOString();

  const shippingAddr = data.shipping_address || {};
  const customerAddress = formatAddress(shippingAddr);
  const customerPhone = formatPhone(shippingAddr.phone);
  const customerName = shippingAddr.name
    || [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(" ")
    || "";
  const customerEmail = data.email || data.customer?.email || "";

  const vendorRows = await loadVendorData();

  const lineItems = (data.line_items || []).map((item) => ({
    id: String(item.id),
    title: item.title,
    variantTitle: item.variant_title || "",
    quantity: item.quantity,
    price: item.price,
  }));

  const vendorGroups = await groupItemsByVendor(lineItems, orderNumber, vendorRows);
  const totalVendors = vendorGroups.size;
  const totalItems = lineItems.length;

  insertOrder({
    order_id: orderId,
    order_number: orderNumber,
    created_at_jst: createdAtJst,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    customer_address: customerAddress,
    total_vendors: totalVendors,
    status: "received",
    processed_at: new Date().toISOString(),
  });

  const vendorNames = [...vendorGroups.values()].map((g) => g.vendorInfo.vendorName);
  const threadTs = await notifyOrderReceived(orderNumber, totalVendors, totalItems, vendorNames);
  if (threadTs) updateOrderSlackThread(orderId, threadTs);

  if (vendorGroups.size === 0) {
    await notifyError(
      `注文 ${orderNumber}: ベンダー特定できた商品が0件です。全商品を手動確認してください。`,
      "",
      threadTs
    );
    updateOrderStatus(orderId, "error", "全商品のベンダー特定失敗");
    return;
  }

  let fulfillmentOrders = [];
  try {
    fulfillmentOrders = await getFulfillmentOrders(orderId);
  } catch (err) {
    await notifyError(`注文 ${orderNumber}: FulfillmentOrder 取得失敗`, err.message, threadTs);
    updateOrderStatus(orderId, "error", `FulfillmentOrder 取得失敗: ${err.message}`);
    return;
  }

  const order = { orderNumber, createdAtJst, customerName, customerPhone, customerAddress };

  for (const [, { vendorInfo, items }] of vendorGroups) {
    const lineItemIds = items.map((i) => i.id);
    const matchedFo = fulfillmentOrders.find((fo) =>
      fo.line_items.some((li) => lineItemIds.includes(String(li.line_item_id)))
    );
    const foLineItems = matchedFo
      ? matchedFo.line_items
          .filter((li) => lineItemIds.includes(String(li.line_item_id)))
          .map((li) => ({ id: li.id, quantity: li.quantity }))
      : [];

    const vendorOrderId = insertVendorOrder({
      order_id: orderId,
      vendor_row: vendorInfo.rowNumber,
      vendor_name: vendorInfo.vendorName,
      vendor_emails: JSON.stringify(vendorInfo.emails),
      fulfillment_order_id: matchedFo ? String(matchedFo.id) : null,
      line_item_ids: JSON.stringify(foLineItems),
      item_names: JSON.stringify(items.map((i) => ({
        title: i.title,
        variantTitle: i.variantTitle,
        quantity: i.quantity,
      }))),
      status: "pending",
    });

    try {
      const subject = `【新規受注】発送のご依頼／[注文番号：${orderNumber}]（アーバンライフメトロ）`;
      const body = composeVendorEmail({ order, vendorInfo, items });
      await sendEmail({ to: vendorInfo.emails, subject, body });
      updateVendorOrderEmailSent(vendorOrderId);
      await notifyVendorEmailSent(orderNumber, vendorInfo.vendorName, vendorInfo.emails, threadTs);
    } catch (err) {
      await notifyError(
        `注文 ${orderNumber} / ${vendorInfo.vendorName} へのメール送信失敗`,
        err.message,
        threadTs
      );
    }
  }

  updateOrderStatus(orderId, "vendor_emailed");
}

module.exports = { handleOrderCreated };
