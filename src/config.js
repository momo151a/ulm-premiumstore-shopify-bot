"use strict";

const path = require("path");

const REQUIRED = [
  "SENDER_EMAIL",
  "SENDER_APP_PASSWORD",
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_WEBHOOK_SECRET",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "GOOGLE_SHEETS_ID",
  "GOOGLE_SERVICE_ACCOUNT_KEY_PATH",
  "GOOGLE_FORM_URL",
  "GOOGLE_FORM_ENTRY_ORDER_NUMBER",
  "GOOGLE_FORM_ENTRY_VENDOR_NAME",
  "GOOGLE_FORM_WEBHOOK_SECRET",
];

function validate() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("[config] 以下の環境変数が未設定です:");
    missing.forEach((k) => console.error(`  - ${k}`));
    process.exit(1);
  }
}

const config = {
  port: parseInt(process.env.PORT || "3000", 10),

  senderEmail: process.env.SENDER_EMAIL,
  senderAppPassword: process.env.SENDER_APP_PASSWORD,

  shopifyShopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID,
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,

  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID,

  googleSheetsId: process.env.GOOGLE_SHEETS_ID,
  googleServiceAccountKeyPath: path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || ""),

  googleFormUrl: process.env.GOOGLE_FORM_URL,
  googleFormEntryOrderNumber: process.env.GOOGLE_FORM_ENTRY_ORDER_NUMBER,
  googleFormEntryVendorName: process.env.GOOGLE_FORM_ENTRY_VENDOR_NAME,
  googleFormWebhookSecret: process.env.GOOGLE_FORM_WEBHOOK_SECRET,

  dbPath: path.resolve(__dirname, "../data/orders.db"),
};

module.exports = { config, validate };
