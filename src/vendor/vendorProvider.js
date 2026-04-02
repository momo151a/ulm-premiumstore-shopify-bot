"use strict";

const sheetsSource = require("./sheetsSource");
const { normalize, includesNormalized } = require("../utils/normalizer");

// 注文のたびにスプレッドシートから再読み込み（再起動なしでシート変更が反映される）
async function loadVendorData() {
  const rows = await sheetsSource.load();
  console.log(`[vendorProvider] ${rows.length} ベンダーを読み込み`);
  return rows;
}

function findVendorByProductTitle(productTitle, vendorRows) {
  const normalizedTitle = normalize(productTitle);

  for (const row of vendorRows) {
    const matched = row.productTitles.some(
      (t) => includesNormalized(normalizedTitle, t) || includesNormalized(t, normalizedTitle)
    );
    if (matched) {
      const vendorName = row.brandName || row.contactName;
      return {
        rowNumber: row.rowNumber,
        vendorName,
        brandName: row.brandName,
        contactName: row.contactName,
        emails: row.emails,
      };
    }
  }

  return null;
}

module.exports = { loadVendorData, findVendorByProductTitle };
