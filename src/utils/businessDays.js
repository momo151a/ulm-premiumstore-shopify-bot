"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Tokyo";

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

module.exports = { toJst, formatJpDateTime };
