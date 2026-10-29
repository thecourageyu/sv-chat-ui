# Claude-style Chat (SvelteKit + SQLite)

Login, chat sessions, streaming model replies, all stored in SQLite. Includes
chat summarisation and long-term memory with vector search (via [sqlite-vec](https://github.com/asg017/sqlite-vec)).

## Run
```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY (and embedding settings)
npm run dev              # http://localhost:5173
```
Production: `npm run build && node --env-file=.env build`.

## Layout
- `src/lib/server/db.js` – SQLite schema + queries (users, sessions, chats, messages, summaries, memories)
- `src/lib/server/auth.js` – bcrypt passwords, hashed session tokens in an httpOnly cookie
- `src/lib/server/llm.js` – streams from the Anthropic Messages API (or OpenAI)
- `src/lib/server/embeddings.js` – calls your embedding API (spec below)
- `src/lib/server/memory.js` – summarisation + memory extraction + retrieval
- `src/hooks.server.js` – guards every route; `/api/*` returns 401 when signed out
- `src/routes/login` – sign in / create account (set `ALLOW_REGISTRATION=false` to close sign-ups)
- `src/routes/(app)` – sidebar, home composer, `chat/[id]` session page
- `src/lib/Chat.svelte` – streaming UI, Stop, Retry, markdown rendering, Summarise / Extract buttons

## Summaries & long-term memory
Two manual buttons (bottom of the chat): **Summarise** and **Extract memories**.

- **Summarise** → `POST /api/chats/:id/summarize` — summarises the conversation with the LLM, embeds the summary, and stores it in `chat_summaries` + `summary_vec`.
- **Extract memories** → `POST /api/chats/:id/memories` — extracts durable facts (from the latest summary, or the raw transcript), embeds each, and stores them in `memories` + `memory_vec`.

On every subsequent reply, the top-K most similar memories are retrieved via vector
search and injected into the system prompt (best-effort — a failure never blocks the reply).

## Embedding API spec
Your embedding server must expose one endpoint:

```
POST {EMBEDDING_BASE_URL}/v1/embeddings
content-type: application/json
authorization: Bearer {EMBEDDING_API_KEY}   # header omitted when no key is set

Request:  { "input": string | string[], "model": string }
Response: { "data": [ { "index": number, "embedding": number[] }, ... ] }
```

- `input` may be a single string or an array; `data` must have one entry per input.
- `EMBEDDING_DIM` in `.env` must match your model's output dimension (it fixes the vec0 vector column at first creation).

## API (cookie auth)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/chats` | list chats |
| POST | `/api/chats` | create `{content?}` |
| GET / PATCH / DELETE | `/api/chats/:id` | read / rename `{title}` / delete |
| POST | `/api/chats/:id/messages` | send `{content?}`, streams the reply as text |
| POST | `/api/chats/:id/summarize` | summarise the chat + store summary embedding |
| POST | `/api/chats/:id/memories` | extract + store long-term memories |
| GET | `/api/memories` | list stored memories |
| DELETE | `/api/memories/:id` | delete one memory |


## 安裝並設置 Nginx (Ubuntu / Debian)

- 1. 安裝
```
sudo apt update
sudo apt install -y nginx
```
- 2-1. 啟動並設為開機自動執行，看到 active (running) 就表示成功，按 q 離開。
```
sudo systemctl enable --now nginx
sudo systemctl status nginx
```

- 2-2. 若在 k8s 環境 (不會有 systemctl)
``` 
apt update && apt install -y nginx

# 檢查設定
nginx -t

# 啟動（背景模式）
nginx

# 重載設定（取代 systemctl reload nginx）
nginx -s reload

# 停止
nginx -s stop
```

- 3. 本機測試 (應該會看到 HTTP/1.1 200 OK)
```
curl -I http://localhost
```

4. 防火牆（如果有用 ufw）

先放行 SSH，避免把自己鎖在外面：
```
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status
```

5. 外部測試

利用其他裝置開啟 http://你的公網IP，應該會看到 Welcome to nginx 頁面。
看不到的話，通常是路由器或雲端安全群組沒有開放 80 port。

6. 建立網站資料夾與測試頁
```
sudo mkdir -p /var/www/myapp
echo "<h1>Hello from myapp</h1>" | sudo tee /var/www/myapp/index.html
sudo chown -R www-data:www-data /var/www/myapp
```

7. 設置 base path 及打包網頁
```
sudo nano /etc/nginx/sites-available/yzk
```

前端 build 前要加上 base path (若非僅有 domain name)

```vite.config.js
export default defineConfig({
  plugins: [
    sveltekit(),
  ],
  base: '/website/slm-llm-testing/', 
  server: { host: true, allowedHosts: true }
});
```

但 svelteKit 使用 svelte.config.js 設定，vite.config.js 的 base 可以刪除

``` svelte.config.js
export default {
	preprocess: vitePreprocess(),
	kit: { 
		adapter: adapter(),
		paths: {
			base: '/website/slm-llm-testing',   // 開頭有 /，結尾沒有 /
		},
	}
};
```

build 並進行本機驗證
```
npm run build
```

再將 build 目錄搬到 /var/www/slm-llm-testing, /opt/slm-llm-testing, ... (不限制, node 能編譯, nginx location 設定好即可), 

/var/www/slm-llm-testing/
├── build/              ← npm run build 的輸出
├── node_modules/       ← 只裝 production 依賴即可
├── package.json
└── package-lock.json

svelte 還必須將 package.json, package-lock.json 一同打包並重新在該目錄下載依賴的套件

```
sudo mkdir -p /var/www/slm-llm-testing
sudo cp -r build package.json package-lock.json /var/www/slm-llm-testing/
sudo cp .env /var/www/slm-llm-testing/
cd /var/www/slm-llm-testing
sudo npm ci --omit=dev
```

node 實際上只收到 nginx 轉過來的請求，如 http://127.0.0.1:3000，不知道外面用戶是用 ORIGIN 連進來的。

瀏覽器訪問 http://localhost:3000 測試
ORIGIN=http://localhost:3000 HOST=127.0.0.1 PORT=3000 node --env-file=.env build

瀏覽器訪問 http://service.com 測試
ORIGIN=http://service.com HOST=0.0.0.0 PORT=3000 node --env-file=.env build

不寫死 ORIGIN
PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host node build

7. 建立網站設定檔（先只做 HTTP，HTTPS 之後再加）

```nginx /etc/nginx/sites-available/slm-llm-testing
server {
    listen 80;
    server_name service.com;

    # root /var/www/build;
    # index index.html;  # svelteKit 用 node 啟動 非靜態頁面

    location /website/slm-llm-testing/ {
        # try_files $uri $uri/ /index.html;

        proxy_pass http://127.0.0.1:3000;   # 不加結尾斜線，完整路徑原樣傳給 node
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    
}
```

若是 Ingress (k8s) 拿掉前綴, 把前綴補在 proxy_pass, base path 仍然要加

```
server {
    listen 80;
    server_name service.com _;

    # root /var/www/build;
    # index index.html;

    #location /website/slm-llm-testing/ {
    location / {
        # try_files $uri $uri/ /index.html;

        #proxy_pass http://127.0.0.1:3000;   # 不加結尾斜線
        proxy_pass http://127.0.0.1:3000/website/slm-llm-testing/;  # 加結尾斜線 
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

}
```


啟用並重載：

```
sudo ln -s /etc/nginx/sites-available/slm-llm-testing /etc/nginx/sites-enabled/
sudo nginx -s reload
sudo nginx -t
grep -n "sites-enabled\|conf.d" /etc/nginx/nginx.conf
```



- 8. 啟用設定、停用預設站台、重載
```
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```
nginx -t 必須顯示 syntax is ok 和 test is successful，再重載。


9. 驗證

重新整理 http://你的公網IP 或 http://你的網域，應該會看到 Hello from myapp。

- 若要調整 paths.base, 找出哪些檔案內的路徑需要更新
grep -rn 'href="/' src/
grep -rn "goto(" src/
grep -rn "fetch(" src/
grep -rn "redirect(" src/

-
curl -I http://127.0.0.1/website/slm-llm-testing/login

tail -f /var/log/nginx/access.log

nginx -T 2>/dev/null | grep -nE "server_name|listen|location|proxy_pass"