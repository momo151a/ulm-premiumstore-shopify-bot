"use strict";

const axios = require("axios");
const { config } = require("../config");

async function post({ text, threadTs } = {}) {
  try {
    const payload = { channel: config.slackChannelId, text };
    if (threadTs) payload.thread_ts = threadTs;

    const res = await axios.post(
      "https://slack.com/api/chat.postMessage",
      payload,
      { headers: { Authorization: `Bearer ${config.slackBotToken}` } }
    );

    if (!res.data.ok) {
      console.error("[slack] 投稿失敗:", res.data.error);
      return null;
    }
    return res.data.ts;
  } catch (err) {
    console.error("[slack] 通知失敗:", err.message);
    return null;
  }
}

async function notifyInfo(message, threadTs) {
  console.log("[info]", message);
  return post({ text: `:information_source: ${message}`, threadTs });
}

async function notifyWarn(message, threadTs) {
  console.warn("[warn]", message);
  return post({ text: `:warning: ${message}`, threadTs });
}

async function notifyError(message, detail = "", threadTs) {
  console.error("[error]", message, detail);
  const text = detail
    ? `:x: ${message}\n\`\`\`${String(detail).slice(0, 2000)}\`\`\``
    : `:x: ${message}`;
  if (threadTs) await post({ text, threadTs });
  return post({ text });
}

async function notifyOrderReceived(orderNumber, vendorCount, itemCount, vendorNames = []) {
  const vendorList = vendorNames.length > 0
    ? vendorNames.map((n) => `• ${n}`).join("\n")
    : `ベンダー ${vendorCount}社`;

  const text = [
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 新規注文 ${orderNumber}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `商品数: ${itemCount}点 | ベンダー: ${vendorCount}社`,
    vendorList,
  ].join("\n");

  console.log("[info] 注文受信:", orderNumber, `商品${itemCount}点 ベンダー${vendorCount}社`);
  return post({ text });
}

async function notifyVendorEmailSent(orderNumber, vendorName, emails, threadTs) {
  console.log("[info] 出荷依頼メール送信:", orderNumber, "→", vendorName);
  return post({ text: `✉️ 出荷依頼メール送信 → ${vendorName} (${emails.join(", ")})`, threadTs });
}

async function notifyMatchFailed(orderNumber, productTitle, threadTs) {
  const text = `:warning: ベンダー特定失敗: 商品「${productTitle}」がスプレッドシートに見つかりません。手動対応が必要です。`;
  console.warn("[warn] ベンダー特定失敗:", orderNumber, productTitle);
  if (threadTs) await post({ text, threadTs });
  return post({ text });
}

async function notifyTrackingReceived(orderNumber, vendorName, trackingNumber, carrier, threadTs) {
  const tracking = trackingNumber || "（未入力）";
  console.log("[info] 追跡番号受信:", orderNumber, vendorName, carrier, tracking);
  return post({ text: `📋 発送報告受信\nベンダー: ${vendorName} | ${carrier} | 追跡番号: ${tracking}`, threadTs });
}

async function notifyDelayAlert(orderNumber, vendorName, { delayDate, delayNote, otherNote } = {}, order, threadTs) {
  console.error("[delay] 発送遅延報告:", orderNumber, vendorName);
  const customerInfo = order
    ? `お客様: ${order.customer_name} | 電話: ${order.customer_phone}`
    : "お客様情報取得失敗";
  const lines = [
    `:rotating_light: *発送遅延報告（要手動対応）*`,
    `注文: ${orderNumber} | ベンダー: ${vendorName}`,
    `発送可能予定日: ${delayDate || "（未記入）"}`,
    `遅延事情: ${delayNote || "（記載なし）"}`,
  ];
  if (otherNote) lines.push(`その他: ${otherNote}`);
  lines.push(customerInfo);
  const text = lines.join("\n");
  if (threadTs) await post({ text, threadTs });
  return post({ text });
}

async function notifyFulfillmentCreated(orderNumber, vendorName, threadTs) {
  console.log("[info] Shopify Fulfillment 作成:", orderNumber, vendorName);
  return post({ text: `✅ Shopify 更新完了: ${vendorName}`, threadTs });
}

async function notifyCustomerEmailed(orderNumber, type, remainingCount, otherNote, threadTs) {
  const label = type === "complete"
    ? "全件発送完了 — 顧客通知メール送信"
    : `部分出荷 — 顧客通知メール送信（残り${remainingCount}社）`;
  const icon = type === "complete" ? "🎉" : "📧";
  const text = otherNote
    ? `${icon} ${label}\n📝 その他連絡事項: ${otherNote}`
    : `${icon} ${label}`;
  console.log("[info] 顧客通知メール送信:", orderNumber, `(${type})`);
  return post({ text, threadTs });
}

module.exports = {
  notifyInfo,
  notifyWarn,
  notifyError,
  notifyOrderReceived,
  notifyVendorEmailSent,
  notifyMatchFailed,
  notifyTrackingReceived,
  notifyDelayAlert,
  notifyFulfillmentCreated,
  notifyCustomerEmailed,
};
