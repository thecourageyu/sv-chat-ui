import { json, error } from '@sveltejs/kit';
import { listSummaries } from '$lib/server/db.js';
import { upsertSummary } from '$lib/server/memory.js';

/** GET /api/summaries — list this user's stored summaries. */
export function GET({ locals }) {
	return json(listSummaries(locals.user.id));
}

/** POST /api/summaries — create (or update when `id` is set) a summary. */
export async function POST({ request, locals }) {
	const body = await request.json().catch(() => ({}));
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) error(400, 'Summary content is required');

	const id = body.id == null ? null : Number(body.id);
	const chatId = typeof body.chatId === 'string' ? body.chatId : null;
	const createdAt = body.createdAt == null ? null : Number(body.createdAt);

	const newId = await upsertSummary(locals.user.id, chatId, content, id, createdAt);
	return json({ id: newId }, { status: id == null ? 201 : 200 });
}