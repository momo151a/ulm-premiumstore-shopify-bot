"use strict";

const { config } = require("../config");
const { formatJpDateTime, toJst } = require("../utils/businessDays");

const SEP = "＿".repeat(24);

function composeVendorEmail({ order, vendorInfo, items }) {
  const { orderNumber, createdAtJst, customerName, customerPhone, customerAddress } = order;
  const { brandName, contactName } = vendorInfo;

  const addressee = [brandName, contactName].filter(Boolean).join(" ") + " 様";

  const vendorName = vendorInfo.vendorName;
  const formUrl = `${config.googleFormUrl}?usp=pp_url`
    + `&entry.${config.googleFormEntryOrderNumber}=${encodeURIComponent(orderNumber)}`
    + `&entry.${config.googleFormEntryVendorName}=${encodeURIComponent(vendorName)}`;

  const orderDateStr = formatJpDateTime(toJst(createdAtJst));

  const itemBlocks = items
    .map((item) => {
      const productName = item.variantTitle
        ? `${item.title} - ${item.variantTitle}`
        : item.title;
      const subtotal = Math.round(parseFloat(item.price) * item.quantity);
      return [
        SEP,
        `■ 商品情報`,
        `商品名： 【${productName}】`,
        `数量： 【${item.quantity}個】`,
        `小計： 【¥${subtotal.toLocaleString("ja-JP")}】`,
      ].join("\n");
    })
    .join("\n");

  return `${addressee}

平素より大変お世話になっております。
アーバンライフメトロ・プレミアムストア運営事務局でございます。

新規のご注文がございました。下記内容にてご対応をお願い申し上げます。

■ ご依頼内容

発送の手配をお願いいたします。出荷期限：注文日から3営業日以内

完了後、速やかに下記フォームより情報をご入力ください。
${formUrl}
（出荷日、配送業者、追跡番号）

■ 出荷期限と遅延時のご対応について

円滑な運営のため、以下の点にご協力をお願いいたします。

3営業日以内の出荷が難しい場合
恐れ入りますが、本メール着信後３営業日以内に、発送が難しい旨をフォームにてお知らせください。
${formUrl}

その際、お客様へ個別のご案内のため「遅延の理由」と「出荷予定日」をあわせてご連絡ください。

■ ご注文情報

ご注文番号： 【${orderNumber}】
ご注文日時： 【${orderDateStr}】

${itemBlocks}
${SEP}

■ お届け先情報

お名前： 【${customerName}様】
ご住所： 【${customerAddress}】
お電話番号： 【${customerPhone}】

ご不明な点がございましたら、お早めにご連絡いただけますと幸いです。
本メールは送信専用です。お問合せ、ご質問は下記アドレスへお願いいたします。

何卒よろしくお願い申し上げます。

${SEP}＿＿＿
アーバンライフメトロ・プレミアムストア運営事務局
ulm-store@cocre-lab.co.jp`;
}

function composeCustomerEmail({ order, vendorOrders, type, remainingCount, otherNote }) {
  const { orderNumber, customerName } = order;

  const shippedBlocks = vendorOrders
    .map((v) => {
      const items = _parseItemNames(v.item_names);
      const itemLines = items.length > 0
        ? items.map((i) => {
            const name = i.variantTitle ? `${i.title} - ${i.variantTitle}` : i.title;
            return `・商品名：${name}\n・数量：${i.quantity}点`;
          }).join("\n")
        : "";

      const parts = [];
      if (itemLines) {
        parts.push(itemLines);
        parts.push("");
      }
      parts.push(
        `・発送元事業者名：${v.vendor_name}`,
        `・配送業者：${v.carrier}`,
        `・追跡番号：${v.tracking_number || "（未入力）"}`
      );
      return parts.join("\n");
    })
    .join(`\n\n${SEP}\n\n`);

  const otherNoteBlock = otherNote
    ? `\n■担当者からのご連絡\n\n${otherNote}\n`
    : "";

  const footer = `${SEP}
アーバンライフメトロ・プレミアムストア
https://premium-store.urbanlifemetro.jp/
ご不明な点がございましたら、下記よりお気軽にお問い合わせください。
https://form.run/@ulm-premiumstore-contact`;

  if (type === "partial") {
    return `${customerName} 様

この度は、アーバンライフメトロ・プレミアムストアをご利用いただき、誠にありがとうございます。

ご注文（${orderNumber}）の一部商品が発送されましたのでご連絡いたします。
※複数の商品を同時にご注文いただきました場合には、発送元事業者ごとに発送手続きが完了次第、メールをお送りしております。

${SEP}

■発送済み商品

${shippedBlocks}
${otherNoteBlock}
${SEP}

残り${remainingCount}社の商品につきましては、引き続き手配中でございます。
発送準備が整い次第、改めてご連絡いたします。

${footer}`;
  }

  return `${customerName} 様

この度は、アーバンライフメトロ・プレミアムストアをご利用いただき、誠にありがとうございます。

ご注文（${orderNumber}）の全商品の発送が完了いたしましたのでご連絡いたします。

${SEP}

■発送済み商品

${shippedBlocks}
${otherNoteBlock}
${SEP}

お届けまでしばらくお待ちくださいませ。

今後ともどうぞよろしくお願い申し上げます。

${footer}`;
}

function _parseItemNames(itemNamesJson) {
  try {
    return JSON.parse(itemNamesJson || "[]");
  } catch (_) {
    return [];
  }
}

module.exports = { composeVendorEmail, composeCustomerEmail };
