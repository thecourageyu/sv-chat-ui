import { json, error } from '@sveltejs/kit';
import { deleteMemory } from '$lib/server/db.js';

/** DELETE /api/memories/:id — remove one memory (and its vector row). */
export function DELETE({ params, locals }) {
	deleteMemory(Number(params.id), locals.user.id);
	return json({ ok: true });
}