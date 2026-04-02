"use strict";

const { google } = require("googleapis");
const { config } = require("../config");

// シート「ベンダー」列構造: A: ID, B: ブランド名, C: 担当者名, D: メール1, E: メール2, F: メール3
// シート「商品」列構造: A: 商品タイトル, B: ベンダーID, C: Shopify URL
const SHEET_VENDOR = "ベンダー";
const SHEET_PRODUCT = "商品";

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleServiceAccountKeyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function fetchSheet(sheetsClient, sheetName) {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: sheetName,
  });
  return res.data.values || [];
}

async function load() {
  const sheets = getSheetsClient();

  const [vendorRaw, productRaw] = await Promise.all([
    fetchSheet(sheets, SHEET_VENDOR),
    fetchSheet(sheets, SHEET_PRODUCT),
  ]);

  const vendorMap = new Map();
  vendorRaw.forEach((cols, index) => {
    if (index === 0) return;
    const id          = (cols[0] || "").trim();
    const brandName   = (cols[1] || "").trim();
    const contactName = (cols[2] || "").trim();
    const emails = [cols[3], cols[4], cols[5]]
      .map((e) => (e || "").trim())
      .filter((e) => e.includes("@"));
    if (!id) return;
    vendorMap.set(id, { rowNumber: index + 1, brandName, contactName, emails });
  });

  const productsByVendor = new Map();
  productRaw.forEach((cols, index) => {
    if (index === 0) return;
    const title    = (cols[0] || "").trim();
    const vendorId = (cols[1] || "").trim();
    if (!title || !vendorId) return;
    if (!productsByVendor.has(vendorId)) productsByVendor.set(vendorId, []);
    productsByVendor.get(vendorId).push(title);
  });

  const rows = [];
  for (const [vendorId, vendor] of vendorMap) {
    const productTitles = productsByVendor.get(vendorId) || [];
    if (productTitles.length === 0) continue;
    rows.push({
      rowNumber: vendor.rowNumber,
      productTitles,
      brandName: vendor.brandName,
      contactName: vendor.contactName,
      emails: vendor.emails,
    });
  }

  console.log(`[sheetsSource] ベンダー ${rows.length} 件・商品 ${[...productsByVendor.values()].flat().length} 件を読み込みました`);
  return rows;
}

module.exports = { load };
