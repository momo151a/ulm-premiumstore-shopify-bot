# アーバンライフメトロ・プレミアムストア 受注自動化ボット

Shopify 注文を受け取り、ベンダーへの出荷依頼メールと顧客への発送通知メールを自動送信する Node.js サーバーです。

## 機能

- Shopify Webhook（注文作成）を受信し、ベンダーごとに出荷依頼メールを送信
- Google Sheets のベンダー・商品マスタを参照してベンダーを自動特定
- ベンダーが Google Form から発送報告を送信すると顧客に発送通知メールを送信
- 複数ベンダーがいる場合は部分発送通知→全件完了通知の順に送信
- 遅延報告時は Slack にアラート通知
- 処理状況を Slack スレッドで管理

## 技術スタック

- Node.js / Express
- SQLite（better-sqlite3）
- Google Sheets API（サービスアカウント認証）
- Shopify Admin API（client_credentials）
- Gmail SMTP（nodemailer）
- Slack Web API

## セットアップ

```bash
cd ulm-premiumstore-shopify-bot
npm install
cp .env.example .env
# .env を編集して各種認証情報を設定
```

サービスアカウントの JSON キーを `bot/secrets/service-account.json` に配置してください。

```bash
node server.js
```

## 環境変数

`.env.example` を参照してください。

## ディレクトリ構成

```
bot/
├── server.js             # エントリーポイント
├── src/
│   ├── config.js         # 環境変数の読み込みと検証
│   ├── db/               # SQLite スキーマ・クエリ
│   ├── email/            # メール本文生成・送信
│   ├── shopify/          # Shopify API クライアント
│   ├── slack/            # Slack 通知
│   ├── utils/            # 日付・住所・電話番号のユーティリティ
│   ├── vendor/           # Google Sheets からのベンダーデータ取得
│   └── webhook/          # Shopify・Google Form の Webhook ハンドラー
└── secrets/              # サービスアカウント JSON キー（git 管理外）
knowledge/                # 仕様書・シミュレーション資料
scripts/                  # ドキュメント生成スクリプト
```
