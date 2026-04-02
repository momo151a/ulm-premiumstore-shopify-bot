/**
 * Shopify トークン取得テストスクリプト
 * 使い方: node scripts/testShopifyToken.js
 */
"use strict";

require("dotenv").config();
const axios = require("axios");
const { config } = require("../src/config");

async function main() {
  console.log("--- Shopify 接続テスト ---");
  console.log("SHOPIFY_SHOP_DOMAIN:", config.shopifyShopDomain);
  console.log("SHOPIFY_CLIENT_ID:  ", config.shopifyClientId ? "設定済み" : "未設定");
  console.log("SHOPIFY_CLIENT_SECRET:", config.shopifyClientSecret ? "設定済み" : "未設定");
  console.log("");

  // ① トークン取得
  let token;
  try {
    const res = await axios.post(
      `https://${config.shopifyShopDomain}/admin/oauth/access_token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.shopifyClientId,
        client_secret: config.shopifyClientSecret,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    token = res.data.access_token;
    console.log("✅ トークン取得成功");
    console.log("   token prefix:", token ? token.slice(0, 10) + "..." : "（空）");
  } catch (err) {
    console.error("❌ トークン取得失敗");
    console.error("   status:", err.response?.status);
    console.error("   body:  ", JSON.stringify(err.response?.data));
    process.exit(1);
  }

  // ② shop 情報を取得（最も基本的な API 呼び出し）
  try {
    const res = await axios.get(
      `https://${config.shopifyShopDomain}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": token } }
    );
    console.log("✅ Shop API 疎通確認 OK");
    console.log("   shop name:", res.data.shop?.name);
  } catch (err) {
    console.error("❌ Shop API 呼び出し失敗");
    console.error("   status:", err.response?.status);
    console.error("   body:  ", JSON.stringify(err.response?.data));
  }

  // ③ 直近の注文 ID で FulfillmentOrders を取得してみる
  try {
    const ordersRes = await axios.get(
      `https://${config.shopifyShopDomain}/admin/api/2024-01/orders.json?limit=1&status=any`,
      { headers: { "X-Shopify-Access-Token": token } }
    );
    const orders = ordersRes.data.orders;
    if (!orders || orders.length === 0) {
      console.log("⚠️  注文が0件のため FulfillmentOrders テストをスキップ");
      return;
    }
    const orderId = orders[0].id;
    console.log(`\n直近の注文 ID: ${orderId} (${orders[0].name})`);

    const foRes = await axios.get(
      `https://${config.shopifyShopDomain}/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`,
      { headers: { "X-Shopify-Access-Token": token } }
    );
    console.log("✅ FulfillmentOrders 取得成功");
    console.log("   件数:", foRes.data.fulfillment_orders?.length);
  } catch (err) {
    console.error("❌ FulfillmentOrders 取得失敗");
    console.error("   status:", err.response?.status);
    console.error("   body:  ", JSON.stringify(err.response?.data));
  }
}

main().catch(console.error);
