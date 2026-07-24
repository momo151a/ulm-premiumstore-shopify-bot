"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { config } = require("../config");
const { getOrdersOverview, getStats, getOrderDetail } = require("./dashboardData");

const router = express.Router();

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Basic 認証。DASHBOARD_USER / DASHBOARD_PASSWORD 未設定時は 503（機能無効）
function auth(req, res, next) {
  const U = config.dashboardUser;
  const P = config.dashboardPassword;
  if (!U || !P) {
    return res
      .status(503)
      .send("ダッシュボードは未設定です（.env に DASHBOARD_USER / DASHBOARD_PASSWORD を設定してください）");
  }

  const header = req.headers.authorization || "";
  const m = header.match(/^Basic (.+)$/);
  if (m) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const u = idx >= 0 ? decoded.slice(0, idx) : decoded;
    const p = idx >= 0 ? decoded.slice(idx + 1) : "";
    // 短絡評価を避けるため両方を評価してから AND
    const okU = safeEqual(u, U);
    const okP = safeEqual(p, P);
    if (okU && okP) return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Cocre Dashboard", charset="UTF-8"');
  return res.status(401).send("認証が必要です");
}

router.get("/dashboard", auth, (_req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

router.get("/api/overview", auth, (_req, res) => {
  try {
    res.json({ stats: getStats(), orders: getOrdersOverview() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/orders/:id", auth, (req, res) => {
  try {
    const detail = getOrderDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "注文が見つかりません" });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { dashboardRouter: router };
