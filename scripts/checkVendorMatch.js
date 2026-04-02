/**
 * ベンダーマッチング診断スクリプト
 *
 * 使い方:
 *   node scripts/checkVendorMatch.js "Shopify の商品タイトル"
 *
 * スプレッドシートの商品リストと突き合わせて、
 * どの商品タイトルがどれだけ近いかを表示します。
 */

"use strict";

require("dotenv").config();

const { loadVendorData, findVendorByProductTitle } = require("../src/vendor/vendorProvider");
const { normalize } = require("../src/utils/normalizer");
const sheetsSource = require("../src/vendor/sheetsSource");

async function main() {
  const input = process.argv[2];

  await loadVendorData();
  const allRows = await sheetsSource.load();

  // 全商品タイトルを収集
  const allTitles = [];
  for (const row of allRows) {
    for (const title of row.productTitles) {
      allTitles.push({ title, vendorName: row.brandName || row.contactName });
    }
  }

  if (!input) {
    // 引数なし → スプレッドシートの全商品タイトルを表示
    console.log("\n📋 スプレッドシートに登録されている商品タイトル一覧:\n");
    for (const { title, vendorName } of allTitles) {
      console.log(`  [${vendorName}] ${title}`);
    }
    console.log("\n使い方: node scripts/checkVendorMatch.js \"商品タイトル\"");
    return;
  }

  // 完全マッチ確認
  const exact = findVendorByProductTitle(input);
  if (exact) {
    console.log(`\n✅ マッチしました！ → ベンダー: ${exact.vendorName}\n`);
    return;
  }

  console.log(`\n❌ マッチなし: "${input}"`);
  console.log(`   正規化後:  "${normalize(input)}"\n`);

  // 類似度スコアで近いものを表示（共通文字数ベース）
  const scored = allTitles.map(({ title, vendorName }) => {
    const a = normalize(input);
    const b = normalize(title);
    // 共通部分文字列の長さ / 長い方の長さ で類似度を計算
    let common = 0;
    for (let i = 0; i < a.length; i++) {
      if (b.includes(a[i])) common++;
    }
    const score = common / Math.max(a.length, b.length);
    return { title, vendorName, score, normalized: b };
  });

  scored.sort((a, b) => b.score - a.score);

  console.log("📊 近いタイトル TOP 5:\n");
  for (const item of scored.slice(0, 5)) {
    const pct = Math.round(item.score * 100);
    console.log(`  ${pct}% [${item.vendorName}] ${item.title}`);
    console.log(`       正規化後: ${item.normalized}`);
  }

  console.log("\n💡 スプレッドシートの商品タイトルを Shopify のタイトルに合わせて修正してください。");
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
