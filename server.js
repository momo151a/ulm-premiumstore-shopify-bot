"use strict";

require("dotenv").config();

const { validate } = require("./src/config");
validate();

const express = require("express");
const crypto = require("crypto");
const { config } = require("./src/config");
const { initDb } = require("./src/db/init");

const { handleOrderCreated } = require("./src/webhook/orderHandler");
const { handleFormSubmitted } = require("./src/webhook/formHandler");
const { notifyError } = require("./src/slack/notifier");
const { dashboardRouter } = require("./src/dashboard/router");

const app = express();

app.set("trust proxy", true);
app.use(express.raw({ type: "application/json" }));

// 管理ダッシュボード（Basic 認証・読み取り専用）
app.use(dashboardRouter);

function verifyShopifyWebhook(req, bodyBuffer) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac) {
    console.warn("[webhook] x-shopify-hmac-sha256 ヘッダーなし");
    return false;
  }
  const hash = crypto
    .createHmac("sha256", config.shopifyWebhookSecret)
    .update(bodyBuffer, "utf8")
    .digest("base64");
  const a = Buffer.from(hash, "utf8");
  const b = Buffer.from(String(hmac), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.post("/webhook/order-created", async (req, res) => {
  const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");

  if (!verifyShopifyWebhook(req, bodyBuffer)) {
    console.warn("[webhook] 署名検証失敗");
    return res.status(401).send("Unauthorized");
  }

  // Shopify は 200 を受け取れなければ再送するため先に返す
  res.status(200).send("OK");

  let data;
  try {
    data = JSON.parse(bodyBuffer.toString("utf8"));
  } catch (e) {
    await notifyError("[webhook] JSON パース失敗", e.message);
    return;
  }

  handleOrderCreated(data).catch(async (err) => {
    await notifyError(
      `[webhook] 注文処理中に予期しないエラー: ${data?.name || data?.id}`,
      err.stack || err.message
    );
  });
});

app.post("/webhook/form-submitted", async (req, res) => {
  const secret = req.headers["x-form-webhook-secret"];
  if (secret !== config.googleFormWebhookSecret) {
    console.warn("[form-webhook] シークレット検証失敗");
    return res.status(401).send("Unauthorized");
  }

  res.status(200).send("OK");

  let data;
  try {
    const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    data = JSON.parse(bodyBuffer.toString("utf8"));
  } catch (e) {
    await notifyError("[form-webhook] JSON パース失敗", e.message);
    return;
  }

  if (!data || !data.submissionId) {
    await notifyError("[form-webhook] 不正なリクエストボディ", JSON.stringify(data));
    return;
  }

  handleFormSubmitted(data).catch(async (err) => {
    await notifyError(
      `[form-webhook] フォーム処理中に予期しないエラー: ${data?.orderNumber}`,
      err.stack || err.message
    );
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

async function start() {
  initDb();
  app.listen(config.port, () => {
    console.log(`[server] 起動完了 → http://127.0.0.1:${config.port}`);
    console.log(`[server] Shopify Webhook: POST http://127.0.0.1:${config.port}/webhook/order-created`);
    console.log(`[server] Form Webhook:    POST http://127.0.0.1:${config.port}/webhook/form-submitted`);
  });
}

start().catch((err) => {
  console.error("[server] 起動失敗:", err);
  process.exit(1);
});
