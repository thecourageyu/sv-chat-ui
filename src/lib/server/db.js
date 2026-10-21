import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

const file = env.DB_PATH || 'data/app.db';
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
