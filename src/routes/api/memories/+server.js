import { json, error } from '@sveltejs/kit';
import { listMemories } from '$lib/server/db.js';
import { upsertMemory } from '$lib/server/memory.js';

/** GET /api/memories — list this user's stored long-term memories. */
export function GET({ locals }) {
	return json(listMemories(locals.user.id));
}

/** POST /api/memories — create (or update when `id` is set) a memory. */
export async function POST({ request, locals }) {
	const body = await request.json().catch(() => ({}));
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) error(400, 'Memory content is required');

	const id = body.id == null ? null : Number(body.id);
	const createdAt = body.createdAt == null ? null : Number(body.createdAt);
	const newId = await upsertMemory(locals.user.id, content, id, null, createdAt);
	return json({ id: newId }, { status: id == null ? 201 : 200 });
}