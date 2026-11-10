#!/bin/bash
# 容器「啟動時」才執行:此時 volume 已掛載,可以讀到專案檔案。
#
# 可用環境變數:
#   APP_DIR       專案目錄(預設 /app)
#   SKIP_INSTALL  設為 1 則略過 npm ci
#   SKIP_BUILD    設為 1 則略過 npm run build(已有 build/ 時使用)
set -e

APP_DIR="${APP_DIR:-/var/www/sv-chat-ui}"
PROJ_DIR="${PROJ_DIR:-/mnt/yuzhe/projects/sv-chat-ui}"

cd "$PROJ_DIR"

if [ ! -f package.json ]; then
  echo "[entrypoint] 找不到 $PROJ_DIR/package.json，請確認專案已掛載到 $PROJ_DIR" >&2
  exit 1
fi

if [ -z "$ORIGIN" ]; then
  echo "[entrypoint] 警告：未設定 ORIGIN,SvelteKit 的表單 POST 可能被 CSRF 檢查擋下" >&2
fi

# 1) 安裝依賴 (build 需要 devDependencies, 所以不加 --omit=dev)
if [ "${SKIP_INSTALL:-0}" != "1" ] && [ ! -d node_modules ]; then
  echo "[entrypoint] npm ci ..."
  # NODE_ENV 一次性設置，預設是 production 不設置 development 會跳過專案建置 devDependencies。vite、svelte、typescript 等
  NODE_ENV=development npm ci
fi

# 2) 建置 SvelteKit (adapter-node 會輸出到 build/)
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "[entrypoint] npm run build ..."
  npm run build
fi

if [ ! -d build ]; then
  echo "[entrypoint] 找不到 build/，請確認 svelte.config.js 使用 adapter-node" >&2
  exit 1
fi


# 3) 在部署路徑安裝正式環境依賴
mkdir -p "$APP_DIR"
cp -r build package.json package-lock.json .env "$APP_DIR"
cd "$APP_DIR"
npm ci --omit=dev

# 4) 啟動 node 與 nginx;任何一個結束就讓整個容器結束,交給 k8s 重啟
#node build &
#ORIGIN=http://service.com HOST=0.0.0.0 PORT=3000 node --env-file=.env build &
HOST=0.0.0.0 PORT=3000 node --env-file=.env build &

NODE_PID=$!

# 5) 啟動 nginx
nginx -g 'daemon off;' &
NGINX_PID=$!

term() { kill -TERM "$NODE_PID" "$NGINX_PID" 2>/dev/null || true; }
trap term TERM INT

set +e
wait -n
CODE=$?
term
wait
exit "$CODE"
