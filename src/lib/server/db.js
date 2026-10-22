import Database from 'better-sqlite3';
import * as vec from 'sqlite-vec';
import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

const file = env.DB_PATH || 'data/app.db';
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Load the sqlite-vec extension (vector search). Ignore errors on reload.
try {
	vec.load(db);
} catch {}

// sessions: verify user login 
// chats: store conversations of a user
// messages: store each turn of a conversation 

db.exec(`
CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS sessions (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
	role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);

-- Chat summaries: rolling or per-chat summaries. The "kind" column allows both a
-- rolling ('rolling') summary and per-conversation ('chat') summaries to coexist.
CREATE TABLE IF NOT EXISTS chat_summaries (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
	kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('rolling', 'chat')),
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS chat_summaries_user ON chat_summaries(user_id, id);

-- Long-term memories. "source_summary_id" links back to the summary that produced it.
CREATE TABLE IF NOT EXISTS memories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	content TEXT NOT NULL,
	source_summary_id INTEGER REFERENCES chat_summaries(id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS memories_user ON memories(user_id, id);
`);

// Vector tables for the two features. Dimension is fixed at first creation; keep
// EMBEDDING_DIM in .env consistent with your embedding model's output.
const dim = Number(env.EMBEDDING_DIM || 1536);
db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS summary_vec USING vec0(
	summary_id INTEGER PRIMARY KEY,
	embedding FLOAT[${dim}] distance_metric=cosine
);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
	user_id INTEGER,
	memory_id INTEGER PRIMARY KEY,
	embedding FLOAT[${dim}] distance_metric=cosine
);
`);

export const listChats = (userId) =>
	db.prepare('SELECT id, title, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC').all(userId);

export const getChat = (id, userId) =>
	db.prepare('SELECT id, title FROM chats WHERE id = ? AND user_id = ?').get(id, userId);

export const createChat = (id, userId, title) =>
	db.prepare('INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)').run(id, userId, title);

export const renameChat = (id, userId, title) =>
	db.prepare('UPDATE chats SET title = ? WHERE id = ? AND user_id = ?').run(title, id, userId);

export const deleteChat = (id, userId) =>
	db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').run(id, userId);

export const getMessages = (chatId) =>
	db.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id').all(chatId);

export function addMessage(chatId, role, content) {
	db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').run(chatId, role, content);
	db.prepare('UPDATE chats SET updated_at = unixepoch() WHERE id = ?').run(chatId);
}

// ---- Summaries ----

export function saveSummary(userId, chatId, content, kind = 'chat', embedding = null) {
	const chatIdOrNull = kind === 'chat' ? chatId : null;
	const info = db
		.prepare('INSERT INTO chat_summaries (user_id, chat_id, kind, content) VALUES (?, ?, ?, ?)')
		.run(userId, chatIdOrNull, kind, content);
	const id = Number(info.lastInsertRowid);
	if (embedding) upsertSummaryVector(id, embedding);
	return id;
}

export function getLatestSummary(userId, kind = 'chat', chatId = null) {
	if (kind === 'chat') {
		return db
			.prepare('SELECT id, content FROM chat_summaries WHERE user_id = ? AND chat_id = ? AND kind = ? ORDER BY id DESC LIMIT 1')
			.get(userId, chatId, kind);
	}
	return db
		.prepare('SELECT id, content FROM chat_summaries WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1')
		.get(userId, kind);
}

// ---- Memories ----

export function saveMemory(userId, content, sourceSummaryId = null, embedding = null) {
	const info = db
		.prepare('INSERT INTO memories (user_id, content, source_summary_id) VALUES (?, ?, ?)')
		.run(userId, content, sourceSummaryId);
	const id = Number(info.lastInsertRowid);
	if (embedding) upsertMemoryVector(userId, id, embedding);
	return id;
}

export function listMemories(userId, limit = 100) {
	return db.prepare('SELECT id, content, created_at FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
}

export function deleteMemory(id, userId) {
	db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(id, userId);
	db.prepare('DELETE FROM memory_vec WHERE memory_id = ?').run(BigInt(id));
}

/**
 * KNN search over memories for a user. "embedding" must be a number[].
 * Returns rows of { id, content, distance } sorted by cosine distance ascending.
 */
export function searchMemories(userId, embedding, limit = 5) {
	return db
		.prepare(
			`SELECT m.id, m.content, v.distance
			 FROM memory_vec v
			 JOIN memories m ON m.id = v.memory_id
			 WHERE v.embedding MATCH ? AND v.user_id = ? AND k = ?
			 ORDER BY v.distance`
		)
		.all(JSON.stringify(embedding), BigInt(userId), limit);
}

// ---- Vector helpers (embedding is a number[]) ----

function upsertSummaryVector(summaryId, embedding) {
	const id = BigInt(summaryId);
	const vec = JSON.stringify(embedding);
	const existing = db.prepare('SELECT summary_id FROM summary_vec WHERE summary_id = ?').get(id);
	if (existing) {
		db.prepare('UPDATE summary_vec SET embedding = ? WHERE summary_id = ?').run(vec, id);
	} else {
		db.prepare('INSERT INTO summary_vec (summary_id, embedding) VALUES (?, ?)').run(id, vec);
	}
}

function upsertMemoryVector(userId, memoryId, embedding) {
	const id = BigInt(memoryId);
	const vec = JSON.stringify(embedding);
	const existing = db.prepare('SELECT memory_id FROM memory_vec WHERE memory_id = ?').get(id);
	if (existing) {
		db.prepare('UPDATE memory_vec SET embedding = ? WHERE memory_id = ?').run(vec, id);
	} else {
		db.prepare('INSERT INTO memory_vec (user_id, memory_id, embedding) VALUES (?, ?, ?)').run(BigInt(userId), id, vec);
	}
}
