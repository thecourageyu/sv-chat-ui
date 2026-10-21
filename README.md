# Claude-style Chat (SvelteKit + SQLite)

Login, chat sessions, streaming model replies, all stored in SQLite.

## Run
```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY
npm run dev              # http://localhost:5173
```
Production: `npm run build && node --env-file=.env build`.

## Layout
- `src/lib/server/db.js` – SQLite schema + queries (users, sessions, chats, messages)
- `src/lib/server/auth.js` – bcrypt passwords, hashed session tokens in an httpOnly cookie
- `src/lib/server/llm.js` – streams from the Anthropic Messages API
- `src/hooks.server.js` – guards every route; `/api/*` returns 401 when signed out
- `src/routes/login` – sign in / create account (set `ALLOW_REGISTRATION=false` to close sign-ups)
- `src/routes/(app)` – sidebar, home composer, `chat/[id]` session page
- `src/lib/Chat.svelte` – streaming UI, Stop, Retry, markdown rendering

## API (cookie auth)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/chats` | list chats |
| POST | `/api/chats` | create `{content?}` |
| GET / PATCH / DELETE | `/api/chats/:id` | read / rename `{title}` / delete |
| POST | `/api/chats/:id/messages` | send `{content?}`, streams the reply as text |
