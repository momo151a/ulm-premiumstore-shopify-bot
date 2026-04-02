"use strict";

const nodemailer = require("nodemailer");
const { config } = require("../config");

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.senderEmail,
        pass: config.senderAppPassword,
      },
    });
  }
  return _transporter;
}

async function sendEmail({ to, subject, body }) {
  if (!to || to.length === 0) {
    throw new Error("送信先メールアドレスが指定されていません");
  }
  await getTransporter().sendMail({
    from: `アーバンライフメトロ・プレミアムストア <${config.senderEmail}>`,
    to: to.join(","),
    subject,
    text: body,
  });
}

module.exports = { sendEmail };
