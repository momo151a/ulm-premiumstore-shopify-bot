"use strict";

function toHalfWidth(str) {
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

function normalize(str) {
  if (!str) return "";
  return toHalfWidth(str).trim().replace(/\s+/g, " ").toLowerCase();
}

function includesNormalized(haystack, needle) {
  return normalize(haystack).includes(normalize(needle));
}

function formatAddress(shippingAddress) {
  const {
    country = "日本",
    zip = "",
    province = "",
    city = "",
    address1 = "",
    address2 = "",
  } = shippingAddress || {};
  return `${country} 〒${zip}${province} ${city}${address1}${address2}`.trim();
}

// Shopify は国際形式 +81-XX で来ることがある → 国内形式に変換
function formatPhone(phone) {
  if (!phone) return "";
  return phone.replace(/^\+81[-\s]?/, "0").replace(/[-\s]/g, "-");
}

module.exports = { normalize, includesNormalized, formatAddress, formatPhone };
