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
