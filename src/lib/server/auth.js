import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const DAY = 60 * 60 * 24;
const SESSION_DAYS = 30;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function getUserBySession(token) {
	const row = db
		.prepare(
			`SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.token_hash = ? AND s.expires_at > unixepoch()`
		)
		.get(sha(token));
	return row ?? null;
}

export function startSession(userId, cookies, url) {
	const token = crypto.randomBytes(32).toString('base64url');
	db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()').run();
	db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, unixepoch() + ?)').run(
		sha(token),
		userId,
		SESSION_DAYS * DAY
	);
	cookies.set('session', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: SESSION_DAYS * DAY
	});
}

export function endSession(cookies) {
	const token = cookies.get('session');
	if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
	cookies.delete('session', { path: '/' });
}

export function createUser(email, password) {
	const hash = bcrypt.hashSync(password, 12);
	const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
	return Number(info.lastInsertRowid);
}

export function verifyUser(email, password) {
	const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
	// compare against a dummy hash when the user is missing to keep timing similar
	const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
	const ok = bcrypt.compareSync(password, hash);
	return ok && user ? user.id : null;
}
