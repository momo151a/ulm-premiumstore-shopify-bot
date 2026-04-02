"use strict";

const axios = require("axios");
const { config } = require("../config");

// Dev Dashboard カスタムアプリのトークンは有効期限 24 時間 → 23 時間でリフレッシュ
let _token = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiresAt) return _token;

  const res = await axios.post(
    `https://${config.shopifyShopDomain}/admin/oauth/access_token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.shopifyClientId,
      client_secret: config.shopifyClientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  _token = res.data.access_token;
  _tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
  console.log("[shopify] アクセストークン取得完了");
  return _token;
}

async function shopifyClient() {
  const token = await getAccessToken();
  return axios.create({
    baseURL: `https://${config.shopifyShopDomain}/admin/api/2024-01`,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
}

async function withRetry(fn, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 && attempt === 1) {
        // 401 はトークン期限切れの可能性 → キャッシュをクリアして1回だけ再試行
        console.warn("[shopify] 401: トークンをリセットして再試行");
        _token = null;
        _tokenExpiresAt = 0;
        continue;
      }
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === maxRetries) throw err;
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`[shopify] リトライ ${attempt}/${maxRetries} (${wait}ms後)`);
      await new Promise((r) => setTimeout(r, wait));
      lastErr = err;
    }
  }
  throw lastErr;
}

async function getFulfillmentOrders(orderId) {
  return withRetry(async () => {
    const client = await shopifyClient();
    const res = await client.get(`/orders/${orderId}/fulfillment_orders.json`);
    return res.data.fulfillment_orders;
  });
}

// lineItems: [{ id, quantity }] ← FulfillmentOrder line item IDs
async function createFulfillment({ fulfillmentOrderId, lineItems, trackingInfo }) {
  return withRetry(async () => {
    const client = await shopifyClient();
    const res = await client.post("/fulfillments.json", {
      fulfillment: {
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: fulfillmentOrderId,
            fulfillment_order_line_items: lineItems,
          },
        ],
        tracking_info: {
          number: trackingInfo.number,
          company: trackingInfo.company,
          url: trackingInfo.url || null,
        },
        notify_customer: false, // 顧客通知はボット側で制御
      },
    });
    return res.data.fulfillment;
  });
}

async function getOrderEmail(orderId) {
  return withRetry(async () => {
    const client = await shopifyClient();
    const res = await client.get(`/orders/${orderId}.json?fields=email`);
    return res.data.order.email;
  });
}

module.exports = { getFulfillmentOrders, createFulfillment, getOrderEmail };
