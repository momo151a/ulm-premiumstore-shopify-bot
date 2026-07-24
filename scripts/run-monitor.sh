#!/usr/bin/env bash
# 滞留注文モニターを cron から実行するためのラッパー。
#
# 本番（ConoHa Ubuntu / NodeSource 版 node = /usr/bin/node）での crontab 例
# （平日 9:30 JST に実行、ログを追記）:
#   TZ=Asia/Tokyo
#   30 9 * * 1-5 /home/ubuntu/cocre-bot/scripts/run-monitor.sh >> /home/ubuntu/cocre-bot/data/monitor.log 2>&1
#
# 重要: better-sqlite3 はネイティブモジュールのため、ここで使う node は
#       `npm install` でビルドしたときと同じ Node バージョンでなければならない。
#       nvm 等でのバージョン切り替えは ABI 不一致を招くので行わない。
set -euo pipefail

# このスクリプトの場所から bot ディレクトリを解決（cron の CWD に依存しない）
BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BOT_DIR"

# cron の最小 PATH でも NodeSource 版 node を見つけられるよう、標準の設置先を補う。
# （node のバージョンは切り替えず、システムにインストールされたものをそのまま使う）
export PATH="/usr/local/bin:/usr/bin:$PATH"

# node が見つからなければ明確に失敗させる（cron のログに理由を残す）
if ! command -v node >/dev/null 2>&1; then
  echo "[run-monitor] node が見つかりません。PATH を確認してください: $PATH" >&2
  exit 127
fi

exec npm run --silent monitor
