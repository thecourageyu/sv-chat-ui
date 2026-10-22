import { json } from '@sveltejs/kit';
import { listMemories, deleteMemory } from '$lib/server/db.js';

/** GET /api/memories — list this user's stored long-term memories. */
export function GET({ locals }) {
	return json(listMemories(locals.user.id));
}

/** DELETE /api/memories/:id — remove one memory. */
export function DELETE({ params, locals }) {
	deleteMemory(Number(params.id), locals.user.id);
	return json({ ok: true });
}