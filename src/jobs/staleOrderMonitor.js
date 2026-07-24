"use strict";

require("dotenv").config();
const { validate } = require("../config");
validate();

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const holiday_jp = require("@holiday-jp/holiday_jp");
dayjs.extend(utc);
dayjs.extend(timezone);

const { initDb, getDb } = require("../db/init");
const { notifyWarn } = require("../slack/notifier");

const STALE_BUSINESS_DAYS = 3;
const TZ = "Asia/Tokyo";

function isBusinessDay(d) {
  const day = d.day(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  // d の JST 年月日で祝日判定する。d.toDate()（UTC瞬間）を直接渡すと
  // サーバーのTZ・実行時刻によって日付が1日ずれ得るため、JST日付から Date を再構築する。
  const jstDate = new Date(d.year(), d.month(), d.date(), 12);
  if (holiday_jp.isHoliday(jstDate)) return false;
  return true;
}

function subtractBusinessDays(from, n) {
  let d = from.clone();
  let remaining = n;
  while (remaining > 0) {
    d = d.subtract(1, "day");
    if (isBusinessDay(d)) remaining--;
  }
  return d;
}

async function run() {
  initDb();
  const cutoff = subtractBusinessDays(dayjs().tz(TZ), STALE_BUSINESS_DAYS).toISOString();

  const db = getDb();
  const stale = db.prepare(`
    SELECT vo.id, vo.vendor_name, vo.email_sent_at, o.order_number, o.slack_thread_ts
    FROM vendor_orders vo
    JOIN orders o USING(order_id)
    WHERE vo.status = 'emailed'
      AND vo.email_sent_at IS NOT NULL
      AND vo.email_sent_at < ?
      AND vo.stale_notified_at IS NULL
    ORDER BY vo.email_sent_at ASC
  `).all(cutoff);

  if (stale.length === 0) {
    console.log("[staleOrderMonitor] 未通知の滞留注文なし");
    return;
  }

  const lines = stale.map((r) => {
    const elapsed = dayjs().tz(TZ).diff(dayjs(r.email_sent_at), "day");
    return `• ${r.order_number} / ${r.vendor_name} （${elapsed}日経過, 出荷依頼: ${r.email_sent_at}）`;
  });

  const ts = await notifyWarn(
    `⚠️ 滞留注文 ${stale.length} 件（出荷依頼から${STALE_BUSINESS_DAYS}営業日以上経過・未返信）\n` + lines.join("\n")
  );

  // Slack 通知に成功したもののみ「通知済み」として記録し、再通知を防ぐ
  if (ts === null) {
    console.warn("[staleOrderMonitor] Slack 通知に失敗したため通知済み記録をスキップ（次回再試行）");
    return;
  }
  const notifiedAt = new Date().toISOString();
  const markNotified = db.prepare("UPDATE vendor_orders SET stale_notified_at = ? WHERE id = ?");
  const markAll = db.transaction((rows) => {
    for (const r of rows) markNotified.run(notifiedAt, r.id);
  });
  markAll(stale);

  console.log(`[staleOrderMonitor] ${stale.length} 件を通知し、通知済みとして記録`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error("[staleOrderMonitor] 実行失敗:", err);
    process.exit(1);
  });
}

module.exports = { run, isBusinessDay, subtractBusinessDays, STALE_BUSINESS_DAYS };
