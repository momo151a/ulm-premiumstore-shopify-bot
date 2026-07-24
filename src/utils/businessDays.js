"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const holiday_jp = require("@holiday-jp/holiday_jp");

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Tokyo";
const STALE_BUSINESS_DAYS = 3;

function toJst(utcString) {
  return dayjs(utcString).tz(TZ);
}

function formatJpDateTime(date) {
  const d = dayjs.isDayjs(date) ? date : dayjs(date).tz(TZ);
  const y = d.year();
  const mo = String(d.month() + 1).padStart(2, "0");
  const day = String(d.date()).padStart(2, "0");
  const h = String(d.hour()).padStart(2, "0");
  const m = String(d.minute()).padStart(2, "0");
  return `${y}年${mo}月${day}日 ${h}時${m}分`;
}

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

module.exports = {
  TZ,
  STALE_BUSINESS_DAYS,
  toJst,
  formatJpDateTime,
  isBusinessDay,
  subtractBusinessDays,
};
