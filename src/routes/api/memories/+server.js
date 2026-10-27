import { json } from '@sveltejs/kit';
import { listMemories } from '$lib/server/db.js';

/** GET /api/memories — list this user's stored long-term memories. */
export function GET({ locals }) {
	return json(listMemories(locals.user.id));
}